"""
Resolver de PDFs para Unpaywall API (El índice global de Open Access).
"""
import re
from typing import Optional
import httpx

from app.articles.base import AbstractPDFResolver
from app.config import settings


class UnpaywallResolver(AbstractPDFResolver):
    """Adaptador para consultar la API de Unpaywall mediante DOI."""

    def __init__(self):
        super().__init__(name="Unpaywall API")

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

        email = settings.UNPAYWALL_EMAIL or "wjulcamore@gmail.com"
        api_url = f"{settings.UNPAYWALL_API_BASE_URL}/{clean_doi}?email={email}"

        try:
            with httpx.Client(timeout=15.0, follow_redirects=True) as client:
                response = client.get(api_url)

            if response.status_code != 200:
                return None

            data = response.json()
            is_oa = data.get("is_oa", False)
            if not is_oa:
                return None

            # 1. Probar el mejor enlace de acceso abierto (best_oa_location)
            best_location = data.get("best_oa_location") or {}
            pdf_url = best_location.get("url_for_pdf")
            if pdf_url:
                return pdf_url

            # 2. Probar otros enlaces de la lista oa_locations
            oa_locations = data.get("oa_locations") or []
            for loc in oa_locations:
                loc_pdf = loc.get("url_for_pdf")
                if loc_pdf:
                    return loc_pdf

            return None
        except Exception:
            return None
