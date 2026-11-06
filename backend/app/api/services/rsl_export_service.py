"""
Servicio de Negocio para la Generación e Historial de Versiones de Exportación del Manuscrito en Word (.docx).
"""
from datetime import datetime
import os
from typing import List, Optional
import uuid

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.api.models.rsl_export_model import ExportStatus, RSLExportVersion
from app.api.models.rsl_project_model import RSLProject
from app.api.models.synthesis_model import RSLSynthesisSection
from app.api.services.export_docx_builder import build_rsl_manuscript_docx
from app.articles.base import calculate_sha256
from app.config import settings


def get_export_destination(project_id: uuid.UUID, file_name: str) -> str:
    """Ruta canónica compartida por API y worker dentro de `app/data/exports`."""
    return os.path.join(settings.EXPORTS_STORAGE_DIR, str(project_id), os.path.basename(file_name))


def resolve_export_file_path(export_ver: RSLExportVersion) -> str:
    """Resuelve versiones antiguas creadas con una ruta absoluta dependiente del host."""
    if export_ver.file_path and os.path.exists(export_ver.file_path):
        return export_ver.file_path
    return get_export_destination(export_ver.project_id, export_ver.file_name)


def create_export_version_record(db: Session, project_id: uuid.UUID) -> RSLExportVersion:
    """
    Crea el registro de la nueva versión de exportación (V1, V2, V3...) en la base de datos
    antes de encolar la tarea asíncrona en Celery.
    """
    project = db.get(RSLProject, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="El proyecto RSL no existe.")

    # Buscar la última versión registrada para incrementar el número V1, V2...
    existing_versions = db.exec(
        select(RSLExportVersion)
        .where(RSLExportVersion.project_id == project_id)
        .order_by(RSLExportVersion.version_number.desc())
    ).all()

    next_num = (existing_versions[0].version_number + 1) if existing_versions else 1
    version_label = f"V{next_num}"

    clean_title = project.title[:20].strip().replace(" ", "_")
    clean_title = "".join(c for c in clean_title if c.isalnum() or c == "_")
    filename = f"Manuscrito_RSL_{clean_title}_{version_label}.docx"
    dest_path = get_export_destination(project_id, filename)

    export_ver = RSLExportVersion(
        project_id=project_id,
        version_number=next_num,
        version_label=version_label,
        file_path=dest_path,
        file_name=filename,
        export_status=ExportStatus.PENDING,
    )

    db.add(export_ver)
    db.commit()
    db.refresh(export_ver)
    return export_ver


def generate_docx_export_pipeline(db: Session, project_id: uuid.UUID, version_id: uuid.UUID) -> RSLExportVersion:
    """
    Ejecuta el pipeline de construcción del documento .docx en Word desde las tablas de síntesis.
    """
    export_ver = db.get(RSLExportVersion, version_id)
    if not export_ver or export_ver.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró el registro de exportación.")

    project = db.get(RSLProject, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="El proyecto RSL no existe.")

    export_ver.export_status = ExportStatus.GENERATING
    export_ver.file_path = get_export_destination(project_id, export_ver.file_name)
    db.add(export_ver)
    db.commit()

    try:
        # Traer todas las secciones de síntesis creadas en el proyecto
        sections = db.exec(
            select(RSLSynthesisSection)
            .where(RSLSynthesisSection.project_id == project_id)
            .order_by(RSLSynthesisSection.order_index.asc())
        ).all()

        # Construir archivo Word en disco
        file_path = build_rsl_manuscript_docx(
            project=project,
            sections=sections,
            destination_path=export_ver.file_path,
        )

        file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0
        checksum = calculate_sha256(file_path) if os.path.exists(file_path) else None

        export_ver.export_status = ExportStatus.COMPLETED
        export_ver.file_size_bytes = file_size
        export_ver.sha256_checksum = checksum

        db.add(export_ver)
        db.commit()
        db.refresh(export_ver)
        return export_ver

    except Exception as e:
        export_ver.export_status = ExportStatus.ERROR
        export_ver.error_message = str(e)
        db.add(export_ver)
        db.commit()
        raise e


def list_project_export_versions(db: Session, project_id: uuid.UUID) -> List[RSLExportVersion]:
    """Retorna la lista de todas las versiones exportadas de un proyecto RSL ordenadas por versión descendente."""
    return db.exec(
        select(RSLExportVersion)
        .where(RSLExportVersion.project_id == project_id)
        .order_by(RSLExportVersion.version_number.desc())
    ).all()


def delete_export_version(db: Session, project_id: uuid.UUID, version_id: uuid.UUID) -> None:
    """
    Elimina una versión de exportación de la base de datos y borra físicamente su archivo .docx del disco.
    """
    export_ver = db.get(RSLExportVersion, version_id)
    if not export_ver or export_ver.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la versión de exportación.")

    # Borrar archivo de disco si existe
    file_path = resolve_export_file_path(export_ver)
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception:
            pass

    db.delete(export_ver)
    db.commit()
