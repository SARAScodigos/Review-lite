import math
import re
from typing import Any, Dict, Tuple


COLUMN_ALIASES = {
    "title": ["title", "document title", "article title", "ti", "heading"],
    "authors": ["authors", "author", "author full names", "author(s)", "au", "creators"],
    "publication_year": ["year", "publication year", "py", "year of publication", "pubyear"],
    "doi": ["doi", "digital object identifier", "di"],
    "source_title": ["source title", "journal", "publication title", "so", "booktitle", "journal title"],
    "abstract": ["abstract", "ab", "summary"],
}


def normalize_record(row: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Toma un diccionario de fila (clave-valor original del CSV/Excel) y extrae los campos clave
    normalizados (title, authors, publication_year, doi, source_title, abstract)
    manteniendo la totalidad del diccionario limpio en raw_data.
    """
    normalized = {
        "title": None,
        "authors": None,
        "publication_year": None,
        "doi": None,
        "source_title": None,
        "abstract": None,
    }

    clean_raw_data = {}

    for key, val in row.items():
        if val is None or (isinstance(val, float) and math.isnan(val)):
            continue

        clean_key = str(key).strip()
        clean_raw_data[clean_key] = val

        key_lower = clean_key.lower()

        for norm_field, aliases in COLUMN_ALIASES.items():
            if normalized[norm_field] is None:
                if key_lower in aliases or any(re.search(rf"\b{re.escape(alias)}\b", key_lower) for alias in aliases):
                    if norm_field == "publication_year":
                        try:
                            normalized["publication_year"] = int(float(val))
                        except (ValueError, TypeError):
                            pass
                    else:
                        normalized[norm_field] = str(val).strip()

    return normalized, clean_raw_data
