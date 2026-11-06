"""
Orquestador Principal de Descarga de PDFs (Chain of Responsibility Pattern).
Intenta descargar secuencialmente por Unpaywall, Semantic Scholar, CrossRef y URL Directa.
"""
from typing import List, Optional

from app.articles.base import AbstractPDFResolver
from app.articles.resolvers import (
    CrossRefResolver,
    DirectURLResolver,
    SemanticScholarResolver,
    UnpaywallResolver,
)
from app.articles.schemas import DownloadStatusEnum, PDFDownloadResult


class PDFDownloadManager:
    """Administrador que coordina la resolución y descarga de PDFs científicos en cadena."""

    def __init__(self, custom_resolvers: Optional[List[AbstractPDFResolver]] = None):
        self.resolvers: List[AbstractPDFResolver] = custom_resolvers or [
            UnpaywallResolver(),
            SemanticScholarResolver(),
            CrossRefResolver(),
            DirectURLResolver(),
        ]

    def download_article_pdf(
        self,
        destination_path: str,
        doi: Optional[str] = None,
        url: Optional[str] = None,
    ) -> PDFDownloadResult:
        """
        Ejecuta la cadena de resolvers secuencialmente.
        Se detiene y devuelve el resultado tan pronto como un resolver descargue con éxito el PDF.
        """
        last_result = None

        for resolver in self.resolvers:
            result = resolver.resolve_and_download(
                destination_path=destination_path,
                doi=doi,
                url=url,
            )

            if result.success:
                return result

            last_result = result

        return last_result or PDFDownloadResult(
            success=False,
            status=DownloadStatusEnum.PENDING_MANUAL_UPLOAD,
            error_message="No se pudo descargar el PDF mediante ninguno de los resolveres de acceso abierto configurados.",
        )
