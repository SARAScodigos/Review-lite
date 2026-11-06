"""
Resolver de PDFs para CrossRef API.
"""
import re
from typing import Optional
import httpx

from app.articles.base import AbstractPDFResolver
from app.config import settings


class CrossRefResolver(AbstractPDFResolver):
    """Adaptador para consultar la API de CrossRef buscando enlaces en abierto con MIME application/pdf."""

    def __init__(self):
        super().__init__(name="CrossRef API")

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

        api_url = f"{settings.CROSSREF_API_BASE_URL}/{clean_doi}"
        headers = {
            "User-Agent": f"A-Review/1.0 (mailto:{settings.UNPAYWALL_EMAIL})"
        }

        try:
            with httpx.Client(timeout=15.0, follow_redirects=True) as client:
                response = client.get(api_url, headers=headers)

            if response.status_code != 200:
                return None

            data = response.json()
            message = data.get("message") or {}
            links = message.get("link") or []

            for link in links:
                content_type = link.get("content-type", "").lower()
                intended_application = link.get("intended-application", "").lower()
                pdf_url = link.get("URL")

                if pdf_url and ("pdf" in content_type or intended_application in ("text-mining", "similarity-checking")):
                    return pdf_url

            return None
        except Exception:
            return None
