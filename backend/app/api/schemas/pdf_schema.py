"""
Esquemas Pydantic para endpoints HTTP de gestión, descarga y subida manual de PDFs.
"""
from datetime import datetime
from typing import List, Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field

from app.api.models.article_pdf_model import PDFDownloadStatus
from app.api.models.screening_model import ScreeningDecisionEnum
from app.articles.schemas import PDFDownloadResult


class ArticlePDFRead(BaseModel):
    """Esquema de respuesta para la trazabilidad de un archivo PDF en la API."""

    id: uuid.UUID
    project_id: uuid.UUID
    record_id: uuid.UUID
    download_status: PDFDownloadStatus
    file_path: Optional[str] = None
    download_source: Optional[str] = None
    file_size_bytes: Optional[int] = None
    sha256_checksum: Optional[str] = None
    pdf_url: Optional[str] = None
    error_message: Optional[str] = None
    is_manually_uploaded: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PDFDownloadCandidateRead(BaseModel):
    """Artículo apto para descargar o cargar manualmente su PDF."""

    position: int
    record_id: uuid.UUID
    file_id: uuid.UUID
    database_source: str
    id_article: str
    title: Optional[str] = None
    authors: Optional[str] = None
    publication_year: Optional[int] = None
    doi: Optional[str] = None
    title_status: ScreeningDecisionEnum
    title_reason: Optional[str] = None
    abstract_status: ScreeningDecisionEnum
    pdf_download_status: PDFDownloadStatus
    pdf_file_path: Optional[str] = None
    pdf_download_source: Optional[str] = None
    pdf_error_message: Optional[str] = None
    pdf_is_manually_uploaded: bool = False


class PaginatedPDFDownloadCandidatesResponse(BaseModel):
    """Página de artículos aptos para gestión de PDFs."""

    items: List[PDFDownloadCandidateRead]
    total: int
    skip: int
    limit: int
    returned: int
    has_next: bool
    has_previous: bool


class PDFDownloadProcessStatusRead(BaseModel):
    """Estado de una ejecución de Celery y distribución actual de PDFs aptos."""

    project_id: uuid.UUID
    task_id: Optional[str] = None
    task_status: Optional[str] = None
    total_eligible: int
    pending_auto_download: int
    downloading: int
    downloaded: int
    pending_manual_upload: int
    manually_uploaded: int
    errors: int


class TestPDFDownloadRequest(BaseModel):
    """Payload para probar de forma directa la descarga de cualquier DOI o URL desde Swagger UI."""

    doi: Optional[str] = Field(
        default="10.48550/arXiv.2303.08774",
        example="10.48550/arXiv.2303.08774",
        description="Identificador DOI para resolver el PDF en acceso abierto",
    )
    url: Optional[str] = Field(
        default=None,
        example="https://arxiv.org/pdf/2303.08774.pdf",
        description="URL directa opcional al PDF o página web con meta-tags citation_pdf_url",
    )
