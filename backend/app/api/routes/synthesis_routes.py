"""
Controladores HTTP REST para el Módulo de Síntesis y Redacción Científica asistida por IA (Hito 5).
"""
from typing import List
import uuid

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.api.models.synthesis_model import (
    RSLSynthesisSection,
    SynthesisSectionType,
)
from app.api.models.extracted_matrix_model import ExtractedMatrixRow
from app.api.schemas.synthesis_schema import (
    CreateSynthesisSectionRequest,
    EvaluateEligibilityRequest,
    GenerateSectionDraftRequest,
    RSLSynthesisSectionRead,
    SynthesisCandidateArticleRead,
    UpdateSynthesisSectionRequest,
)
from app.api.schemas.extracted_record_schema import AsyncExtractionResponse, TaskStatusResponse
from app.api.services.rsl_project_service import get_project_by_id
from app.api.services.synthesis_policy import is_guided_synthesis_section
from app.db.session import get_session
from app.workers.celery_app import celery_app
from app.workers.tasks import run_synthesis_section_task

router = APIRouter(prefix="/projects/{project_id}/synthesis", tags=["Synthesis & Scientific Writing"])


def ensure_automatic_synthesis_allowed(section: RSLSynthesisSection) -> None:
    if is_guided_synthesis_section(section.section_type):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Esta sección se desarrolla con una guía para el investigador. Las acciones automáticas de IA están deshabilitadas.",
        )


def serialize_synthesis_section(
    db: Session,
    section: RSLSynthesisSection,
) -> RSLSynthesisSectionRead:
    """Incluye el título de cada ID candidato para que la UI no deba resolverlo sola."""
    candidate_ids = section.candidate_article_ids or []
    titles_by_id = {}
    if candidate_ids:
        matrix_rows = db.exec(
            select(ExtractedMatrixRow).where(
                ExtractedMatrixRow.project_id == section.project_id
            )
        ).all()
        for row in matrix_rows:
            data = row.extraction_data or {}
            article_id = row.article_custom_id or data.get("ID")
            if article_id in candidate_ids:
                titles_by_id[article_id] = data.get("Título") or data.get("Title") or data.get("title")

    response = RSLSynthesisSectionRead.model_validate(section)
    return response.model_copy(
        update={
            "candidate_articles": [
                {"article_id": article_id, "title": titles_by_id.get(article_id)}
                for article_id in candidate_ids
            ]
        }
    )


@router.get("/available-matrix-articles", response_model=List[SynthesisCandidateArticleRead])
def get_available_matrix_articles_endpoint(
    project_id: uuid.UUID,
    db: Session = Depends(get_session),
):
    """
    Retorna la lista oficial enviada por el backend de artículos que cuentan con registro
    en la matriz de extracción del proyecto (ya sean por IA o importados manualmente).
    """
    matrix_rows = db.exec(
        select(ExtractedMatrixRow)
        .where(ExtractedMatrixRow.project_id == project_id)
    ).all()

    results = []
    seen = set()
    for r in matrix_rows:
        data = r.extraction_data or {}
        art_id = r.article_custom_id or data.get("ID") or data.get("id") or (str(r.record_id)[:8] if r.record_id else str(r.id)[:8])
        if art_id and art_id not in seen:
            seen.add(art_id)
            title = (
                data.get("Título")
                or data.get("Title")
                or data.get("title")
                or data.get("título")
                or data.get("Nombre")
                or data.get("Name")
                or data.get("name")
                or "Sin título"
            )
            results.append(SynthesisCandidateArticleRead(article_id=art_id, title=title))

    return results



