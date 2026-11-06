"""
Resolver de PDFs por URL Directa o Extracción de Meta Tags HTML (citation_pdf_url).
"""
import re
from typing import Optional
import httpx

from app.articles.base import AbstractPDFResolver


class DirectURLResolver(AbstractPDFResolver):
    """Adaptador para descargar directamente desde una URL o extraer meta-tags HTML de citación."""

    def __init__(self):
        super().__init__(name="Direct URL / Meta-Tag Resolver")

    def resolve_pdf_url(self, doi: Optional[str] = None, url: Optional[str] = None) -> Optional[str]:
        target_url = url
        if not target_url and doi:
            clean_doi = re.sub(r"^https?://(dx\.)?doi\.org/", "", doi.strip().lower())
            clean_doi = re.sub(r"^doi:", "", clean_doi)
            target_url = f"https://doi.org/{clean_doi}"

        if not target_url:
            return None

        # Caso especial para MDPI (DOIs 10.3390/... o dominios mdpi.com)
        if doi and "10.3390/" in doi.lower():
            clean_doi = re.sub(r"^https?://(dx\.)?doi\.org/", "", doi.strip().lower())
            clean_doi = re.sub(r"^doi:", "", clean_doi)
            target_url = f"https://doi.org/{clean_doi}"

        # Si la URL ya termina en .pdf
        if target_url and target_url.lower().endswith(".pdf"):
            return target_url

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
            with httpx.Client(timeout=15.0, follow_redirects=True) as client:
                response = client.get(target_url, headers=headers)

            if response.status_code != 200:
                return None

            final_url_str = str(response.url)
            content_type = response.headers.get("content-type", "").lower()
            if "application/pdf" in content_type:
                return final_url_str

            # Si es de MDPI y llegamos a la landing page, agregar /pdf al final
            if "mdpi.com" in final_url_str:
                clean_base_url = final_url_str.split("?")[0].rstrip("/")
                if not clean_base_url.endswith("/pdf"):
                    return f"{clean_base_url}/pdf"

            # Buscar etiquetas <meta name="citation_pdf_url" content="..."> o prs:pdf / og:pdf
            html_text = response.text
            match = re.search(r'<meta\s+name=["\']citation_pdf_url["\']\s+content=["\']([^"\']+)["\']', html_text, re.IGNORECASE)
            if not match:
                match = re.search(r'<meta\s+content=["\']([^"\']+)["\']\s+name=["\']citation_pdf_url["\']', html_text, re.IGNORECASE)
            if not match:
                match = re.search(r'<meta\s+property=["\']og:pdf["\']\s+content=["\']([^"\']+)["\']', html_text, re.IGNORECASE)

            if match:
                pdf_link = match.group(1)
                if pdf_link.startswith("//"):
                    pdf_link = f"https:{pdf_link}"
                elif pdf_link.startswith("/"):
                    base_domain = f"{response.url.scheme}://{response.url.netloc}"
                    pdf_link = f"{base_domain}{pdf_link}"
                return pdf_link

            return None
        except Exception:
            return None
