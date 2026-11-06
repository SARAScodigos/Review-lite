"""
Servicio de Negocio para el Cribado por Título asistido por IA (Fase 1 del Hito 2).
Implementa procesamiento por Lotes (Batching de 20 artículos) y Concurrencia Multihilo (ThreadPoolExecutor),
reserva atómica con estado EVALUATING, reseteo a PENDING en fallos y límite de 3 reintentos.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
from typing import Dict, List, Optional, Tuple
import uuid

from fastapi import HTTPException, status
from sqlalchemy import func
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.ai.base import AbstractAIProvider
from app.ai.catalog import DEFAULT_SCREENING_MODEL, DEFAULT_SCREENING_PROVIDER
from app.ai.factory import AIEngineFactory
from app.api.models.extracted_record_model import ExtractedRecord
from app.api.models.rsl_project_model import RSLProject
from app.api.models.search_result_file_model import SearchResultFile
from app.api.models.screening_model import (
    DuplicateReviewStatus,
    ProcessStatus,
    ScreeningDecision,
    ScreeningDecisionEnum,
    ScreeningSession,
)
from app.api.schemas.screening.title_screening_schema import (
    PaginatedTitleScreeningRecordsResponse,
    TitleScreeningItemRead,
    TitleScreeningMetricsRead,
    TitleScreeningRecordRead,
    TitleScreeningSourceMetricsRead,
)
from app.api.services.screening.deduplication_service import (
    generate_article_id,
    get_or_create_screening_session,
)
from app.db.session import engine


class SingleTitleEvaluation(BaseModel):
    """Veredicto individual de la IA para un artículo del lote."""

    record_id: str = Field(..., description="UUID del artículo evaluado")
    decision: ScreeningDecisionEnum = Field(..., description="INCLUDED, EXCLUDED o MAYBE")
    reasoning: str = Field(..., description="Justificación concisa en 1-2 oraciones")


class TitleBatchAIScreeningOutput(BaseModel):
    """Esquema de respuesta en lote para 15-20 artículos."""

    evaluations: List[SingleTitleEvaluation]


def _passes_title_filter(status_value: ScreeningDecisionEnum) -> Optional[bool]:
    if status_value in (ScreeningDecisionEnum.INCLUDED, ScreeningDecisionEnum.MAYBE):
        return True
    if status_value == ScreeningDecisionEnum.EXCLUDED:
        return False
    return None


def _was_overridden(reason: Optional[str]) -> bool:
    return bool(reason and "[SOBREESCRITO POR INVESTIGADOR" in reason)


def build_title_batch_system_instruction() -> str:
    """Construye la instrucción de sistema para evaluar lotes de títulos."""
    return (
        "Eres un revisor científico experto encargado del cribado de títulos para una Revisión Sistemática de la Literatura (RSL).\n"
        "Se te proporcionará una lista de artículos. Para CADA uno, evalúa si su título es potencialmente relevante.\n"
        "REGLAS DE EVALUACIÓN:\n"
        "1. Si el título está claramente fuera del tema o dominio del proyecto, clasifícalo como 'EXCLUDED'.\n"
        "2. Si el título sugiere relación directa o potencial con el problema y las variables, clasifícalo como 'INCLUDED'.\n"
        "3. Si existe duda por falta de contexto en el título pero podría ser relevante, clasifícalo como 'MAYBE'.\n"
        "Debes responder en formato JSON estricto devolviendo un objeto con la propiedad 'evaluations', "
        "donde cada ítem contiene el 'record_id' exacto, la 'decision' (INCLUDED, EXCLUDED o MAYBE) y una justificación en español concisa en 'reasoning'."
    )


def build_title_batch_user_prompt(project: RSLProject, batch_records: List[ExtractedRecord]) -> str:
    """Construye el prompt en lote con las preguntas del proyecto y los artículos del grupo."""
    variables_str = ", ".join(project.variables) if project.variables else "No especificadas"
    scope_str = project.geographic_scope if project.geographic_scope else "Global / No especificado"

    items_text = []
    for r in batch_records:
        items_text.append(
            f"--- ARTÍCULO ID: {r.id} ---\n"
            f"- Título: {r.title or 'Sin título'}\n"
            f"- Fuente/Journal: {r.source_title or 'No especificada'}\n"
            f"- Año: {r.publication_year or 'No especificado'}\n"
        )

    return (
        f"PROYECTO DE REVISIÓN SISTEMÁTICA:\n"
        f"- Título del Proyecto: {project.title}\n"
        f"- Variables de Estudio: {variables_str}\n"
        f"- Ámbito Geográfico / Contexto: {scope_str}\n\n"
        f"EVALÚA LOS SIGUIENTES {len(batch_records)} ARTÍCULOS EN LOTE:\n\n"
        + "\n".join(items_text)
    )


def validate_title_screening_prerequisites(db: Session, session_obj: ScreeningSession):
    """Gatekeeper: Verifica que la desduplicación del Hito 1 esté 100% resuelta."""
    if session_obj.status == ProcessStatus.AWAITING_DUPLICATE_REVIEW:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede iniciar el cribado por título. Existen clusters de duplicados pendientes por resolver en el Hito 1.",
        )

    pending_duplicates = db.exec(
        select(ScreeningDecision)
        .where(ScreeningDecision.screening_session_id == session_obj.id)
        .where(ScreeningDecision.duplicate_review_status == DuplicateReviewStatus.PENDING_HUMAN_REVIEW)
    ).all()

    if pending_duplicates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No se puede avanzar al cribado por título. Hay {len(pending_duplicates)} decisiones de duplicación pendientes.",
        )


def process_single_title_batch(
    project: RSLProject,
    batch_records: List[ExtractedRecord],
    ai_provider: AbstractAIProvider,
    system_instruction: str,
    temperature: float,
) -> Tuple[int, int]:
    """
    Procesa un único lote de artículos:
    1. Marca el lote en DB como EVALUATING ("Revisando en IA").
    2. Reintenta hasta 3 veces con la API de IA.
    3. Si falla tras 3 intentos, resetea el lote a PENDING y lanza la excepción.
    4. Si tiene éxito, guarda los veredictos finales (INCLUDED/EXCLUDED/MAYBE).
    """
    batch_ids = [r.id for r in batch_records]

    # Step 1: Reserva del Lote en DB con estado EVALUATING
    with Session(engine) as session:
        for rec_id in batch_ids:
            d = session.exec(select(ScreeningDecision).where(ScreeningDecision.record_id == rec_id)).first()
            if d:
                d.title_status = ScreeningDecisionEnum.EVALUATING
                session.add(d)
        session.commit()

    # Step 2: Intentar hasta 3 veces con la IA
    MAX_RETRIES = 3
    ai_result: Optional[TitleBatchAIScreeningOutput] = None
    last_error: Optional[Exception] = None
    prompt = build_title_batch_user_prompt(project, batch_records)

    for attempt in range(MAX_RETRIES):
        try:
            ai_result = ai_provider.generate_structured(
                prompt=prompt,
                schema=TitleBatchAIScreeningOutput,
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
                    d.title_status = ScreeningDecisionEnum.PENDING
                    d.title_reason = f"Reintento fallido de IA ({MAX_RETRIES} intentos): {str(last_error)}"
                    session.add(d)
            session.commit()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Fallo persistente en lote de IA ({len(batch_records)} artículos): {str(last_error)}",
        )

    # Step 4: Éxito -> Guardar veredictos en DB
    inc_count = 0
    exc_count = 0
    eval_map: Dict[uuid.UUID, SingleTitleEvaluation] = {}
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
                d.title_status = eval_item.decision
                d.title_reason = f"[{ai_provider.model_name}] {eval_item.reasoning}"
                if eval_item.decision in (ScreeningDecisionEnum.INCLUDED, ScreeningDecisionEnum.MAYBE):
                    inc_count += 1
                else:
                    exc_count += 1
            else:
                # Si la IA omitió este id en la lista devuelta, resetear a PENDING
                d.title_status = ScreeningDecisionEnum.PENDING
                d.title_reason = "Omitido por la IA en respuesta de lote. Se reintentará."

            session.add(d)
        session.commit()

    return inc_count, exc_count


def run_title_screening_pipeline(
    db: Session,
    project_id: uuid.UUID,
    provider: str = DEFAULT_SCREENING_PROVIDER,
    model: str = DEFAULT_SCREENING_MODEL,
    temperature: float = 0.2,
    re_run: bool = False,
    celery_task_id: Optional[str] = None,
    batch_size: int = 20,
    max_workers: int = 5,
) -> ScreeningSession:
    """
    Ejecuta el cribado masivo por título en lotes de 20 artículos con concurrencia de 5 hilos paralelos.
    """
    project = db.get(RSLProject, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="El proyecto RSL no existe.")

    session_obj = get_or_create_screening_session(db, project_id)
    validate_title_screening_prerequisites(db, session_obj)

    if re_run:
        # Resetea todas las decisiones únicas de título a PENDING para re-evaluarlas de cero
        existing_decisions = db.exec(
            select(ScreeningDecision)
            .where(ScreeningDecision.screening_session_id == session_obj.id)
            .where(ScreeningDecision.is_duplicate == False)
        ).all()
        for d in existing_decisions:
            d.title_status = ScreeningDecisionEnum.PENDING
            d.title_reason = None
            d.abstract_status = ScreeningDecisionEnum.PENDING
            d.abstract_reason = None
            db.add(d)
        db.commit()

    # Buscar registros únicos no evaluados (is_duplicate == False y title_status == PENDING o EVALUATING)
    decisions_statement = (
        select(ScreeningDecision)
        .where(ScreeningDecision.screening_session_id == session_obj.id)
        .where(ScreeningDecision.is_duplicate == False)
        .where(ScreeningDecision.title_status.in_([ScreeningDecisionEnum.PENDING, ScreeningDecisionEnum.EVALUATING]))
    )
    pending_decisions = db.exec(decisions_statement).all()

    if not pending_decisions:
        session_obj.status = ProcessStatus.IDLE
        db.add(session_obj)
        db.commit()
        return session_obj

    session_obj.status = ProcessStatus.PROCESSING_TITLE
    session_obj.error_message = None
    if celery_task_id:
        session_obj.celery_task_id = celery_task_id
    db.add(session_obj)
    db.commit()

    # Cargar los ExtractedRecords correspondientes
    record_ids = [d.record_id for d in pending_decisions]
    records = db.exec(select(ExtractedRecord).where(ExtractedRecord.id.in_(record_ids))).all()
    record_map = {r.id: r for r in records}

    # Dividir en lotes de batch_size (ej. 20 artículos)
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
    system_instruction = build_title_batch_system_instruction()

    total_inc = 0
    total_exc = 0
    encountered_errors = []

    # Ejecutar lotes en paralelo usando ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_batch = {
            executor.submit(
                process_single_title_batch,
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

    # Recalcular métricas acumuladas de la sesión PRISMA
    all_decisions = db.exec(
        select(ScreeningDecision)
        .where(ScreeningDecision.screening_session_id == session_obj.id)
        .where(ScreeningDecision.is_duplicate == False)
    ).all()

    session_obj.title_included_count = sum(
        1 for d in all_decisions if d.title_status in (ScreeningDecisionEnum.INCLUDED, ScreeningDecisionEnum.MAYBE)
    )
    session_obj.title_excluded_count = sum(
        1 for d in all_decisions if d.title_status == ScreeningDecisionEnum.EXCLUDED
    )

    if encountered_errors:
        session_obj.status = ProcessStatus.ERROR
        session_obj.error_message = f"Ocurrieron errores en {len(encountered_errors)} lotes: {'; '.join(encountered_errors[:2])}"
    else:
        session_obj.status = ProcessStatus.IDLE

    session_obj.celery_task_id = None
    db.add(session_obj)
    db.commit()
    db.refresh(session_obj)

    return session_obj


def get_title_screening_results(db: Session, project_id: uuid.UUID) -> List[TitleScreeningItemRead]:
    """Obtiene los resultados de la fase de cribado por título de un proyecto."""
    session_obj = get_or_create_screening_session(db, project_id)

    statement = (
        select(ScreeningDecision)
        .where(ScreeningDecision.screening_session_id == session_obj.id)
        .where(ScreeningDecision.is_duplicate == False)
    )
    decisions = db.exec(statement).all()

    results: List[TitleScreeningItemRead] = []
    for d in decisions:
        rec = d.record or db.get(ExtractedRecord, d.record_id)
        if not rec:
            continue

        results.append(
            TitleScreeningItemRead(
                record_id=rec.id,
                title=rec.title,
                authors=rec.authors,
                publication_year=rec.publication_year,
                source_title=rec.source_title,
                title_status=d.title_status,
                title_reason=d.title_reason,
            )
        )

    return results


def get_title_screening_metrics(
    db: Session,
    project_id: uuid.UUID,
) -> TitleScreeningMetricsRead:
    """Cuenta los registros únicos y cada decisión exclusiva de la fase de título."""
    session_obj = get_or_create_screening_session(db, project_id)
    base_statement = (
        select(func.count())
        .select_from(ScreeningDecision)
        .where(ScreeningDecision.screening_session_id == session_obj.id)
        .where(ScreeningDecision.is_duplicate == False)
    )

    def count_by_status(title_status: ScreeningDecisionEnum) -> int:
        return int(db.exec(base_statement.where(ScreeningDecision.title_status == title_status)).one())

    source_rows = db.exec(
        select(ScreeningDecision.title_status, SearchResultFile.database_source)
        .join(ExtractedRecord, ScreeningDecision.record_id == ExtractedRecord.id)
        .join(SearchResultFile, ExtractedRecord.file_id == SearchResultFile.id)
        .where(SearchResultFile.project_id == project_id)
        .where(ScreeningDecision.screening_session_id == session_obj.id)
        .where(ScreeningDecision.is_duplicate == False)
    ).all()

    source_metrics = {}
    for title_status, database_source in source_rows:
        source_name = (database_source or "Sin fuente").strip() or "Sin fuente"
        metrics = source_metrics.setdefault(
            source_name,
            {"total_unique": 0, "included_title": 0, "excluded_title": 0, "maybe_title": 0},
        )
        metrics["total_unique"] += 1
        if title_status == ScreeningDecisionEnum.INCLUDED:
            metrics["included_title"] += 1
        elif title_status == ScreeningDecisionEnum.EXCLUDED:
            metrics["excluded_title"] += 1
        elif title_status == ScreeningDecisionEnum.MAYBE:
            metrics["maybe_title"] += 1

    return TitleScreeningMetricsRead(
        total_unique=int(db.exec(base_statement).one()),
        included_title=count_by_status(ScreeningDecisionEnum.INCLUDED),
        excluded_title=count_by_status(ScreeningDecisionEnum.EXCLUDED),
        maybe_title=count_by_status(ScreeningDecisionEnum.MAYBE),
        by_database_source=[
            TitleScreeningSourceMetricsRead(database_source=source_name, **metrics)
            for source_name, metrics in sorted(source_metrics.items())
        ],
    )


def get_title_screening_records_paginated(
    db: Session,
    project_id: uuid.UUID,
    skip: int = 0,
    limit: int = 100,
) -> PaginatedTitleScreeningRecordsResponse:
    """
    Lista todos los registros únicos disponibles para cribado por título.
    Incluye metadatos del registro excepto abstract y la decisión actual de título,
    sea PENDING, EVALUATING, decisión de IA o decisión sobrescrita por el usuario.
    """
    session_obj = get_or_create_screening_session(db, project_id)

    rows_statement = (
        select(ScreeningDecision, ExtractedRecord, SearchResultFile)
        .join(ExtractedRecord, ScreeningDecision.record_id == ExtractedRecord.id)
        .join(SearchResultFile, ExtractedRecord.file_id == SearchResultFile.id)
        .where(SearchResultFile.project_id == project_id)
        .where(ScreeningDecision.screening_session_id == session_obj.id)
        .where(ScreeningDecision.is_duplicate == False)
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
    )

    total = int(db.exec(count_statement).one())
    rows = db.exec(rows_statement.offset(skip).limit(limit)).all()

    items = [
        TitleScreeningRecordRead(
            record_id=record.id,
            file_id=record.file_id,
            database_source=(source_file.database_source or "Sin fuente").strip() or "Sin fuente",
            id_article=generate_article_id(record.title, record.authors),
            title=record.title,
            authors=record.authors,
            publication_year=record.publication_year,
            doi=record.doi,
            source_title=record.source_title,
            is_duplicate=decision.is_duplicate,
            duplicate_review_status=decision.duplicate_review_status,
            passes_title_filter=_passes_title_filter(decision.title_status),
            title_status=decision.title_status,
            title_reason=decision.title_reason,
            title_overridden=_was_overridden(decision.title_reason),
        )
        for decision, record, source_file in rows
    ]

    return PaginatedTitleScreeningRecordsResponse(
        items=items,
        total=total,
        skip=skip,
        limit=limit,
        returned=len(items),
        has_next=skip + len(items) < total,
        has_previous=skip > 0,
    )
