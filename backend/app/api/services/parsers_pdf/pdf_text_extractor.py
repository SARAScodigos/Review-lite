"""
Módulo de Extracción de Texto Plano desde Archivos PDF Científicos utilizando PyPDF.
Limpia y trunca el contenido para consumo optimizado del motor de Inteligencia Artificial.
"""
import os
from typing import Optional
from pypdf import PdfReader


def extract_text_from_pdf(file_path: str, max_chars: int = 60000) -> Optional[str]:
    """
    Extrae el texto completo de un archivo PDF almacenado en disco.
    Si el texto supera max_chars (aprox. 12,000 palabras / 25 páginas), se trunca de forma limpia.
    """
    if not os.path.exists(file_path):
        return None

    try:
        reader = PdfReader(file_path)
        extracted_pages = []

        for idx, page in enumerate(reader.pages):
            page_text = page.extract_text()
            if page_text:
                extracted_pages.append(f"--- PÁGINA {idx + 1} ---\n{page_text}")

        full_text = "\n\n".join(extracted_pages).strip()

        if not full_text:
            return None

        # Truncar si excede el límite máximo para optimizar tokens
        if len(full_text) > max_chars:
            return full_text[:max_chars] + "\n\n[TEXTO TRUNCADO POR LÍMITE DE TAMAÑO]"

        return full_text

    except Exception as e:
        return None
