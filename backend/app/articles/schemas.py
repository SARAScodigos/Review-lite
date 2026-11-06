"""
Esquemas Pydantic y DTOs para el resultado de resolución y descarga de archivos PDF.
"""
from enum import Enum
from typing import Optional
from pydantic import BaseModel


class DownloadStatusEnum(str, Enum):
    DOWNLOADED = "DOWNLOADED"
    PENDING_MANUAL_UPLOAD = "PENDING_MANUAL_UPLOAD"
    ERROR = "ERROR"


class PDFDownloadResult(BaseModel):
    """Objeto DTO devuelto por los resolveres de PDFs con la metadata del archivo descargado."""

    success: bool
    status: DownloadStatusEnum
    file_path: Optional[str] = None
    file_size_bytes: Optional[int] = None
    sha256_checksum: Optional[str] = None
    download_source: Optional[str] = None
    pdf_url: Optional[str] = None
    error_message: Optional[str] = None
