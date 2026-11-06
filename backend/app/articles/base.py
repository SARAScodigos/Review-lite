"""
Clase Abstracta Base (ABC) para los Resolveres de Descarga de PDFs Científicos.
Define el contrato polimórfico (POO) y funciones auxiliares para cálculo de SHA-256 y descarga segura.
"""
from abc import ABC, abstractmethod
import hashlib
import os
from typing import Optional
import httpx

from app.articles.schemas import DownloadStatusEnum, PDFDownloadResult


def calculate_sha256(file_path: str) -> str:
    """Calcula el hash SHA-256 de un archivo en disco para verificar su integridad."""
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


def download_pdf_stream(url: str, destination_path: str, source_name: str, timeout: float = 45.0) -> PDFDownloadResult:
    """
    Función auxiliar para descargar el binario PDF desde una URL directa
    y guardar el archivo en disco creando directorios si no existen.
    """
    os.makedirs(os.path.dirname(destination_path), exist_ok=True)
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,application/pdf,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,es;q=0.8",
        "Sec-Ch-Ua": '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
    }

    try:
        with httpx.Client(timeout=timeout, follow_redirects=True) as client:
            response = client.get(url, headers=headers)
            
            # Si MDPI u otro sitio requiere Referer de la misma landing page
            if response.status_code == 403 or (response.status_code == 200 and not response.content.startswith(b"%PDF")):
                from urllib.parse import urlparse
                parsed = urlparse(url)
                referer_url = f"{parsed.scheme}://{parsed.netloc}"
                headers["Referer"] = referer_url
                response = client.get(url, headers=headers)

        if response.status_code != 200:
            return PDFDownloadResult(
                success=False,
                status=DownloadStatusEnum.ERROR,
                pdf_url=url,
                download_source=source_name,
                error_message=f"HTTP Error {response.status_code} al descargar el PDF.",
            )

        content = response.content

        # Verificar que el contenido sea realmente un PDF binario (Magic bytes %PDF)
        if not content.startswith(b"%PDF"):
            return PDFDownloadResult(
                success=False,
                status=DownloadStatusEnum.ERROR,
                pdf_url=url,
                download_source=source_name,
                error_message="El contenido devuelto por la URL no tiene la cabecera mágica binaria de un PDF (%PDF).",
            )

        with open(destination_path, "wb") as f:
            f.write(content)

        file_size = os.path.getsize(destination_path)
        checksum = calculate_sha256(destination_path)

        return PDFDownloadResult(
            success=True,
            status=DownloadStatusEnum.DOWNLOADED,
            file_path=destination_path,
            file_size_bytes=file_size,
            sha256_checksum=checksum,
            download_source=source_name,
            pdf_url=url,
        )

    except Exception as e:
        return PDFDownloadResult(
            success=False,
            status=DownloadStatusEnum.ERROR,
            pdf_url=url,
            download_source=source_name,
            error_message=f"Excepción de red al descargar PDF: {str(e)}",
        )


class AbstractPDFResolver(ABC):
    """Interfaz abstracta que debe implementar cada proveedor o API de búsqueda de PDFs."""

    def __init__(self, name: str):
        self.name = name

    @abstractmethod
    def resolve_pdf_url(self, doi: Optional[str] = None, url: Optional[str] = None) -> Optional[str]:
        """Consulta la API del proveedor para obtener la URL directa al archivo PDF."""
        pass

    def resolve_and_download(self, destination_path: str, doi: Optional[str] = None, url: Optional[str] = None) -> PDFDownloadResult:
        """Resuelve la URL directa del PDF y lo descarga en disco."""
        pdf_url = self.resolve_pdf_url(doi=doi, url=url)
        if not pdf_url:
            return PDFDownloadResult(
                success=False,
                status=DownloadStatusEnum.PENDING_MANUAL_UPLOAD,
                download_source=self.name,
                error_message=f"No se encontró un PDF en acceso abierto mediante {self.name}.",
            )

        return download_pdf_stream(
            url=pdf_url,
            destination_path=destination_path,
            source_name=self.name,
        )
