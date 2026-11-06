"""
Servicio de Negocio para la Descarga Automática (Open Access) y Gestión de PDFs de Artículos Científicos.
Orquesta la descarga masiva mediante PDFDownloadManager (Unpaywall, Semantic Scholar, CrossRef y URL Directa)
con concurrencia multihilo y administra la subida manual de PDFs por el usuario.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
import os
from typing import Dict, List, Optional, Tuple
import uuid

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlmodel import Session, select

from app.api.models.article_pdf_model import ArticlePDF, PDFDownloadStatus
from app.api.models.extracted_record_model import ExtractedRecord
from app.api.models.rsl_project_model import RSLProject
from app.api.models.search_result_file_model import SearchResultFile
from app.api.models.screening_model import ScreeningDecision, ScreeningDecisionEnum
from app.api.schemas.pdf_schema import (
    PDFDownloadCandidateRead,
    PDFDownloadProcessStatusRead,
    PaginatedPDFDownloadCandidatesResponse,
)
from app.articles.base import calculate_sha256
from app.articles.manager import PDFDownloadManager
from app.articles.schemas import DownloadStatusEnum, PDFDownloadResult
from app.config import settings
from app.db.session import engine
from app.api.services.screening.deduplication_service import (
    generate_article_id,
    get_or_create_screening_session,
)


def _to_app_relative_path(file_path: str) -> str:
    """Convierte una ruta física bajo app/ a una ruta persistible relativa al backend."""
    app_root = os.path.abspath(os.path.join(os.getcwd(), "app"))
    absolute_path = os.path.abspath(file_path)
    if os.path.commonpath([app_root, absolute_path]) != app_root:
        raise ValueError("La ruta del PDF debe estar dentro de app/.")
    return os.path.relpath(absolute_path, os.getcwd())


def resolve_pdf_file_path(file_path: str) -> str:
    """Resuelve y valida una ruta persistida para que no salga del directorio app/."""
    app_root = os.path.abspath(os.path.join(os.getcwd(), "app"))
    absolute_path = os.path.abspath(file_path if os.path.isabs(file_path) else os.path.join(os.getcwd(), file_path))
    if os.path.commonpath([app_root, absolute_path]) != app_root:
        raise ValueError("La ruta del PDF almacenada no pertenece al directorio app/.")
    return absolute_path


def _eligible_pdf_decisions_statement(db: Session, project_id: uuid.UUID):
    session_obj = get_or_create_screening_session(db, project_id)
    return (
        select(ScreeningDecision, ExtractedRecord, SearchResultFile, ArticlePDF)
        .join(ExtractedRecord, ScreeningDecision.record_id == ExtractedRecord.id)
        .join(SearchResultFile, ExtractedRecord.file_id == SearchResultFile.id)
        .outerjoin(
            ArticlePDF,
            (ArticlePDF.project_id == project_id) & (ArticlePDF.record_id == ExtractedRecord.id),
        )
        .where(SearchResultFile.project_id == project_id)
        .where(ScreeningDecision.screening_session_id == session_obj.id)
        .where(ScreeningDecision.is_duplicate == False)
        .where(ScreeningDecision.title_status.in_([ScreeningDecisionEnum.INCLUDED, ScreeningDecisionEnum.MAYBE]))
        .where(ScreeningDecision.abstract_status.in_([ScreeningDecisionEnum.PENDING, ScreeningDecisionEnum.INCLUDED]))
    )


def get_or_create_article_pdf(db: Session, project_id: uuid.UUID, record_id: uuid.UUID) -> ArticlePDF:
    """Obtiene o crea un registro de trazabilidad ArticlePDF en la base de datos."""
    statement = (
        select(ArticlePDF)
        .where(ArticlePDF.project_id == project_id)
        .where(ArticlePDF.record_id == record_id)
    )
    pdf_obj = db.exec(statement).first()

    if not pdf_obj:
        pdf_obj = ArticlePDF(
            project_id=project_id,
            record_id=record_id,
            download_status=PDFDownloadStatus.PENDING_AUTO_DOWNLOAD,
        )
        db.add(pdf_obj)
        db.commit()
        db.refresh(pdf_obj)

    return pdf_obj


def get_pdf_download_candidates_paginated(
    db: Session,
    project_id: uuid.UUID,
    skip: int = 0,
    limit: int = 100,
) -> PaginatedPDFDownloadCandidatesResponse:
    """Lista los artículos aptos para obtener o cargar manualmente un PDF."""
    rows_statement = _eligible_pdf_decisions_statement(db, project_id).order_by(
        ExtractedRecord.created_at,
        ExtractedRecord.id,
    )
    count_statement = (
        select(func.count())
        .select_from(ScreeningDecision)
        .join(ExtractedRecord, ScreeningDecision.record_id == ExtractedRecord.id)
        .join(SearchResultFile, ExtractedRecord.file_id == SearchResultFile.id)
        .where(SearchResultFile.project_id == project_id)
        .where(ScreeningDecision.is_duplicate == False)
        .where(ScreeningDecision.title_status.in_([ScreeningDecisionEnum.INCLUDED, ScreeningDecisionEnum.MAYBE]))
        .where(ScreeningDecision.abstract_status.in_([ScreeningDecisionEnum.PENDING, ScreeningDecisionEnum.INCLUDED]))
    )
    session_obj = get_or_create_screening_session(db, project_id)
    count_statement = count_statement.where(ScreeningDecision.screening_session_id == session_obj.id)

    total = int(db.exec(count_statement).one())
    rows = db.exec(rows_statement.offset(skip).limit(limit)).all()
    items = []
    for index, (decision, record, source_file, pdf_obj) in enumerate(rows, start=skip + 1):
        stored_path = pdf_obj.file_path if pdf_obj else None
        relative_path = _to_app_relative_path(stored_path) if stored_path else None
        items.append(
            PDFDownloadCandidateRead(
                position=index,
                record_id=record.id,
                file_id=record.file_id,
                database_source=(source_file.database_source or "Sin fuente").strip() or "Sin fuente",
                id_article=generate_article_id(record.title, record.authors),
                title=record.title,
                authors=record.authors,
                publication_year=record.publication_year,
                doi=record.doi,
                title_status=decision.title_status,
                title_reason=decision.title_reason,
                abstract_status=decision.abstract_status,
                pdf_download_status=(pdf_obj.download_status if pdf_obj else PDFDownloadStatus.PENDING_AUTO_DOWNLOAD),
                pdf_file_path=relative_path,
                pdf_download_source=(pdf_obj.download_source if pdf_obj else None),
                pdf_error_message=(pdf_obj.error_message if pdf_obj else None),
                pdf_is_manually_uploaded=(pdf_obj.is_manually_uploaded if pdf_obj else False),
            )
        )

    return PaginatedPDFDownloadCandidatesResponse(
        items=items,
        total=total,
        skip=skip,
        limit=limit,
        returned=len(items),
        has_next=skip + len(items) < total,
        has_previous=skip > 0,
    )


def get_pdf_download_process_status(
    db: Session,
    project_id: uuid.UUID,
    task_id: Optional[str] = None,
    task_status: Optional[str] = None,
) -> PDFDownloadProcessStatusRead:
    """Resume el estado del proceso y de los PDFs de los artículos aptos."""
    rows = db.exec(_eligible_pdf_decisions_statement(db, project_id)).all()
    statuses = [pdf_obj.download_status if pdf_obj else PDFDownloadStatus.PENDING_AUTO_DOWNLOAD for _, _, _, pdf_obj in rows]

    return PDFDownloadProcessStatusRead(
        project_id=project_id,
        task_id=task_id,
        task_status=task_status,
        total_eligible=len(statuses),
        pending_auto_download=sum(status == PDFDownloadStatus.PENDING_AUTO_DOWNLOAD for status in statuses),
        downloading=sum(status == PDFDownloadStatus.DOWNLOADING for status in statuses),
        downloaded=sum(status == PDFDownloadStatus.DOWNLOADED for status in statuses),
        pending_manual_upload=sum(status == PDFDownloadStatus.PENDING_MANUAL_UPLOAD for status in statuses),
        manually_uploaded=sum(status == PDFDownloadStatus.MANUALLY_UPLOADED for status in statuses),
        errors=sum(status == PDFDownloadStatus.ERROR for status in statuses),
    )


def process_single_pdf_download(
    project_id: uuid.UUID,
    record_id: uuid.UUID,
    doi: Optional[str] = None,
    url: Optional[str] = None,
) -> PDFDownloadStatus:
    """
    Función trabajadora para descargar un PDF de un artículo en paralelo.
    Construye la ruta física app/data/pdfs/{project_id}/{record_id}.pdf,
    ejecuta la descarga con PDFDownloadManager y actualiza su estado en una sesión propia e independiente.
    """
    file_dir = os.path.join(settings.PDF_STORAGE_DIR, str(project_id))
    os.makedirs(file_dir, exist_ok=True)
    destination_path = os.path.join(file_dir, f"{record_id}.pdf")

    manager = PDFDownloadManager()
    result = manager.download_article_pdf(
        destination_path=destination_path,
        doi=doi,
        url=url,
    )

    with Session(engine) as thread_db:
        pdf_entry = thread_db.exec(
            select(ArticlePDF)
            .where(ArticlePDF.project_id == project_id)
            .where(ArticlePDF.record_id == record_id)
        ).first()

        if not pdf_entry:
            pdf_entry = ArticlePDF(
                project_id=project_id,
                record_id=record_id,
                download_status=PDFDownloadStatus.DOWNLOADING,
            )

        if result.success and result.file_path:
            pdf_entry.download_status = PDFDownloadStatus.DOWNLOADED
            pdf_entry.file_path = _to_app_relative_path(result.file_path)
            pdf_entry.file_size_bytes = result.file_size_bytes
            pdf_entry.sha256_checksum = result.sha256_checksum
            pdf_entry.download_source = result.download_source
            pdf_entry.pdf_url = result.pdf_url
            pdf_entry.error_message = None
        elif result.status == DownloadStatusEnum.PENDING_MANUAL_UPLOAD:
            pdf_entry.download_status = PDFDownloadStatus.PENDING_MANUAL_UPLOAD
            pdf_entry.error_message = result.error_message or "No disponible en acceso abierto libre."
        else:
            pdf_entry.download_status = PDFDownloadStatus.ERROR
            pdf_entry.error_message = result.error_message or "La descarga automática no pudo completarse."

        thread_db.add(pdf_entry)
        thread_db.commit()
        return pdf_entry.download_status


def download_project_pdfs_pipeline(
    db: Session,
    project_id: uuid.UUID,
    max_workers: int = 5,
) -> Dict[str, int]:
    """
    Ejecuta el pipeline de descarga masiva de PDFs en acceso abierto para todos los artículos
    victoriosos que superaron el cribado.
    Utiliza ThreadPoolExecutor con max_workers hilos en paralelo y sesiones aisladas por hilo.
    """
    project = db.get(RSLProject, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="El proyecto RSL no existe.")

    # 1. Obtener registros del proyecto aptos tras título y antes/después de abstract incluido.
    session_obj = get_or_create_screening_session(db, project_id)
    victorious_decisions = db.exec(
        select(ScreeningDecision)
        .join(ExtractedRecord, ScreeningDecision.record_id == ExtractedRecord.id)
        .join(SearchResultFile, ExtractedRecord.file_id == SearchResultFile.id)
        .where(SearchResultFile.project_id == project_id)
        .where(ScreeningDecision.screening_session_id == session_obj.id)
        .where(ScreeningDecision.is_duplicate == False)
        .where(ScreeningDecision.title_status.in_([ScreeningDecisionEnum.INCLUDED, ScreeningDecisionEnum.MAYBE]))
        .where(ScreeningDecision.abstract_status.in_([ScreeningDecisionEnum.PENDING, ScreeningDecisionEnum.INCLUDED]))
    ).all()

    if not victorious_decisions:
        return {"downloaded": 0, "pending_manual": 0, "errors": 0}

    record_ids = [d.record_id for d in victorious_decisions]

    # 2. Asegurar que exista una entrada ArticlePDF para cada artículo victorioso
    target_records = db.exec(select(ExtractedRecord).where(ExtractedRecord.id.in_(record_ids))).all()

    records_data: List[Tuple[uuid.UUID, Optional[str], Optional[str]]] = []
    for rec in target_records:
        pdf_obj = get_or_create_article_pdf(db, project_id, rec.id)
        # Solo intentar descargar los que estén pendientes o hayan fallado antes
        if pdf_obj.download_status in (
            PDFDownloadStatus.PENDING_AUTO_DOWNLOAD,
            PDFDownloadStatus.DOWNLOADING,
            PDFDownloadStatus.ERROR,
        ):
            pdf_obj.download_status = PDFDownloadStatus.DOWNLOADING
            db.add(pdf_obj)
            raw_url = rec.raw_data.get("url") if isinstance(rec.raw_data, dict) else None
            records_data.append((rec.id, rec.doi, raw_url))

    db.commit()

    if not records_data:
        all_pdfs = db.exec(select(ArticlePDF).where(ArticlePDF.project_id == project_id)).all()
        return {
            "downloaded": sum(1 for p in all_pdfs if p.download_status in (PDFDownloadStatus.DOWNLOADED, PDFDownloadStatus.MANUALLY_UPLOADED)),
            "pending_manual": sum(1 for p in all_pdfs if p.download_status == PDFDownloadStatus.PENDING_MANUAL_UPLOAD),
            "errors": sum(1 for p in all_pdfs if p.download_status == PDFDownloadStatus.ERROR),
        }

    # 3. Descarga paralela multihilo con datos desacoplados y sesiones por hilo
    downloaded_count = 0
    pending_manual_count = 0
    error_count = 0

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_id = {
            executor.submit(process_single_pdf_download, project_id, rec_id, doi, url): rec_id
            for rec_id, doi, url in records_data
        }

        for future in as_completed(future_to_id):
            rec_id = future_to_id[future]
            try:
                final_status = future.result()
                if final_status == PDFDownloadStatus.DOWNLOADED:
                    downloaded_count += 1
                elif final_status == PDFDownloadStatus.PENDING_MANUAL_UPLOAD:
                    pending_manual_count += 1
                else:
                    error_count += 1
            except Exception as exc:
                error_count += 1
                with Session(engine) as err_db:
                    pdf_entry = err_db.exec(
                        select(ArticlePDF)
                        .where(ArticlePDF.project_id == project_id)
                        .where(ArticlePDF.record_id == rec_id)
                    ).first()
                    if pdf_entry:
                        pdf_entry.download_status = PDFDownloadStatus.ERROR
                        pdf_entry.error_message = f"Error durante la descarga automática: {exc}"
                        err_db.add(pdf_entry)
                        err_db.commit()

    return {
        "downloaded": downloaded_count,
        "pending_manual": pending_manual_count,
        "errors": error_count,
    }


def save_manual_pdf_upload(
    db: Session,
    project_id: uuid.UUID,
    record_id: uuid.UUID,
    file_bytes: bytes,
    original_filename: str,
) -> ArticlePDF:
    """
    Permite al investigador subir manualmente un archivo PDF para un artículo específico.
    Guarda el archivo binario en disco, calcula su hash SHA-256 y actualiza la entidad ArticlePDF.
    """
    rec = db.exec(
        select(ExtractedRecord)
        .join(SearchResultFile, ExtractedRecord.file_id == SearchResultFile.id)
        .where(ExtractedRecord.id == record_id)
        .where(SearchResultFile.project_id == project_id)
    ).first()
    if not rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="El artículo no existe en este proyecto.")

    file_dir = os.path.join(settings.PDF_STORAGE_DIR, str(project_id))
    os.makedirs(file_dir, exist_ok=True)
    destination_path = os.path.join(file_dir, f"{record_id}.pdf")

    # Verificar que sean bytes de PDF (%PDF)
    if not file_bytes.startswith(b"%PDF"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo subido no es un formato PDF válido (Falta cabecera %PDF).",
        )

    try:
        with open(destination_path, "wb") as f:
            f.write(file_bytes)
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="El almacenamiento de PDFs no tiene permisos de escritura para la API.",
        ) from exc

    file_size = os.path.getsize(destination_path)
    checksum = calculate_sha256(destination_path)

    pdf_entry = get_or_create_article_pdf(db, project_id, record_id)
    pdf_entry.download_status = PDFDownloadStatus.MANUALLY_UPLOADED
    pdf_entry.file_path = _to_app_relative_path(destination_path)
    pdf_entry.file_size_bytes = file_size
    pdf_entry.sha256_checksum = checksum
    pdf_entry.download_source = f"MANUAL_USER_UPLOAD ({original_filename})"
    pdf_entry.is_manually_uploaded = True
    pdf_entry.error_message = None

    db.add(pdf_entry)
    db.commit()
    db.refresh(pdf_entry)

    return pdf_entry


def remove_project_record_pdf(
    db: Session,
    project_id: uuid.UUID,
    record_id: uuid.UUID,
) -> ArticlePDF:
    """Retira el archivo físico del PDF y conserva su trazabilidad para una nueva carga manual."""
    rec = db.exec(
        select(ExtractedRecord)
        .join(SearchResultFile, ExtractedRecord.file_id == SearchResultFile.id)
        .where(ExtractedRecord.id == record_id)
        .where(SearchResultFile.project_id == project_id)
    ).first()
    if not rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="El artículo no existe en este proyecto.")

    pdf_entry = db.exec(
        select(ArticlePDF)
        .where(ArticlePDF.project_id == project_id)
        .where(ArticlePDF.record_id == record_id)
    ).first()
    if not pdf_entry or not pdf_entry.file_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="El artículo no tiene un PDF almacenado.")

    try:
        physical_path = resolve_pdf_file_path(pdf_entry.file_path)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La ruta del PDF almacenada no es válida.") from exc

    if os.path.exists(physical_path):
        try:
            os.remove(physical_path)
        except PermissionError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="El almacenamiento de PDFs no tiene permisos para retirar el archivo.",
            ) from exc

    pdf_entry.download_status = PDFDownloadStatus.PENDING_MANUAL_UPLOAD
    pdf_entry.file_path = None
    pdf_entry.download_source = None
    pdf_entry.file_size_bytes = None
    pdf_entry.sha256_checksum = None
    pdf_entry.pdf_url = None
    pdf_entry.error_message = "PDF retirado por el usuario."
    pdf_entry.is_manually_uploaded = False

    db.add(pdf_entry)
    db.commit()
    db.refresh(pdf_entry)
    return pdf_entry


def get_project_pdf_list(db: Session, project_id: uuid.UUID) -> List[ArticlePDF]:
    """Retorna la lista de todos los registros de PDF del proyecto RSL."""
    return db.exec(select(ArticlePDF).where(ArticlePDF.project_id == project_id)).all()
