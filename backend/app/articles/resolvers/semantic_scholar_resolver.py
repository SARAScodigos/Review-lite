"""
Resolver de PDFs para Semantic Scholar API (Allen Institute for AI).
"""
import re
from typing import Optional
import httpx

from app.articles.base import AbstractPDFResolver
from app.config import settings


class SemanticScholarResolver(AbstractPDFResolver):
    """Adaptador para consultar la API de Semantic Scholar mediante DOI."""

    def __init__(self):
        super().__init__(name="Semantic Scholar API")

    def _clean_doi(self, doi: Optional[str]) -> Optional[str]:
        if not doi:
            return None
        clean = doi.strip().lower()
        clean = re.sub(r"^https?://(dx\.)?doi\.org/", "", clean)
        clean = re.sub(r"^doi:", "", clean)
        return clean.strip() or None

    def resolve_pdf_url(self, doi: Optional[str] = None, url: Optional[str] = None) -> Optional[str]:
        clean_doi = self._clean_doi(doi)
        if not clean_doi:
            return None

        api_url = f"{settings.SEMANTIC_SCHOLAR_API_BASE_URL}{clean_doi}?fields=openAccessPdf,title"

        try:
            with httpx.Client(timeout=15.0, follow_redirects=True) as client:
                response = client.get(api_url)

            if response.status_code != 200:
                return None

            data = response.json()
            oa_pdf = data.get("openAccessPdf") or {}
            pdf_url = oa_pdf.get("url")
            return pdf_url if pdf_url else None
        except Exception:
            return None
