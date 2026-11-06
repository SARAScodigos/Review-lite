"""
Servicio de Negocio para el Cribado por Abstract asistido por IA (Fase 2 del Hito 2).
Implementa procesamiento por Lotes (Batching de 10 resúmenes) y Concurrencia Multihilo (ThreadPoolExecutor),
reserva atómica con estado EVALUATING, reseteo a PENDING en fallos y límite de 3 reintentos.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
from typing import Dict, List, Optional, Tuple
import uuid

from fastapi import HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlmodel import Session, select

from app.ai.base import AbstractAIProvider
from app.ai.catalog import DEFAULT_SCREENING_MODEL, DEFAULT_SCREENING_PROVIDER
from app.ai.factory import AIEngineFactory
from app.api.models.extracted_record_model import ExtractedRecord
from app.api.models.rsl_project_model import RSLProject
from app.api.models.search_result_file_model import SearchResultFile
from app.api.models.screening_model import (
    ProcessStatus,
    ScreeningDecision,
    ScreeningDecisionEnum,
    ScreeningSession,
)
from app.api.schemas.screening.abstract_screening_schema import (
    AbstractScreeningItemRead,
    AbstractScreeningMetricsRead,
    AbstractScreeningRecordRead,
    AbstractScreeningSourceMetricsRead,
    PaginatedAbstractScreeningRecordsResponse,
)
from app.api.services.screening.deduplication_service import (
    generate_article_id,
    get_or_create_screening_session,
)
from app.db.session import engine


class SingleAbstractEvaluation(BaseModel):
    """Veredicto individual de la IA para un abstract del lote."""

    record_id: str = Field(..., description="UUID del artículo evaluado")
    decision: ScreeningDecisionEnum = Field(..., description="INCLUDED o EXCLUDED o MAYBE")
    reasoning: str = Field(..., description="Explicación detallada basada en el resumen")


class AbstractBatchAIScreeningOutput(BaseModel):
    """Esquema de respuesta en lote para resúmenes."""

    evaluations: List[SingleAbstractEvaluation]


def _passes_abstract_filter(status_value: ScreeningDecisionEnum) -> Optional[bool]:
    if status_value in (ScreeningDecisionEnum.INCLUDED, ScreeningDecisionEnum.MAYBE):
        return True
    
    if status_value == ScreeningDecisionEnum.EXCLUDED:
        return False
    return None


def _was_overridden(reason: Optional[str]) -> bool:
    return bool(reason and "[SOBREESCRITO POR INVESTIGADOR" in reason)


def build_abstract_batch_system_instruction() -> str:
    """Construye la instrucción de sistema para evaluar lotes de abstracts."""
    return (
        "Eres un revisor científico experto encargado del cribado profundo por ABSTRACT para una RSL.\n"
        "Se te proporcionará una lista de artículos con sus resúmenes completos. Evalúa la metodología, población e intervención frente a las variables del proyecto RSL.\n"
        "REGLAS DE EVALUACIÓN:\n"
        "1. Si el abstract demuestra que el estudio no aborda las variables del proyecto o carece de información suficiente, clasifícalo como 'EXCLUDED'.\n"
        "2. Si el abstract confirma que el estudio responde a las variables y objetivos del proyecto, clasifícalo como 'INCLUDED'.\n"
        "Debes responder en formato JSON estricto devolviendo un objeto con la propiedad 'evaluations', \n"
        "3. Si existe duda por falta de contexto pero podría ser relevante, clasifícalo como 'MAYBE'.\n"
        "donde cada ítem contiene el 'record_id' exacto, la 'decision' (INCLUDED o EXCLUDED o MAYBE) y la fundamentación científica en español detallada en 'reasoning'."
    )


def build_abstract_batch_user_prompt(project: RSLProject, batch_records: List[ExtractedRecord]) -> str:
    """Construye el prompt en lote con el proyecto RSL y los resúmenes del grupo."""
    variables_str = ", ".join(project.variables) if project.variables else "No especificadas"
    scope_str = project.geographic_scope if project.geographic_scope else "Global / No especificado"

    items_text = []
    for r in batch_records:
        abs_text = r.abstract if r.abstract and len(r.abstract.strip()) > 0 else "SIN ABSTRACT DISPONIBLE"
        items_text.append(
            f"--- ARTÍCULO ID: {r.id} ---\n"
            f"- Título: {r.title or 'Sin título'}\n"
            f"- Autores: {r.authors or 'No especificadas'}\n"
            f"- Año: {r.publication_year or 'No especificado'}\n"
            f"- Fuente: {r.source_title or 'No especificada'}\n"
            f"- ABSTRACT COMPLETO:\n{abs_text}\n"
        )

    return (
        f"PROYECTO DE REVISIÓN SISTEMÁTICA:\n"
        f"- Título del Proyecto: {project.title}\n"
        f"- Variables de Estudio: {variables_str}\n"
        f"- Ámbito Geográfico / Contexto: {scope_str}\n\n"
        f"EVALÚA LOS SIGUIENTES {len(batch_records)} RESÚMENES EN LOTE:\n\n"
        + "\n".join(items_text)
    )


def validate_abstract_screening_prerequisites(db: Session, session_obj: ScreeningSession):
    """Gatekeeper: Verifica que la fase de cribado por título se haya ejecutado previamente."""
    if session_obj.status == ProcessStatus.PROCESSING_TITLE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El proceso de cribado por título se encuentra actualmente en ejecución.",
        )

    title_evaluated = db.exec(
        select(ScreeningDecision)
        .where(ScreeningDecision.screening_session_id == session_obj.id)
        .where(ScreeningDecision.is_duplicate == False)
        .where(ScreeningDecision.title_status != ScreeningDecisionEnum.PENDING)
    ).all()

    if not title_evaluated:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede iniciar el cribado por abstract. Debes ejecutar primero el cribado por título.",
        )


def process_single_abstract_batch(
    project: RSLProject,
    batch_records: List[ExtractedRecord],
    ai_provider: AbstractAIProvider,
    system_instruction: str,
    temperature: float,
) -> Tuple[int, int]:
    """
    Procesa un lote de abstracts:
    1. Marca el lote en DB como EVALUATING ("Revisando en IA").
    2. Reintenta hasta 3 veces con la API de IA.
    3. Si falla tras 3 intentos, resetea el lote a PENDING y lanza la excepción.
    4. Si tiene éxito, guarda los veredictos finales (INCLUDED/EXCLUDED).
    """
    batch_ids = [r.id for r in batch_records]

    # Step 1: Reserva del Lote en DB con estado EVALUATING
    with Session(engine) as session:
        for rec_id in batch_ids:
            d = session.exec(select(ScreeningDecision).where(ScreeningDecision.record_id == rec_id)).first()
            if d:
                d.abstract_status = ScreeningDecisionEnum.EVALUATING
                session.add(d)
        session.commit()

    # Step 2: Intentar hasta 3 veces con la IA
    MAX_RETRIES = 3
    ai_result: Optional[AbstractBatchAIScreeningOutput] = None
    last_error: Optional[Exception] = None
    prompt = build_abstract_batch_user_prompt(project, batch_records)

    for attempt in range(MAX_RETRIES):
        try:
            ai_result = ai_provider.generate_structured(
                prompt=prompt,
                schema=AbstractBatchAIScreeningOutput,
                system_instruction=system_instruction,
                temperature=temperature,
            )
            if ai_result and ai_result.evaluations:
                break
        except Exception as e:
            last_error = e

    # Step 3: Si fallaron los 3 reintentos, resetear lote a PENDING
    if not ai_result or not ai_result.evaluations:
        with Session(engine) as session:
            for rec_id in batch_ids:
                d = session.exec(select(ScreeningDecision).where(ScreeningDecision.record_id == rec_id)).first()
                if d:
                    d.abstract_status = ScreeningDecisionEnum.PENDING
                    d.abstract_reason = f"Reintento fallido de IA ({MAX_RETRIES} intentos): {str(last_error)}"
                    session.add(d)
            session.commit()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Fallo persistente en lote de IA ({len(batch_records)} resúmenes): {str(last_error)}",
        )

    # Step 4: Éxito -> Guardar veredictos en DB
    inc_count = 0
    exc_count = 0
    eval_map: Dict[uuid.UUID, SingleAbstractEvaluation] = {}
    for item in ai_result.evaluations:
        try:
            eval_map[uuid.UUID(item.record_id)] = item
        except Exception:
            continue

    with Session(engine) as session:
        for rec_id in batch_ids:
            d = session.exec(select(ScreeningDecision).where(ScreeningDecision.record_id == rec_id)).first()
            if not d:
                continue

            eval_item = eval_map.get(rec_id)
            if eval_item:
                d.abstract_status = eval_item.decision
                d.abstract_reason = f"[{ai_provider.model_name}] {eval_item.reasoning}"
                if eval_item.decision == ScreeningDecisionEnum.INCLUDED:
                    inc_count += 1
                else:
                    exc_count += 1
            else:
                d.abstract_status = ScreeningDecisionEnum.PENDING
                d.abstract_reason = "Omitido por la IA en respuesta de lote. Se reintentará."

            session.add(d)
        session.commit()

    return inc_count, exc_count


def run_abstract_screening_pipeline(
    db: Session,
    project_id: uuid.UUID,
    provider: str = DEFAULT_SCREENING_PROVIDER,
    model: str = DEFAULT_SCREENING_MODEL,
    temperature: float = 0.2,
    re_run: bool = False,
    celery_task_id: Optional[str] = None,
    batch_size: int = 10,
    max_workers: int = 5,
) -> ScreeningSession:
    """
    Ejecuta el cribado por abstract sobre artículos aprobados/dudosos en títulos, en lotes de 10 con 5 hilos paralelos.
    """
    project = db.get(RSLProject, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="El proyecto RSL no existe.")

    session_obj = get_or_create_screening_session(db, project_id)
    validate_abstract_screening_prerequisites(db, session_obj)

    if re_run:
        # Resetea las decisiones de abstract para artículos que pasaron filtro de título
        existing_decisions = db.exec(
            select(ScreeningDecision)
            .where(ScreeningDecision.screening_session_id == session_obj.id)
            .where(ScreeningDecision.is_duplicate == False)
            .where(ScreeningDecision.title_status.in_([ScreeningDecisionEnum.INCLUDED, ScreeningDecisionEnum.MAYBE]))
        ).all()
        for d in existing_decisions:
            d.abstract_status = ScreeningDecisionEnum.PENDING
            d.abstract_reason = None
            db.add(d)
        db.commit()

    # Filtrar solo artículos únicos aprobados o dudosos por título (INCLUDED o MAYBE) y pendientes en abstract
    decisions_statement = (
        select(ScreeningDecision)
        .where(ScreeningDecision.screening_session_id == session_obj.id)
        .where(ScreeningDecision.is_duplicate == False)
        .where(ScreeningDecision.title_status.in_([ScreeningDecisionEnum.INCLUDED, ScreeningDecisionEnum.MAYBE]))
        .where(ScreeningDecision.abstract_status.in_([ScreeningDecisionEnum.PENDING, ScreeningDecisionEnum.EVALUATING]))
    )
    pending_decisions = db.exec(decisions_statement).all()

    if not pending_decisions:
        session_obj.status = ProcessStatus.IDLE
        db.add(session_obj)
        db.commit()
        return session_obj

    session_obj.status = ProcessStatus.PROCESSING_ABSTRACT
    session_obj.error_message = None
    if celery_task_id:
        session_obj.celery_task_id = celery_task_id
    db.add(session_obj)
    db.commit()

    record_ids = [d.record_id for d in pending_decisions]
    records = db.exec(select(ExtractedRecord).where(ExtractedRecord.id.in_(record_ids))).all()
    record_map = {r.id: r for r in records}

    batches: List[List[ExtractedRecord]] = []
    current_batch: List[ExtractedRecord] = []
    for r_id in record_ids:
        rec = record_map.get(r_id)
        if rec:
            current_batch.append(rec)
            if len(current_batch) >= batch_size:
                batches.append(current_batch)
                current_batch = []
    if current_batch:
        batches.append(current_batch)

    ai_provider = AIEngineFactory.get_provider(provider=provider, model=model)
    system_instruction = build_abstract_batch_system_instruction()

    total_inc = 0
    total_exc = 0
    encountered_errors = []

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_batch = {
            executor.submit(
                process_single_abstract_batch,
                project,
                b,
                ai_provider,
                system_instruction,
                temperature,
            ): b
            for b in batches
        }

        for future in as_completed(future_to_batch):
            try:
                inc, exc = future.result()
                total_inc += inc
                total_exc += exc
            except Exception as e:
                encountered_errors.append(str(e))

    all_decisions = db.exec(
        select(ScreeningDecision)
        .where(ScreeningDecision.screening_session_id == session_obj.id)
        .where(ScreeningDecision.is_duplicate == False)
    ).all()

    session_obj.abstract_included_count = sum(
        1 for d in all_decisions if d.abstract_status == ScreeningDecisionEnum.INCLUDED
    )
    session_obj.abstract_excluded_count = sum(
        1 for d in all_decisions if d.abstract_status == ScreeningDecisionEnum.EXCLUDED
    )

    if encountered_errors:
        session_obj.status = ProcessStatus.ERROR
        session_obj.error_message = f"Ocurrieron errores en {len(encountered_errors)} lotes de abstracts: {'; '.join(encountered_errors[:2])}"
    else:
        session_obj.status = ProcessStatus.IDLE

    session_obj.celery_task_id = None
    db.add(session_obj)
    db.commit()
    db.refresh(session_obj)

    return session_obj


def get_abstract_screening_results(db: Session, project_id: uuid.UUID) -> List[AbstractScreeningItemRead]:
    """Obtiene los resultados de la fase de cribado por abstract de un proyecto."""
    session_obj = get_or_create_screening_session(db, project_id)

    statement = (
        select(ScreeningDecision)
        .where(ScreeningDecision.screening_session_id == session_obj.id)
        .where(ScreeningDecision.is_duplicate == False)
        .where(ScreeningDecision.title_status.in_([ScreeningDecisionEnum.INCLUDED, ScreeningDecisionEnum.MAYBE]))
    )
    decisions = db.exec(statement).all()

    results: List[AbstractScreeningItemRead] = []
    for d in decisions:
        rec = d.record or db.get(ExtractedRecord, d.record_id)
        if not rec:
            continue

        results.append(
            AbstractScreeningItemRead(
                record_id=rec.id,
                title=rec.title,
                abstract=rec.abstract,
                authors=rec.authors,
                publication_year=rec.publication_year,
                source_title=rec.source_title,
                abstract_status=d.abstract_status,
                abstract_reason=d.abstract_reason,
            )
        )

    return results


def get_abstract_screening_metrics(
    db: Session,
    project_id: uuid.UUID,
) -> AbstractScreeningMetricsRead:
    """Cuenta decisiones de abstract de los registros únicos que superaron el título."""
    session_obj = get_or_create_screening_session(db, project_id)
    base_statement = (
        select(func.count())
        .select_from(ScreeningDecision)
        .where(ScreeningDecision.screening_session_id == session_obj.id)
        .where(ScreeningDecision.is_duplicate == False)
        .where(ScreeningDecision.title_status.in_([ScreeningDecisionEnum.INCLUDED, ScreeningDecisionEnum.MAYBE]))
    )

    def count_by_status(abstract_status: ScreeningDecisionEnum) -> int:
        return int(db.exec(base_statement.where(ScreeningDecision.abstract_status == abstract_status)).one())

    source_rows = db.exec(
        select(ScreeningDecision.abstract_status, SearchResultFile.database_source)
        .join(ExtractedRecord, ScreeningDecision.record_id == ExtractedRecord.id)
        .join(SearchResultFile, ExtractedRecord.file_id == SearchResultFile.id)
        .where(SearchResultFile.project_id == project_id)
        .where(ScreeningDecision.screening_session_id == session_obj.id)
        .where(ScreeningDecision.is_duplicate == False)
        .where(ScreeningDecision.title_status.in_([ScreeningDecisionEnum.INCLUDED, ScreeningDecisionEnum.MAYBE]))
    ).all()

    source_metrics = {}
    for abstract_status, database_source in source_rows:
        source_name = (database_source or "Sin fuente").strip() or "Sin fuente"
        metrics = source_metrics.setdefault(
            source_name,
            {"total_unique": 0, "included_abstract": 0, "excluded_abstract": 0, "maybe_abstract": 0},
        )
        metrics["total_unique"] += 1
        if abstract_status == ScreeningDecisionEnum.INCLUDED:
            metrics["included_abstract"] += 1
        elif abstract_status == ScreeningDecisionEnum.EXCLUDED:
            metrics["excluded_abstract"] += 1
        elif abstract_status == ScreeningDecisionEnum.MAYBE:
            metrics["maybe_abstract"] += 1

    return AbstractScreeningMetricsRead(
        total_unique=int(db.exec(base_statement).one()),
        included_abstract=count_by_status(ScreeningDecisionEnum.INCLUDED),
        excluded_abstract=count_by_status(ScreeningDecisionEnum.EXCLUDED),
        maybe_abstract=count_by_status(ScreeningDecisionEnum.MAYBE),
        by_database_source=[
            AbstractScreeningSourceMetricsRead(database_source=source_name, **metrics)
            for source_name, metrics in sorted(source_metrics.items())
        ],
    )


def get_abstract_screening_records_paginated(
    db: Session,
    project_id: uuid.UUID,
    skip: int = 0,
    limit: int = 100,
) -> PaginatedAbstractScreeningRecordsResponse:
    """
    Lista todos los registros disponibles para cribado por abstract.
    Solo muestra registros únicos que pasaron o quedaron dudosos en título, junto
    con la decisión de título y la decisión actual de abstract.
    """
    session_obj = get_or_create_screening_session(db, project_id)

    rows_statement = (
        select(ScreeningDecision, ExtractedRecord, SearchResultFile)
        .join(ExtractedRecord, ScreeningDecision.record_id == ExtractedRecord.id)
        .join(SearchResultFile, ExtractedRecord.file_id == SearchResultFile.id)
        .where(SearchResultFile.project_id == project_id)
        .where(ScreeningDecision.screening_session_id == session_obj.id)
        .where(ScreeningDecision.is_duplicate == False)
        .where(ScreeningDecision.title_status.in_([ScreeningDecisionEnum.INCLUDED, ScreeningDecisionEnum.MAYBE]))
        .order_by(ExtractedRecord.created_at, ExtractedRecord.id)
    )
    count_statement = (
        select(func.count())
        .select_from(ScreeningDecision)
        .join(ExtractedRecord, ScreeningDecision.record_id == ExtractedRecord.id)
        .join(SearchResultFile, ExtractedRecord.file_id == SearchResultFile.id)
        .where(SearchResultFile.project_id == project_id)
        .where(ScreeningDecision.screening_session_id == session_obj.id)
        .where(ScreeningDecision.is_duplicate == False)
        .where(ScreeningDecision.title_status.in_([ScreeningDecisionEnum.INCLUDED, ScreeningDecisionEnum.MAYBE]))
    )

    total = int(db.exec(count_statement).one())
    rows = db.exec(rows_statement.offset(skip).limit(limit)).all()

    items = [
        AbstractScreeningRecordRead(
            record_id=record.id,
            file_id=record.file_id,
            database_source=(source_file.database_source or "Sin fuente").strip() or "Sin fuente",
            id_article=generate_article_id(record.title, record.authors),
            title=record.title,
            abstract=record.abstract,
            authors=record.authors,
            publication_year=record.publication_year,
            doi=record.doi,
            source_title=record.source_title,
            title_status=decision.title_status,
            title_reason=decision.title_reason,
            title_overridden=_was_overridden(decision.title_reason),
            passes_abstract_filter=_passes_abstract_filter(decision.abstract_status),
            abstract_status=decision.abstract_status,
            abstract_reason=decision.abstract_reason,
            abstract_overridden=_was_overridden(decision.abstract_reason),
        )
        for decision, record, source_file in rows
    ]

    return PaginatedAbstractScreeningRecordsResponse(
        items=items,
        total=total,
        skip=skip,
        limit=limit,
        returned=len(items),
        has_next=skip + len(items) < total,
        has_previous=skip > 0,
    )
