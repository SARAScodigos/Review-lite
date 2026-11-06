"""
Servicio de Negocio para la Matriz de Extracción Dinámica en JSONB y Cribado a Texto Completo (Hito 4).
Extrae secciones profundas del PDF con IA optimizando tokens, procesa lotes en paralelo (ThreadPoolExecutor),
permite la edición manual celda por celda y la confirmación por el investigador (Human-in-the-Loop).
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
from typing import Any, Dict, List, Optional, Tuple
import uuid

from fastapi import HTTPException, status
import pandas as pd
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlmodel import Session, select

from app.ai.factory import AIEngineFactory
from app.api.models.article_pdf_model import ArticlePDF, PDFDownloadStatus
from app.api.models.extracted_matrix_model import (
    ExtractedMatrixRow,
    ExtractionReviewStatus,
    ExtractionSourceType,
)
from app.api.models.extracted_record_model import ExtractedRecord
from app.api.models.matrix_custom_column_model import MatrixCustomColumn
from app.api.models.matrix_column_ai_setting_model import MatrixColumnAISetting
from app.api.models.rsl_project_model import RSLProject
from app.api.models.search_result_file_model import SearchResultFile
from app.api.models.screening_model import (
    ProcessStatus,
    ScreeningDecision,
    ScreeningDecisionEnum,
    ScreeningSession,
)
from app.api.services.screening.deduplication_service import (
    generate_article_id,
    get_or_create_screening_session,
)
from app.api.services.pdf_service import resolve_pdf_file_path
from app.api.schemas.matrix_schema import (
    DeleteMatrixRowResponse,
    MatrixWorkbenchCandidateRead,
    MatrixWorkbenchMetricsRead,
    PaginatedMatrixRowsResponse,
    PaginatedMatrixWorkbenchCandidatesResponse,
)
from app.api.services.parsers_pdf import (
    PREDEFINED_MATRIX_COLUMNS,
    extract_text_from_pdf,
    generate_matrix_excel_export,
)
from app.db.session import engine


class AIMatrixExtractionOutput(BaseModel):
    """
    Esquema Pydantic para los campos analíticos profundos extraídos por la IA desde el PDF.
    NO incluye metadatos básicos (título, autores, año, doi, abstract) para ahorrar miles de tokens.
    """

    article_type: Optional[str] = Field(default=None, description="Tipo de artículo (Empírico, Revisión, Teórico, Conferencia, etc.)")
    general_objectives: Optional[str] = Field(default=None, description="Objetivos generales planteados en el estudio")
    keywords: Optional[str] = Field(default=None, description="Descriptores o palabras clave principales")
    introduction: Optional[str] = Field(default=None, description="Síntesis del planteamiento del problema e introducción")
    theoretical_background: Optional[str] = Field(default=None, description="Fundamentación teórica y marcos de referencia")
    methodology: Optional[str] = Field(default=None, description="Metodología aplicada")
    design: Optional[str] = Field(default=None, description="Diseño metodológico (Experimental, Descriptivo, Correlacional, etc.)")
    population_sample: Optional[str] = Field(default=None, description="Población, Muestra y Muestreo utilizado")
    results: Optional[str] = Field(default=None, description="Hallazgos y resultados principales")
    discussion: Optional[str] = Field(default=None, description="Discusión de hallazgos frente a otros autores")
    conclusions: Optional[str] = Field(default=None, description="Conclusiones principales")
    relevance_to_rsl_title: Optional[str] = Field(default=None, description="Justificación de la relación del estudio con el título del proyecto RSL")

    is_fulltext_included: bool = Field(..., description="Recomendación de la IA si el texto completo debe incluirse en la RSL")
    fulltext_reasoning: str = Field(..., description="Evaluación sintética de recomendación de texto completo")
    custom_values: Dict[str, Optional[str]] = Field(default_factory=dict, description="Valores de las columnas personalizadas solicitadas")


def _matrix_candidate_statement(db: Session, project_id: uuid.UUID):
    """Construye la consulta de artículos únicos que alcanzaron la mesa de texto completo."""
    session_obj = get_or_create_screening_session(db, project_id)
    return (
        select(ScreeningDecision, ExtractedRecord, SearchResultFile, ArticlePDF, ExtractedMatrixRow)
        .join(ExtractedRecord, ScreeningDecision.record_id == ExtractedRecord.id)
        .join(SearchResultFile, ExtractedRecord.file_id == SearchResultFile.id)
        .outerjoin(
            ArticlePDF,
            (ArticlePDF.project_id == project_id) & (ArticlePDF.record_id == ExtractedRecord.id),
        )
        .outerjoin(
            ExtractedMatrixRow,
            (ExtractedMatrixRow.project_id == project_id) & (ExtractedMatrixRow.record_id == ExtractedRecord.id),
        )
        .where(SearchResultFile.project_id == project_id)
        .where(ScreeningDecision.screening_session_id == session_obj.id)
        .where(ScreeningDecision.is_duplicate == False)
        .where(ScreeningDecision.title_status.in_([ScreeningDecisionEnum.INCLUDED, ScreeningDecisionEnum.MAYBE]))
        .where(ScreeningDecision.abstract_status.in_([ScreeningDecisionEnum.PENDING, ScreeningDecisionEnum.INCLUDED]))
    )


def get_matrix_custom_columns(db: Session, project_id: uuid.UUID) -> List[MatrixCustomColumn]:
    return db.exec(
        select(MatrixCustomColumn)
        .where(MatrixCustomColumn.project_id == project_id)
        .order_by(MatrixCustomColumn.position, MatrixCustomColumn.name)
    ).all()


def get_matrix_column_names(db: Session, project_id: uuid.UUID) -> List[str]:
    return list(PREDEFINED_MATRIX_COLUMNS) + [column.name for column in get_matrix_custom_columns(db, project_id)]


MATRIX_AI_EXTRACTABLE_COLUMNS = PREDEFINED_MATRIX_COLUMNS[6:]


def _get_ai_settings(db: Session, project_id: uuid.UUID) -> Dict[str, bool]:
    return {
        setting.column_name: setting.include_in_ai
        for setting in db.exec(
            select(MatrixColumnAISetting).where(
                MatrixColumnAISetting.project_id == project_id
            )
        ).all()
    }


def get_matrix_columns_for_frontend(db: Session, project_id: uuid.UUID) -> List[Dict[str, Any]]:
    custom_columns = synchronize_project_matrix_schema(db, project_id)
    settings = _get_ai_settings(db, project_id)
    result: List[Dict[str, Any]] = []

    for position, name in enumerate(PREDEFINED_MATRIX_COLUMNS):
        is_ai_extractable = name in MATRIX_AI_EXTRACTABLE_COLUMNS
        result.append(
            {
                "id": None,
                "project_id": project_id,
                "name": name,
                "position": position,
                "is_predefined": True,
                "is_ai_extractable": is_ai_extractable,
                "include_in_ai": settings.get(name, True) if is_ai_extractable else False,
            }
        )

    for custom_column in custom_columns:
        result.append(
            {
                "id": custom_column.id,
                "project_id": project_id,
                "name": custom_column.name,
                "position": len(PREDEFINED_MATRIX_COLUMNS) + custom_column.position,
                "is_predefined": False,
                "is_ai_extractable": True,
                "include_in_ai": settings.get(custom_column.name, True),
            }
        )

    return result


def set_matrix_column_ai_inclusion(
    db: Session,
    project_id: uuid.UUID,
    name: str,
    include_in_ai: bool,
) -> Dict[str, Any]:
    columns = get_matrix_columns_for_frontend(db, project_id)
    column = next((item for item in columns if item["name"] == name), None)
    if not column:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la columna de matriz.")
    if not column["is_ai_extractable"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Esta columna proviene de metadatos y no se procesa con IA.",
        )

    setting = db.exec(
        select(MatrixColumnAISetting)
        .where(MatrixColumnAISetting.project_id == project_id)
        .where(MatrixColumnAISetting.column_name == name)
    ).first()
    if setting:
        setting.include_in_ai = include_in_ai
    else:
        setting = MatrixColumnAISetting(
            project_id=project_id,
            column_name=name,
            include_in_ai=include_in_ai,
        )
    db.add(setting)
    db.commit()
    column["include_in_ai"] = include_in_ai
    return column


def get_ai_included_matrix_columns(db: Session, project_id: uuid.UUID) -> List[str]:
    return [
        column["name"]
        for column in get_matrix_columns_for_frontend(db, project_id)
        if column["is_ai_extractable"] and column["include_in_ai"]
    ]


def _normalize_matrix_data(data: Dict[str, Any], columns: List[str]) -> Dict[str, Any]:
    return {column: data.get(column) for column in columns}


def synchronize_project_matrix_schema(db: Session, project_id: uuid.UUID) -> List[MatrixCustomColumn]:
    """Conserva un esquema único por proyecto y migra claves JSONB heredadas a columnas."""
    project = db.get(RSLProject, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="El proyecto RSL no existe.")

    rows = db.exec(
        select(ExtractedMatrixRow).where(ExtractedMatrixRow.project_id == project_id)
    ).all()
    custom_columns = get_matrix_custom_columns(db, project_id)
    known_columns = set(PREDEFINED_MATRIX_COLUMNS) | {column.name for column in custom_columns}
    legacy_columns: List[str] = []

    for row in rows:
        for key in (row.extraction_data or {}).keys():
            if key not in known_columns and key not in legacy_columns:
                legacy_columns.append(key)

    for name in legacy_columns:
        column = MatrixCustomColumn(
            project_id=project_id,
            name=name,
            position=len(custom_columns),
        )
        custom_columns.append(column)
        known_columns.add(name)
        db.add(column)

    columns = list(PREDEFINED_MATRIX_COLUMNS) + [column.name for column in custom_columns]
    changed = bool(legacy_columns)
    for row in rows:
        normalized_data = _normalize_matrix_data(row.extraction_data or {}, columns)
        if row.extraction_data != normalized_data:
            row.extraction_data = normalized_data
            db.add(row)
            changed = True

    if changed:
        db.commit()

    return custom_columns


def create_matrix_custom_column(db: Session, project_id: uuid.UUID, name: str) -> MatrixCustomColumn:
    clean_name = name.strip()
    if not clean_name or clean_name in PREDEFINED_MATRIX_COLUMNS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El nombre de columna no es válido o ya es una columna estándar.")
    synchronize_project_matrix_schema(db, project_id)
    if db.exec(select(MatrixCustomColumn).where(MatrixCustomColumn.project_id == project_id).where(MatrixCustomColumn.name == clean_name)).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="La columna ya existe en esta matriz.")

    position = len(get_matrix_custom_columns(db, project_id))
    column = MatrixCustomColumn(project_id=project_id, name=clean_name, position=position)
    db.add(column)
    for row in db.exec(select(ExtractedMatrixRow).where(ExtractedMatrixRow.project_id == project_id)).all():
        row.extraction_data = {**(row.extraction_data or {}), clean_name: None}
        db.add(row)
    db.commit()
    db.refresh(column)
    return column


def update_matrix_custom_column(db: Session, project_id: uuid.UUID, column_id: uuid.UUID, name: Optional[str], position: Optional[int]) -> MatrixCustomColumn:
    synchronize_project_matrix_schema(db, project_id)
    column = db.get(MatrixCustomColumn, column_id)
    if not column or column.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la columna de matriz.")
    if name is not None:
        new_name = name.strip()
        if not new_name or new_name in PREDEFINED_MATRIX_COLUMNS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El nombre de columna no es válido.")
        duplicate = db.exec(select(MatrixCustomColumn).where(MatrixCustomColumn.project_id == project_id).where(MatrixCustomColumn.name == new_name).where(MatrixCustomColumn.id != column_id)).first()
        if duplicate:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="La columna ya existe en esta matriz.")
        old_name = column.name
        column.name = new_name
        setting = db.exec(
            select(MatrixColumnAISetting)
            .where(MatrixColumnAISetting.project_id == project_id)
            .where(MatrixColumnAISetting.column_name == old_name)
        ).first()
        if setting:
            setting.column_name = new_name
            db.add(setting)
        for row in db.exec(select(ExtractedMatrixRow).where(ExtractedMatrixRow.project_id == project_id)).all():
            data = dict(row.extraction_data or {})
            data[new_name] = data.pop(old_name, None)
            row.extraction_data = data
            db.add(row)
    if position is not None:
        columns = get_matrix_custom_columns(db, project_id)
        target_position = min(position, len(columns) - 1)
        columns.remove(column)
        columns.insert(target_position, column)
        for index, item in enumerate(columns):
            item.position = index
            db.add(item)
    db.add(column)
    db.commit()
    db.refresh(column)
    return column


def delete_matrix_custom_column(db: Session, project_id: uuid.UUID, column_id: uuid.UUID) -> None:
    synchronize_project_matrix_schema(db, project_id)
    column = db.get(MatrixCustomColumn, column_id)
    if not column or column.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la columna de matriz.")
    for row in db.exec(select(ExtractedMatrixRow).where(ExtractedMatrixRow.project_id == project_id)).all():
        data = dict(row.extraction_data or {})
        data.pop(column.name, None)
        row.extraction_data = data
        db.add(row)
    setting = db.exec(
        select(MatrixColumnAISetting)
        .where(MatrixColumnAISetting.project_id == project_id)
        .where(MatrixColumnAISetting.column_name == column.name)
    ).first()
    if setting:
        db.delete(setting)
    db.delete(column)
    for index, item in enumerate(
        item for item in get_matrix_custom_columns(db, project_id) if item.id != column_id
    ):
        item.position = index
        db.add(item)
    db.commit()


def build_matrix_system_instruction() -> str:
    """Construye la instrucción científica para la extracción analítica profunda."""
    return (
        "Eres un analista de investigación científica experto encargado de la extracción profunda de datos desde el texto completo en PDF para una Revisión Sistemática de la Literatura (RSL).\n"
        "Tu tarea es analizar el texto del PDF y extraer las 12 dimensiones analíticas del estudio.\n"
        "REGLAS:\n"
        "1. Resume con rigor científico en español cada sección solicitada.\n"
        "2. Proporciona una recomendación de inclusión o exclusión a texto completo (is_fulltext_included: true/false).\n"
        "Debes responder estrictamente en formato JSON."
    )


def build_matrix_user_prompt(
    project: RSLProject,
    record: ExtractedRecord,
    pdf_text: str,
    ai_columns: List[str],
) -> str:
    """Construye el prompt enlazando el proyecto RSL y el texto del PDF."""
    variables_str = ", ".join(project.variables) if project.variables else "No especificadas"

    return (
        f"PROYECTO DE REVISIÓN SISTEMÁTICA:\n"
        f"- Título del Proyecto: {project.title}\n"
        f"- Variables de Estudio: {variables_str}\n\n"
        f"METADATOS DEL ARTÍCULO:\n"
        f"- Título: {record.title or 'Sin título'}\n"
        f"- Autores: {record.authors or 'Sin autores'}\n"
        f"- Año: {record.publication_year or 'No especificado'}\n"
        f"- DOI: {record.doi or 'Sin DOI'}\n\n"
        f"COLUMNAS DE MATRIZ A EXTRAER CON IA: {ai_columns or 'Ninguna'}\n"
        "Extrae únicamente esas columnas. Para las columnas personalizadas incluidas, usa exactamente sus nombres como claves en custom_values; usa null si el PDF no aporta el dato.\n\n"
        f"TEXTO EXTRAÍDO DEL PDF:\n"
        f"{pdf_text}\n\n"
        f"Extrae las 12 dimensiones analíticas y evalúa el texto completo."
    )


def extract_matrix_row_for_record(
    db: Session,
    project_id: uuid.UUID,
    record_id: uuid.UUID,
    provider: str = "deepseek",
    model: str = "deepseek-v4-pro",
    temperature: float = 0.1,
) -> ExtractedMatrixRow:
    """
    Ejecuta la extracción de matriz mediante IA sobre un artículo que tiene su archivo PDF descargado o subido.
    Puebla directamente los campos básicos de metadatos desde la BD (ahorro de tokens)
    y consulta a la IA para obtener las 12 secciones profundas.
    Deja la decisión en estado borrador (DRAFT) para que el investigador la confirme en la UI (Human-in-the-loop).
    """
    project = db.get(RSLProject, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="El proyecto RSL no existe.")

    record = db.exec(
        select(ExtractedRecord)
        .join(SearchResultFile, ExtractedRecord.file_id == SearchResultFile.id)
        .where(ExtractedRecord.id == record_id)
        .where(SearchResultFile.project_id == project_id)
    ).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="El artículo no existe.")

    pdf_entry = db.exec(
        select(ArticlePDF)
        .where(ArticlePDF.project_id == project_id)
        .where(ArticlePDF.record_id == record_id)
    ).first()

    if not pdf_entry or not pdf_entry.file_path or pdf_entry.download_status not in (PDFDownloadStatus.DOWNLOADED, PDFDownloadStatus.MANUALLY_UPLOADED):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede extraer la matriz. El artículo no cuenta con un archivo PDF descargado o subido en el servidor.",
        )

    # 1. Extraer texto plano del PDF con pypdf
    try:
        pdf_path = resolve_pdf_file_path(pdf_entry.file_path)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La ruta del PDF almacenada no es válida.",
        ) from exc

    pdf_text = extract_text_from_pdf(pdf_path)
    if not pdf_text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No se pudo extraer texto legible del archivo PDF (puede ser un escaneo de imagen sin OCR).",
        )

    # 2. Consultar al motor de IA
    ai = AIEngineFactory.get_provider(provider=provider, model=model)
    system_instruction = build_matrix_system_instruction()
    ai_columns = get_ai_included_matrix_columns(db, project_id)
    custom_columns = [
        column.name
        for column in get_matrix_custom_columns(db, project_id)
        if column.name in ai_columns
    ]
    prompt = build_matrix_user_prompt(project, record, pdf_text, ai_columns)

    ai_result: AIMatrixExtractionOutput = ai.generate_structured(
        prompt=prompt,
        schema=AIMatrixExtractionOutput,
        system_instruction=system_instruction,
        temperature=temperature,
    )

    article_cid = generate_article_id(record.title, record.authors)

    # 3. Ensamblar las 18 columnas de la matriz en JSONB (Ahorro masivo de tokens)
    extraction_json = {
        "ID": article_cid,
        "Año de publicación": record.publication_year,
        "Título": record.title,
        "DOI": record.doi,
        "Autor(es)": record.authors,
        "Abstract": record.abstract,
        "Tipo de artículo": ai_result.article_type if "Tipo de artículo" in ai_columns else None,
        "Objetivos generales": ai_result.general_objectives if "Objetivos generales" in ai_columns else None,
        "Palabras clave": ai_result.keywords if "Palabras clave" in ai_columns else None,
        "Introducción": ai_result.introduction if "Introducción" in ai_columns else None,
        "Fundamentación Teórica": ai_result.theoretical_background if "Fundamentación Teórica" in ai_columns else None,
        "Metodología": ai_result.methodology if "Metodología" in ai_columns else None,
        "Diseño": ai_result.design if "Diseño" in ai_columns else None,
        "Población Muestra y Muestreo": ai_result.population_sample if "Población Muestra y Muestreo" in ai_columns else None,
        "Resultados": ai_result.results if "Resultados" in ai_columns else None,
        "Discusión": ai_result.discussion if "Discusión" in ai_columns else None,
        "Conclusiones": ai_result.conclusions if "Conclusiones" in ai_columns else None,
        "Relación con el título de investigación": ai_result.relevance_to_rsl_title if "Relación con el título de investigación" in ai_columns else None,
    }
    extraction_json.update({column: ai_result.custom_values.get(column) for column in custom_columns})
    # El esquema puede haber cambiado mientras la IA procesaba el PDF.
    extraction_json = _normalize_matrix_data(extraction_json, get_matrix_column_names(db, project_id))

    # 4. Guardar o actualizar la fila de la matriz ExtractedMatrixRow (DRAFT)
    existing_row = db.exec(
        select(ExtractedMatrixRow)
        .where(ExtractedMatrixRow.project_id == project_id)
        .where(ExtractedMatrixRow.record_id == record_id)
    ).first()

    if existing_row:
        existing_row.extraction_data = extraction_json
        existing_row.source_type = ExtractionSourceType.AI_GENERATED
        existing_row.article_custom_id = article_cid
        existing_row.review_status = ExtractionReviewStatus.DRAFT
        matrix_row = existing_row
    else:
        matrix_row = ExtractedMatrixRow(
            project_id=project_id,
            record_id=record_id,
            source_type=ExtractionSourceType.AI_GENERATED,
            article_custom_id=article_cid,
            extraction_data=extraction_json,
            review_status=ExtractionReviewStatus.DRAFT,
        )

    db.add(matrix_row)

    # 5. Registrar recomendación borrador en ScreeningDecision (Human-in-the-Loop)
    session_obj = get_or_create_screening_session(db, project_id)
    decision = db.exec(
        select(ScreeningDecision)
        .where(ScreeningDecision.screening_session_id == session_obj.id)
        .where(ScreeningDecision.record_id == record_id)
    ).first()

    if decision:
        recom_str = "RECOMENDADO INCLUIR" if ai_result.is_fulltext_included else "RECOMENDADO EXCLUIR"
        decision.fulltext_status = (
            ScreeningDecisionEnum.INCLUDED
            if ai_result.is_fulltext_included
            else ScreeningDecisionEnum.EXCLUDED
        )
        decision.final_decision = ScreeningDecisionEnum.PENDING
        decision.fulltext_reason = f"[{provider.upper()} - {model}] ({recom_str}): {ai_result.fulltext_reasoning}"
        db.add(decision)

    db.commit()
    db.refresh(matrix_row)
    return matrix_row


def run_batch_matrix_extraction_pipeline(
    db: Session,
    project_id: uuid.UUID,
    provider: str = "deepseek",
    model: str = "deepseek-v4-pro",
    temperature: float = 0.1,
    max_workers: int = 5,
) -> Dict[str, int]:
    """
    Ejecuta el pipeline de extracción masiva de matrices en segundo plano con Celery y ThreadPoolExecutor (5 hilos paralelos).
    """
    project = db.get(RSLProject, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="El proyecto RSL no existe.")

    # Buscar PDFs disponibles y artículos que siguen aptos para texto completo.
    session_obj = get_or_create_screening_session(db, project_id)
    pdfs = db.exec(
        select(ArticlePDF)
        .join(ScreeningDecision, ScreeningDecision.record_id == ArticlePDF.record_id)
        .outerjoin(
            ExtractedMatrixRow,
            (ExtractedMatrixRow.project_id == project_id) & (ExtractedMatrixRow.record_id == ArticlePDF.record_id),
        )
        .where(ArticlePDF.project_id == project_id)
        .where(ArticlePDF.download_status.in_([PDFDownloadStatus.DOWNLOADED, PDFDownloadStatus.MANUALLY_UPLOADED]))
        .where(ScreeningDecision.screening_session_id == session_obj.id)
        .where(ScreeningDecision.is_duplicate == False)
        .where(ScreeningDecision.title_status.in_([ScreeningDecisionEnum.INCLUDED, ScreeningDecisionEnum.MAYBE]))
        .where(ScreeningDecision.abstract_status.in_([ScreeningDecisionEnum.PENDING, ScreeningDecisionEnum.INCLUDED]))
        .where(
            (ExtractedMatrixRow.id == None)
            | (ExtractedMatrixRow.review_status == ExtractionReviewStatus.DRAFT)
        )
    ).all()

    if not pdfs:
        return {"processed": 0, "errors": 0}

    record_ids = [p.record_id for p in pdfs]
    processed_count = 0
    error_count = 0

    def _worker_extract(rec_id: uuid.UUID):
        with Session(engine) as sess:
            return extract_matrix_row_for_record(
                db=sess,
                project_id=project_id,
                record_id=rec_id,
                provider=provider,
                model=model,
                temperature=temperature,
            )

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_id = {executor.submit(_worker_extract, r_id): r_id for r_id in record_ids}

        for future in as_completed(future_to_id):
            try:
                future.result()
                processed_count += 1
            except Exception:
                error_count += 1

    return {"processed": processed_count, "errors": error_count}


def update_matrix_row_cells(
    db: Session,
    project_id: uuid.UUID,
    row_id: uuid.UUID,
    extraction_data: Dict[str, Any],
    review_status: Optional[ExtractionReviewStatus] = None,
) -> ExtractedMatrixRow:
    """
    Permite al investigador editar celda por celda cualquier campo de la matriz en formato JSONB.
    """
    row = db.get(ExtractedMatrixRow, row_id)
    if not row or row.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la fila de la matriz.")

    row.extraction_data = _normalize_matrix_data(extraction_data, get_matrix_column_names(db, project_id))
    if review_status:
        row.review_status = review_status

    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def patch_matrix_row_cells(
    db: Session,
    project_id: uuid.UUID,
    row_id: uuid.UUID,
    extraction_data_patch: Dict[str, Any],
    review_status: Optional[ExtractionReviewStatus] = None,
) -> ExtractedMatrixRow:
    """Aplica cambios parciales a una fila sin descartar las demás celdas JSONB."""
    row = db.get(ExtractedMatrixRow, row_id)
    if not row or row.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la fila de la matriz.")

    row.extraction_data = _normalize_matrix_data(
        {**(row.extraction_data or {}), **extraction_data_patch},
        get_matrix_column_names(db, project_id),
    )
    if review_status:
        row.review_status = review_status

    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def create_manual_matrix_row(
    db: Session,
    project_id: uuid.UUID,
    article_custom_id: Optional[str],
    extraction_data: Dict[str, Any],
    review_status: ExtractionReviewStatus,
) -> ExtractedMatrixRow:
    """Crea una fila manual desacoplada, sin requerir un registro extraído ni un PDF."""
    project = db.get(RSLProject, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="El proyecto RSL no existe.")

    row = ExtractedMatrixRow(
        project_id=project_id,
        record_id=None,
        source_type=ExtractionSourceType.MANUAL_SCREENING,
        article_custom_id=article_custom_id or None,
        extraction_data=_normalize_matrix_data(extraction_data, get_matrix_column_names(db, project_id)),
        review_status=review_status,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def delete_matrix_row(
    db: Session,
    project_id: uuid.UUID,
    row_id: uuid.UUID,
) -> DeleteMatrixRowResponse:
    """Elimina una fila de matriz sin modificar la decisión de texto completo del artículo."""
    row = db.get(ExtractedMatrixRow, row_id)
    if not row or row.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la fila de la matriz.")

    db.delete(row)
    db.commit()
    return DeleteMatrixRowResponse(row_id=row_id)


def get_matrix_workbench_candidates_paginated(
    db: Session,
    project_id: uuid.UUID,
    skip: int = 0,
    limit: int = 100,
) -> PaginatedMatrixWorkbenchCandidatesResponse:
    """Lista paginada para controlar PDF, extracción y decisión a texto completo."""
    rows_statement = _matrix_candidate_statement(db, project_id).order_by(
        ExtractedRecord.created_at,
        ExtractedRecord.id,
    )
    count_row = db.exec(rows_statement.with_only_columns(func.count()).order_by(None)).one()
    total = int(count_row[0])
    rows = db.exec(rows_statement.offset(skip).limit(limit)).all()
    items = []
    for position, (decision, record, source_file, pdf_entry, matrix_row) in enumerate(rows, start=skip + 1):
        can_extract = bool(
            pdf_entry
            and pdf_entry.file_path
            and pdf_entry.download_status in (PDFDownloadStatus.DOWNLOADED, PDFDownloadStatus.MANUALLY_UPLOADED)
        )
        items.append(
            MatrixWorkbenchCandidateRead(
                position=position,
                record_id=record.id,
                file_id=record.file_id,
                database_source=(source_file.database_source or "Sin fuente").strip() or "Sin fuente",
                article_custom_id=generate_article_id(record.title, record.authors),
                title=record.title,
                authors=record.authors,
                publication_year=record.publication_year,
                doi=record.doi,
                title_status=decision.title_status,
                abstract_status=decision.abstract_status,
                fulltext_status=decision.fulltext_status,
                final_decision=decision.final_decision,
                fulltext_reason=decision.fulltext_reason,
                pdf_download_status=(pdf_entry.download_status if pdf_entry else None),
                pdf_file_path=(pdf_entry.file_path if pdf_entry else None),
                matrix_row_id=(matrix_row.id if matrix_row else None),
                matrix_review_status=(matrix_row.review_status if matrix_row else None),
                can_extract=can_extract,
            )
        )

    return PaginatedMatrixWorkbenchCandidatesResponse(
        items=items,
        total=total,
        skip=skip,
        limit=limit,
        returned=len(items),
        has_next=skip + len(items) < total,
        has_previous=skip > 0,
    )


def get_matrix_workbench_metrics(
    db: Session,
    project_id: uuid.UUID,
) -> MatrixWorkbenchMetricsRead:
    """Calcula los indicadores de disponibilidad, extracción y decisión a texto completo."""
    rows = db.exec(_matrix_candidate_statement(db, project_id)).all()
    pdf_ready = {
        PDFDownloadStatus.DOWNLOADED,
        PDFDownloadStatus.MANUALLY_UPLOADED,
    }

    return MatrixWorkbenchMetricsRead(
        total_candidates=len(rows),
        with_pdf=sum(bool(pdf and pdf.file_path and pdf.download_status in pdf_ready) for _, _, _, pdf, _ in rows),
        without_pdf=sum(not (pdf and pdf.file_path and pdf.download_status in pdf_ready) for _, _, _, pdf, _ in rows),
        extracted_rows=sum(matrix_row is not None for _, _, _, _, matrix_row in rows),
        draft_rows=sum(matrix_row is not None and matrix_row.review_status == ExtractionReviewStatus.DRAFT for _, _, _, _, matrix_row in rows),
        confirmed_rows=sum(matrix_row is not None and matrix_row.review_status == ExtractionReviewStatus.CONFIRMED for _, _, _, _, matrix_row in rows),
        fulltext_included=sum(decision.fulltext_status == ScreeningDecisionEnum.INCLUDED for decision, _, _, _, _ in rows),
        fulltext_excluded=sum(decision.fulltext_status == ScreeningDecisionEnum.EXCLUDED for decision, _, _, _, _ in rows),
        fulltext_pending=sum(decision.fulltext_status == ScreeningDecisionEnum.PENDING for decision, _, _, _, _ in rows),
    )


def confirm_fulltext_decision(
    db: Session,
    project_id: uuid.UUID,
    record_id: uuid.UUID,
    final_status: ScreeningDecisionEnum,
    decision_reason: Optional[str] = None,
) -> ScreeningSession:
    """
    Confirmación humana definitiva de la fase de Cribado a Texto Completo (Human-in-the-Loop).
    Actualiza la decisión en ScreeningDecision y recalcula el Diagrama PRISMA 2020.
    """
    session_obj = get_or_create_screening_session(db, project_id)

    decision = db.exec(
        select(ScreeningDecision)
        .where(ScreeningDecision.screening_session_id == session_obj.id)
        .where(ScreeningDecision.record_id == record_id)
    ).first()

    if not decision:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No existe un registro de decisión para este artículo.")

    user_note = f" [CONFIRMADO POR INVESTIGADOR: {decision_reason}]" if decision_reason else " [CONFIRMADO POR INVESTIGADOR]"
    old_reason = decision.fulltext_reason or ""
    decision.fulltext_status = final_status
    decision.fulltext_reason = f"{old_reason}{user_note}"
    decision.final_decision = final_status
    db.add(decision)

    # Marcar la fila de matriz como CONFIRMED
    matrix_row = db.exec(
        select(ExtractedMatrixRow)
        .where(ExtractedMatrixRow.project_id == project_id)
        .where(ExtractedMatrixRow.record_id == record_id)
    ).first()

    if matrix_row:
        matrix_row.review_status = ExtractionReviewStatus.CONFIRMED
        db.add(matrix_row)

    db.commit()

    # Recalcular contadores finales PRISMA 2020
    all_decisions = db.exec(
        select(ScreeningDecision)
        .where(ScreeningDecision.screening_session_id == session_obj.id)
        .where(ScreeningDecision.is_duplicate == False)
    ).all()

    session_obj.fulltext_included_count = sum(1 for d in all_decisions if d.final_decision == ScreeningDecisionEnum.INCLUDED)
    session_obj.fulltext_excluded_count = sum(1 for d in all_decisions if d.final_decision == ScreeningDecisionEnum.EXCLUDED)

    db.add(session_obj)
    db.commit()
    db.refresh(session_obj)
    return session_obj


def import_matrix_from_excel_csv(
    db: Session,
    project_id: uuid.UUID,
    file_bytes: bytes,
    filename: str,
) -> List[ExtractedMatrixRow]:
    """
    Permite importar masivamente matrices preexistentes desde archivos CSV o Excel (.xlsx, .xls)
    directamente al proyecto de forma desacoplada (record_id = NULL).
    """
    project = db.get(RSLProject, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="El proyecto RSL no existe.")

    try:
        if filename.lower().endswith(".csv"):
            df = pd.read_csv(BytesIO(file_bytes))
        else:
            df = pd.read_excel(BytesIO(file_bytes))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No se pudo leer el archivo Excel/CSV: {str(e)}",
        )

    if df.empty:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El archivo importado está vacío.")

    for column_name in [str(column).strip() for column in df.columns]:
        if column_name and column_name not in PREDEFINED_MATRIX_COLUMNS:
            if not db.exec(select(MatrixCustomColumn).where(MatrixCustomColumn.project_id == project_id).where(MatrixCustomColumn.name == column_name)).first():
                create_matrix_custom_column(db, project_id, column_name)

    matrix_columns = get_matrix_column_names(db, project_id)

    imported_rows: List[ExtractedMatrixRow] = []

    for index, row in df.iterrows():
        row_dict: Dict[str, Any] = {}
        for col in df.columns:
            val = row[col]
            row_dict[str(col).strip()] = None if pd.isna(val) else str(val)

        custom_id = str(row_dict.get("ID") or f"IMP_{index + 1}")

        matrix_row = ExtractedMatrixRow(
            project_id=project_id,
            record_id=None,  # Desacoplado: Matriz directa importada
            source_type=ExtractionSourceType.USER_IMPORTED,
            article_custom_id=custom_id,
            extraction_data=_normalize_matrix_data(row_dict, matrix_columns),
            review_status=ExtractionReviewStatus.CONFIRMED,
        )
        db.add(matrix_row)
        imported_rows.append(matrix_row)

    db.commit()
    return imported_rows


def get_project_matrix_rows(db: Session, project_id: uuid.UUID) -> List[ExtractedMatrixRow]:
    """Retorna la lista de filas de la matriz de extracción de un proyecto RSL."""
    synchronize_project_matrix_schema(db, project_id)
    return db.exec(select(ExtractedMatrixRow).where(ExtractedMatrixRow.project_id == project_id)).all()


def get_project_matrix_rows_paginated(
    db: Session,
    project_id: uuid.UUID,
    skip: int = 0,
    limit: int = 100,
) -> PaginatedMatrixRowsResponse:
    """Lista filas de matriz paginadas para proyectos con alto volumen de evidencia."""
    synchronize_project_matrix_schema(db, project_id)
    statement = (
        select(ExtractedMatrixRow)
        .where(ExtractedMatrixRow.project_id == project_id)
        .order_by(ExtractedMatrixRow.created_at, ExtractedMatrixRow.id)
    )
    count_row = db.exec(
        select(func.count())
        .select_from(ExtractedMatrixRow)
        .where(ExtractedMatrixRow.project_id == project_id)
    ).one()
    total = int(count_row[0])
    items = db.exec(statement.offset(skip).limit(limit)).all()
    return PaginatedMatrixRowsResponse(
        items=items,
        total=total,
        skip=skip,
        limit=limit,
        returned=len(items),
        has_next=skip + len(items) < total,
        has_previous=skip > 0,
    )


def export_project_matrix_excel(
    db: Session,
    project_id: uuid.UUID,
) -> Tuple[BytesIO, str]:
    """Exporta las filas disponibles de la matriz a un archivo Excel descargable."""
    project = db.get(RSLProject, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="El proyecto RSL no existe.")

    synchronize_project_matrix_schema(db, project_id)
    columns = get_matrix_column_names(db, project_id)
    rows = db.exec(
        select(ExtractedMatrixRow)
        .where(ExtractedMatrixRow.project_id == project_id)
        .order_by(ExtractedMatrixRow.created_at, ExtractedMatrixRow.id)
    ).all()
    excel_buffer = generate_matrix_excel_export(
        columns=columns,
        rows=[row.extraction_data or {} for row in rows],
    )
    safe_title = "".join(
        character if character.isalnum() or character in ("_", "-") else "_"
        for character in project.title[:40]
    ).strip("_") or "proyecto"
    return excel_buffer, f"matriz_extraccion_{safe_title}.xlsx"