@router.post("/sections", response_model=RSLSynthesisSectionRead, status_code=status.HTTP_201_CREATED)
def create_synthesis_section_endpoint(
    project_id: uuid.UUID,
    payload: CreateSynthesisSectionRequest,
    db: Session = Depends(get_session),
):
    """
    Crea un nuevo capítulo o sección de síntesis (ej. Introducción, Marco Teórico, OB1, OB2, PRISMA...).
    """
    project = get_project_by_id(session=db, project_id=project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="El proyecto RSL no existe.")

    statement = select(RSLSynthesisSection).where(
        RSLSynthesisSection.project_id == project_id,
        RSLSynthesisSection.section_type == payload.section_type,
    )
    if payload.section_type == SynthesisSectionType.RESULTS_OBJECTIVE:
        if not payload.objective_title:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Una sección de resultados requiere el código o título del objetivo del proyecto.")
        statement = statement.where(RSLSynthesisSection.objective_title == payload.objective_title)

    section = db.exec(statement).first()
    if not section:
        section = RSLSynthesisSection(project_id=project_id, section_type=payload.section_type)

    section.objective_title = payload.objective_title
    section.objective_description = payload.objective_description
    if payload.section_type == SynthesisSectionType.RESULTS_OBJECTIVE:
        metadata = dict(project.extra_metadata or {})
        objectives = dict(metadata.get("objectives") or {})
        existing_description = objectives.get(payload.objective_title)
        objective_description = payload.objective_description or existing_description or ""
        objectives[payload.objective_title] = objective_description
        metadata["objectives"] = objectives
        project.extra_metadata = metadata
        section.objective_description = objective_description
        db.add(project)
    section.order_index = payload.order_index
    section.candidate_article_ids = []
    section.selection_justifications = {}
    section.trimmed_columns_used = []
    section.generated_table = {}
    section.generated_draft = None
    section.is_confirmed = False
    section.custom_prompt_instructions = None
    db.add(section)
    db.commit()
    db.refresh(section)
    return serialize_synthesis_section(db, section)


@router.get("/sections", response_model=List[RSLSynthesisSectionRead])
def get_project_synthesis_sections_endpoint(
    project_id: uuid.UUID,
    db: Session = Depends(get_session),
):
    """
    Retorna la lista de todas las secciones de síntesis del proyecto ordenadas por order_index.
    """
    sections = db.exec(
        select(RSLSynthesisSection)
        .where(RSLSynthesisSection.project_id == project_id)
        .order_by(RSLSynthesisSection.order_index.asc())
    ).all()
    return [serialize_synthesis_section(db, section) for section in sections]


@router.get("/sections/{section_id}", response_model=RSLSynthesisSectionRead)
def get_single_synthesis_section_endpoint(
    project_id: uuid.UUID,
    section_id: uuid.UUID,
    db: Session = Depends(get_session),
):
    """
    Retorna los detalles de una sección de síntesis específica.
    """
    section = db.get(RSLSynthesisSection, section_id)
    if not section or section.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la sección de síntesis.")
    return serialize_synthesis_section(db, section)


@router.put("/sections/{section_id}", response_model=RSLSynthesisSectionRead)
def update_synthesis_section_endpoint(
    project_id: uuid.UUID,
    section_id: uuid.UUID,
    payload: UpdateSynthesisSectionRequest,
    db: Session = Depends(get_session),
):
    """
    Permite al investigador actualizar manualmente los datos de una sección (IDs candidatos, borrar/editar borrador, confirmar).
    """
    section = db.get(RSLSynthesisSection, section_id)
    if not section or section.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la sección de síntesis.")

    if payload.candidate_article_ids is not None:
        section.candidate_article_ids = payload.candidate_article_ids
    if payload.generated_draft is not None:
        section.generated_draft = payload.generated_draft
    if payload.selection_justifications is not None:
        section.selection_justifications = payload.selection_justifications
    if payload.trimmed_columns_used is not None:
        section.trimmed_columns_used = payload.trimmed_columns_used
    if payload.generated_table is not None:
        section.generated_table = payload.generated_table
    if payload.is_confirmed is not None:
        section.is_confirmed = payload.is_confirmed

    db.add(section)
    db.commit()
    db.refresh(section)
    return serialize_synthesis_section(db, section)


@router.post("/sections/{section_id}/evaluate-eligibility", response_model=AsyncExtractionResponse)
def evaluate_section_eligibility_endpoint(
    project_id: uuid.UUID,
    section_id: uuid.UUID,
    payload: EvaluateEligibilityRequest = EvaluateEligibilityRequest(),
    db: Session = Depends(get_session),
):
    """
    FASE 1: Evalúa la elegibilidad de artículos candidatos e identifica la columna del porqué para la sección.
    Soporta la selección de columnas personalizadas por parte del usuario y la extracción automática de OB1, OB2...
    """
    section = db.get(RSLSynthesisSection, section_id)
    if not section or section.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la sección de síntesis.")
    ensure_automatic_synthesis_allowed(section)


    action = "RECOMMEND_COLUMNS" if section.section_type == SynthesisSectionType.RESULTS_OBJECTIVE else "EVALUATE_ELIGIBILITY"
    task = run_synthesis_section_task.delay(
        action, str(section_id), payload.provider, payload.model,
        payload.temperature, payload.selected_custom_columns, payload.objective_code,
        payload.custom_prompt,
    )
    return AsyncExtractionResponse(task_id=task.id, project_id=project_id, status="QUEUED", message="Selección de IDs candidatos encolada.")


