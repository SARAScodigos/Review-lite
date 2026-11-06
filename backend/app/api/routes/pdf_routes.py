"""
Controladores de Rutas HTTP para la Descarga Masiva, Subida Manual de PDFs y Prueba Directa por DOI/URL.
"""
import os
from typing import List
import uuid

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlmodel import Session, select

from app.api.models.article_pdf_model import ArticlePDF
from app.api.schemas.extracted_record_schema import AsyncExtractionResponse
from app.api.schemas.pdf_schema import (
    ArticlePDFRead,
    PDFDownloadProcessStatusRead,
    PaginatedPDFDownloadCandidatesResponse,
    TestPDFDownloadRequest,
)
from app.api.services.pdf_service import (
    get_pdf_download_candidates_paginated,
    get_pdf_download_process_status,
    get_project_pdf_list,
    remove_project_record_pdf,
    resolve_pdf_file_path,
    save_manual_pdf_upload,
)
from app.articles.manager import PDFDownloadManager
from app.articles.schemas import PDFDownloadResult
from app.config import settings
from app.db.session import get_session
from app.workers.celery_app import celery_app
from app.workers.tasks import run_pdf_download_task

router = APIRouter()


@router.post("/projects/{project_id}/pdfs/download-all", response_model=AsyncExtractionResponse, tags=["PDF Management"])
def download_all_project_pdfs_endpoint(
    project_id: uuid.UUID,
    db: Session = Depends(get_session),
):
    """
    Inicia la tarea asíncrona en Celery para la descarga masiva en acceso abierto de los PDFs del proyecto.
    """
    task = run_pdf_download_task.delay(str(project_id))

    return AsyncExtractionResponse(
        task_id=task.id,
        project_id=project_id,
        status="QUEUED",
        message="Descarga masiva de PDFs encolada exitosamente en Celery (Unpaywall, Semantic Scholar, CrossRef).",
    )


@router.get("/projects/{project_id}/pdfs", response_model=List[ArticlePDFRead], tags=["PDF Management"])
def list_project_pdfs_endpoint(
    project_id: uuid.UUID,
    db: Session = Depends(get_session),
):
    """
    Retorna la lista completa de trazabilidad de archivos PDF del proyecto RSL.
    """
    return get_project_pdf_list(db, project_id)


@router.get(
    "/projects/{project_id}/pdfs/eligible",
    response_model=PaginatedPDFDownloadCandidatesResponse,
    tags=["PDF Management"],
)
def get_pdf_download_candidates_endpoint(
    project_id: uuid.UUID,
    skip: int = Query(default=0, ge=0, description="Registros a omitir"),
    limit: int = Query(default=100, ge=1, le=500, description="Límite por página"),
    db: Session = Depends(get_session),
):
    """Retorna la mesa paginada de artículos aptos para descargar o cargar PDFs."""
    return get_pdf_download_candidates_paginated(db, project_id, skip, limit)


@router.get(
    "/projects/{project_id}/pdfs/download-status",
    response_model=PDFDownloadProcessStatusRead,
    tags=["PDF Management"],
)
def get_pdf_download_status_endpoint(
    project_id: uuid.UUID,
    task_id: str | None = Query(default=None, description="ID devuelto por download-all"),
    db: Session = Depends(get_session),
):
    """Consulta el estado de la tarea opcional de Celery y los PDFs aptos del proyecto."""
    task_status = AsyncResult(task_id, app=celery_app).status if task_id else None
    return get_pdf_download_process_status(db, project_id, task_id, task_status)


@router.post("/projects/{project_id}/records/{record_id}/pdf/upload", response_model=ArticlePDFRead, tags=["PDF Management"])
async def upload_manual_pdf_endpoint(
    project_id: uuid.UUID,
    record_id: uuid.UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_session),
):
    """
    Permite al investigador subir manualmente el archivo PDF de un artículo desde la interfaz.
    """
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El archivo subido está vacío.")

    return save_manual_pdf_upload(
        db=db,
        project_id=project_id,
        record_id=record_id,
        file_bytes=file_bytes,
        original_filename=file.filename or "archivo.pdf",
    )


@router.put("/projects/{project_id}/records/{record_id}/pdf", response_model=ArticlePDFRead, tags=["PDF Management"])
async def replace_pdf_endpoint(
    project_id: uuid.UUID,
    record_id: uuid.UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_session),
):
    """Reemplaza el PDF actual del artículo por el archivo enviado en multipart/form-data."""
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El archivo subido está vacío.")

    return save_manual_pdf_upload(
        db=db,
        project_id=project_id,
        record_id=record_id,
        file_bytes=file_bytes,
        original_filename=file.filename or "archivo.pdf",
    )


@router.delete("/projects/{project_id}/records/{record_id}/pdf", response_model=ArticlePDFRead, tags=["PDF Management"])
def remove_pdf_endpoint(
    project_id: uuid.UUID,
    record_id: uuid.UUID,
    db: Session = Depends(get_session),
):
    """Retira el PDF físico del artículo y mantiene su trazabilidad para una nueva carga manual."""
    return remove_project_record_pdf(db, project_id, record_id)


@router.get("/projects/{project_id}/records/{record_id}/pdf/file", tags=["PDF Management"])
def get_pdf_binary_file_endpoint(
    project_id: uuid.UUID,
    record_id: uuid.UUID,
    db: Session = Depends(get_session),
):
    """
    Sirve el archivo binario PDF almacenado en disco para visualización o descarga directa en el navegador.
    """
    pdf_obj = db.exec(
        select(ArticlePDF)
        .where(ArticlePDF.project_id == project_id)
        .where(ArticlePDF.record_id == record_id)
    ).first()

    if not pdf_obj or not pdf_obj.file_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El archivo PDF físico no se encuentra almacenado en el servidor.",
        )

    try:
        resolved_path = resolve_pdf_file_path(pdf_obj.file_path)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La ruta del PDF almacenada no es válida.",
        )

    if not os.path.exists(resolved_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El archivo PDF físico no se encuentra almacenado en el servidor.",
        )

    return FileResponse(
        path=resolved_path,
        media_type="application/pdf",
        filename=f"{record_id}.pdf",
    )


@router.post("/pdfs/test-download", response_model=PDFDownloadResult, tags=["PDF Test Direct Endpoint"])
def test_direct_pdf_download_endpoint(
    payload: TestPDFDownloadRequest,
):
    """
    Ruta directa de prueba rápida para verificar los resolveres de PDFs en vivo por DOI o URL.
    Guarda el archivo descargado en app/data/pdfs/test_download.pdf sin requerir proyectos ni BD.
    """
    if not payload.doi and not payload.url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debes proporcionar al menos un 'doi' o una 'url' para la prueba.",
        )

    os.makedirs(settings.PDF_STORAGE_DIR, exist_ok=True)
    destination_path = os.path.join(settings.PDF_STORAGE_DIR, "test_download.pdf")

    manager = PDFDownloadManager()
    result = manager.download_article_pdf(
        destination_path=destination_path,
        doi=payload.doi,
        url=payload.url,
    )

    return result
