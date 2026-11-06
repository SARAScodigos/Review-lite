"""
Módulo de Gestión y Descarga Automática de Artículos y Documentos PDF.
"""
from app.articles.base import AbstractPDFResolver, calculate_sha256, download_pdf_stream
from app.articles.manager import PDFDownloadManager
from app.articles.schemas import DownloadStatusEnum, PDFDownloadResult

__all__ = [
    "AbstractPDFResolver",
    "calculate_sha256",
    "download_pdf_stream",
    "PDFDownloadManager",
    "DownloadStatusEnum",
    "PDFDownloadResult",
]