@router.post("/sections/{section_id}/identify-ids", response_model=AsyncExtractionResponse)
def identify_objective_ids_endpoint(
    project_id: uuid.UUID,
    section_id: uuid.UUID,
    payload: EvaluateEligibilityRequest = EvaluateEligibilityRequest(),
    db: Session = Depends(get_session),
):
    section = db.get(RSLSynthesisSection, section_id)
    if not section or section.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la sección de síntesis.")
    ensure_automatic_synthesis_allowed(section)

    if section.section_type != SynthesisSectionType.RESULTS_OBJECTIVE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La identificación separada de IDs es exclusiva de Resultados por Objetivo.")
    task = run_synthesis_section_task.delay(
        "IDENTIFY_IDS", str(section_id), payload.provider, payload.model,
        payload.temperature, None, None, payload.custom_prompt,
    )
    return AsyncExtractionResponse(task_id=task.id, project_id=project_id, status="QUEUED", message="Identificación de IDs candidatos encolada.")


@router.post("/sections/{section_id}/generate-table", response_model=AsyncExtractionResponse)
def generate_section_table_endpoint(
    project_id: uuid.UUID,
    section_id: uuid.UUID,
    payload: GenerateSectionDraftRequest = GenerateSectionDraftRequest(),
    db: Session = Depends(get_session),
):
    section = db.get(RSLSynthesisSection, section_id)
    if not section or section.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la sección de síntesis.")
    ensure_automatic_synthesis_allowed(section)

    if section.section_type != SynthesisSectionType.RESULTS_OBJECTIVE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Las tablas de síntesis se generan para Resultados por Objetivo.")
    if section.generated_table and not payload.force:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La tabla de este objetivo ya existe. Edítela manualmente o reenvíe force=true para reemplazarla.",
        )
    task = run_synthesis_section_task.delay("GENERATE_TABLE", str(section_id), payload.provider, payload.model, payload.temperature, None, None, payload.custom_prompt)
    return AsyncExtractionResponse(task_id=task.id, project_id=project_id, status="QUEUED", message="Generación de tabla por objetivo encolada.")


@router.post("/sections/{section_id}/generate-draft", response_model=AsyncExtractionResponse)
def generate_section_draft_endpoint(
    project_id: uuid.UUID,
    section_id: uuid.UUID,
    payload: GenerateSectionDraftRequest = GenerateSectionDraftRequest(),
    db: Session = Depends(get_session),
):
    """
    FASE 2: Genera la redacción científica por IA en Markdown citando con el ID compuesto exacto [AgentJulc].
    - Para Introducción/Marco Teórico: Redacción por retribución.
    - Para Metodología PRISMA: Construcción desde las tablas del sistema (métricas, fórmulas, criterios).
    - Resultados, Discusión y Conclusiones: solo guías; la generación está bloqueada.
    """
    section = db.get(RSLSynthesisSection, section_id)
    if not section or section.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la sección de síntesis.")
    ensure_automatic_synthesis_allowed(section)


    task = run_synthesis_section_task.delay(
        "GENERATE_DRAFT", str(section_id), payload.provider, payload.model,
        payload.temperature, payload.selected_custom_columns, None, payload.custom_prompt,
    )
    return AsyncExtractionResponse(task_id=task.id, project_id=project_id, status="QUEUED", message="Redacción de sección encolada.")


@router.get("/tasks/{task_id}/status", response_model=TaskStatusResponse)
def get_synthesis_task_status_endpoint(task_id: str):
    task_result = AsyncResult(task_id, app=celery_app)
    result = None
    error = None
    if task_result.ready():
        if task_result.successful():
            result = task_result.result
        else:
            error = str(task_result.result) if task_result.result else "La tarea falló de forma imprevista."
            result = error
    return TaskStatusResponse(
        task_id=task_id,
        status=task_result.status,
        result=result,
        error=error,
    )


@router.delete("/sections/{section_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_synthesis_section_endpoint(
    project_id: uuid.UUID,
    section_id: uuid.UUID,
    db: Session = Depends(get_session),
):
    """
    Elimina una sección de síntesis del proyecto.
    """
    section = db.get(RSLSynthesisSection, section_id)
    if not section or section.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la sección de síntesis.")

    db.delete(section)
    db.commit()
    return None
