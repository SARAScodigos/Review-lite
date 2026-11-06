"""
Controladores HTTP REST para el Módulo de Exportación e Historial de Versiones del Manuscrito Word (.docx).
"""
import os
from typing import List
import uuid

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse, Response
from sqlmodel import Session

from app.api.models.rsl_export_model import RSLExportVersion
from app.api.schemas.extracted_record_schema import AsyncExtractionResponse
from app.api.schemas.export_schema import RSLExportVersionRead
from app.api.services.rsl_export_service import (
    create_export_version_record,
    delete_export_version,
    list_project_export_versions,
    resolve_export_file_path,
)
from app.api.services.prisma_export_service import build_prisma_pdf, build_prisma_svg
from app.db.session import get_session
from app.workers.tasks import run_export_docx_task
from app.workers.celery_app import celery_app

router = APIRouter(prefix="/projects/{project_id}/exports", tags=["Manuscript DOCX Export & Versioning"])


@router.get("/prisma.svg")
def export_prisma_svg_endpoint(project_id: uuid.UUID, db: Session = Depends(get_session)):
    """Descarga el diagrama PRISMA 2020 vectorial basado en las métricas actuales."""
    return Response(
        content=build_prisma_svg(db, project_id),
        media_type="image/svg+xml",
        headers={"Content-Disposition": f'attachment; filename="prisma_{project_id}.svg"'},
    )


@router.get("/prisma.pdf")
def export_prisma_pdf_endpoint(project_id: uuid.UUID, db: Session = Depends(get_session)):
    """Descarga una versión PDF imprimible del diagrama PRISMA 2020 actual."""
    return Response(
        content=build_prisma_pdf(db, project_id),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="prisma_{project_id}.pdf"'},
    )


@router.post("/generate", response_model=AsyncExtractionResponse)
def generate_docx_export_endpoint(
    project_id: uuid.UUID,
    db: Session = Depends(get_session),
):
    """
    Encola en Celery la generación asíncrona en segundo plano del manuscrito Word (.docx) formato A4, Times New Roman 10pt.
    Asigna automáticamente el número incremental de versión (V1, V2, V3...).
    """
    export_ver = create_export_version_record(db=db, project_id=project_id)

    task = run_export_docx_task.delay(
        str(project_id),
        str(export_ver.id),
    )

    return AsyncExtractionResponse(
        task_id=task.id,
        project_id=project_id,
        version_id=export_ver.id,
        status="QUEUED",
        message=f"Generación del manuscrito Word encolada en Celery (Versión {export_ver.version_label}).",
    )


@router.get("", response_model=List[RSLExportVersionRead])
def list_export_versions_endpoint(
    project_id: uuid.UUID,
    db: Session = Depends(get_session),
):
    """
    Retorna el historial completo de versiones exportadas (V1, V2, V3...) de un proyecto RSL.
    """
    return list_project_export_versions(db, project_id)


@router.get("/tasks/{task_id}/status")
def get_export_task_status_endpoint(project_id: uuid.UUID, task_id: str):
    """Consulta el estado Celery de una generación de manuscrito iniciada por este proyecto."""
    task = AsyncResult(task_id, app=celery_app)
    response = {"task_id": task_id, "status": task.status}
    if task.successful():
        response["result"] = task.result
    elif task.failed():
        response["error"] = str(task.result)
    return response


@router.get("/{version_id}/download")
def download_export_version_file_endpoint(
    project_id: uuid.UUID,
    version_id: uuid.UUID,
    db: Session = Depends(get_session),
):
    """
    Descarga el archivo binario .docx de la versión especificada.
    """
    export_ver = db.get(RSLExportVersion, version_id)
    if not export_ver or export_ver.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la versión de exportación.")

    file_path = resolve_export_file_path(export_ver)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="El archivo físico .docx no existe en el servidor.")

    return FileResponse(
        path=file_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=export_ver.file_name,
    )


@router.delete("/{version_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_export_version_endpoint(
    project_id: uuid.UUID,
    version_id: uuid.UUID,
    db: Session = Depends(get_session),
):
    """
    Elimina físicamente el archivo .docx del servidor y borra la versión del historial en la base de datos.
    """
    delete_export_version(db=db, project_id=project_id, version_id=version_id)
    return None
