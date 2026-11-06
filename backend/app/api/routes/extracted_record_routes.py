from typing import List
import uuid
from celery.result import AsyncResult
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.api.schemas.extracted_record_schema import (
    AsyncExtractionResponse,
    ExtractedRecordRead,
    PaginatedExtractedRecordsResponse,
    TaskStatusResponse,
)
from app.api.services import extracted_record_service, search_result_file_service
from app.db.session import get_session
from app.workers.celery_app import celery_app
from app.workers.tasks import extract_search_file_task

router = APIRouter(tags=["Extracted Records"])


@router.post(
    "/search-files/{file_id}/extract/",
    response_model=AsyncExtractionResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def extract_file_records_async(
    file_id: uuid.UUID,
    session: Session = Depends(get_session),
):
    """
    Encola la tarea asíncrona de extracción en Redis para ser procesada por Celery.
    Responde inmediatamente un HTTP 202 Accepted con el 'task_id' para monitorear su progreso.
    """
    search_file = search_result_file_service.get_file_by_id(session=session, file_id=file_id)
    if not search_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Archivo de búsqueda con ID {file_id} no encontrado.",
        )

    task = extract_search_file_task.delay(str(file_id))

    return AsyncExtractionResponse(
        task_id=task.id,
        file_id=file_id,
        status="PENDING",
        message="La tarea de extracción ha sido encolada en Redis y está siendo procesada en segundo plano por Celery.",
    )


@router.get(
    "/tasks/{task_id}/status",
    response_model=TaskStatusResponse,
)
def get_task_status(task_id: str):
    """
    Consulta el estado actual de una tarea asíncrona enviada a Celery/Redis.
    Estados posibles: PENDING, STARTED, SUCCESS, FAILURE.
    """
    task_result = AsyncResult(task_id, app=celery_app)

    result_data = None
    error_msg = None
    if task_result.ready():
        if task_result.successful():
            result_data = task_result.result
        else:
            error_msg = str(task_result.result) if task_result.result else "Error en la tarea de extracción de archivo."
            result_data = error_msg

    return TaskStatusResponse(
        task_id=task_id,
        status=task_result.status,
        result=result_data,
        error=error_msg,
    )


@router.get(
    "/search-files/{file_id}/records/",
    response_model=PaginatedExtractedRecordsResponse,
)
def list_file_extracted_records(
    file_id: uuid.UUID,
    skip: int = Query(default=0, ge=0, description="Registros a omitir"),
    limit: int = Query(default=100, ge=1, le=500, description="Límite por página"),
    session: Session = Depends(get_session),
):
    """Obtiene la lista paginada de registros/artículos extraídos de un archivo de búsqueda."""
    search_file = search_result_file_service.get_file_by_id(session=session, file_id=file_id)
    if not search_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Archivo de búsqueda con ID {file_id} no encontrado.",
        )

    total = extracted_record_service.count_records_by_file(session=session, file_id=file_id)
    records = extracted_record_service.get_records_by_file(
        session=session, file_id=file_id, skip=skip, limit=limit
    )

    return PaginatedExtractedRecordsResponse(
        items=records,
        total=total,
        skip=skip,
        limit=limit,
        returned=len(records),
        has_next=skip + len(records) < total,
        has_previous=skip > 0,
    )


@router.get(
    "/extracted-records/{record_id}",
    response_model=ExtractedRecordRead,
)
def get_extracted_record(
    record_id: uuid.UUID,
    session: Session = Depends(get_session),
):
    """Obtiene un registro extraído individual por su UUID."""
    record = extracted_record_service.get_record_by_id(session=session, record_id=record_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Registro extraído con ID {record_id} no encontrado.",
        )
    return record
