"""
Controlador HTTP para la ejecución y consulta del Cribado por Abstract con IA (Fase 2 del Hito 2).
"""
from typing import List
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.api.schemas.extracted_record_schema import AsyncExtractionResponse
from app.api.schemas.screening.abstract_screening_schema import (
    AbstractScreeningItemRead,
    AbstractScreeningMetricsRead,
    PaginatedAbstractScreeningRecordsResponse,
    StartAbstractScreeningRequest,
)
from app.api.services.screening.abstract_screening_service import (
    get_abstract_screening_records_paginated,
    get_abstract_screening_results,
    get_abstract_screening_metrics,
    validate_abstract_screening_prerequisites,
)
from app.api.services.screening.deduplication_service import get_or_create_screening_session
from app.db.session import get_session
from app.workers.tasks import run_abstract_screening_task

router = APIRouter()


@router.post("/abstract/run", response_model=AsyncExtractionResponse)
def start_abstract_screening_endpoint(
    project_id: uuid.UUID,
    payload: StartAbstractScreeningRequest = StartAbstractScreeningRequest(),
    db: Session = Depends(get_session),
):
    """
    Inicia la tarea asíncrona en Celery para el cribado profundo por abstract con la IA seleccionada.
    """
    session_obj = get_or_create_screening_session(db, project_id)
    validate_abstract_screening_prerequisites(db, session_obj)

    task = run_abstract_screening_task.delay(
        str(project_id),
        payload.provider,
        payload.model,
        payload.temperature,
        payload.re_run,
    )

    return AsyncExtractionResponse(
        task_id=task.id,
        project_id=project_id,
        status="QUEUED",
        message=f"Proceso de cribado por abstract encolado exitosamente en Celery con IA ({payload.provider} / {payload.model}).",
    )


@router.get("/abstract/results", response_model=List[AbstractScreeningItemRead])
def get_abstract_screening_results_endpoint(
    project_id: uuid.UUID,
    db: Session = Depends(get_session),
):
    """
    Retorna la lista de resultados del cribado por abstract con las justificaciones detalladas de la IA.
    """
    return get_abstract_screening_results(db, project_id)


@router.get("/abstract/metrics", response_model=AbstractScreeningMetricsRead)
def get_abstract_screening_metrics_endpoint(
    project_id: uuid.UUID,
    db: Session = Depends(get_session),
):
    """Retorna los contadores de abstract para los indicadores del frontend."""
    return get_abstract_screening_metrics(db, project_id)


@router.get("/abstract/records", response_model=PaginatedAbstractScreeningRecordsResponse)
def get_abstract_screening_records_endpoint(
    project_id: uuid.UUID,
    skip: int = Query(default=0, ge=0, description="Registros de cribado por abstract a omitir"),
    limit: int = Query(default=100, ge=1, le=500, description="Límite por página"),
    db: Session = Depends(get_session),
):
    """
    Retorna los registros disponibles para cribado por abstract con paginación.
    Incluye abstract, decisión de título y estado/decisión actual de abstract.
    """
    return get_abstract_screening_records_paginated(
        db=db,
        project_id=project_id,
        skip=skip,
        limit=limit,
    )
