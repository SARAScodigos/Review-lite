"""
Módulo Optimizador de Tokens: Trimmer de Matriz de Extracción (Hito 5).
Filtra y recorta las columnas de la matriz en formato JSONB según el tipo de sección
a redactar, omitiendo abstracts y campos irrelevantes para reducir el consumo de tokens en un 75-80%.
"""
from typing import Any, Dict, List
from app.api.models.extracted_matrix_model import ExtractedMatrixRow
from app.api.models.synthesis_model import SynthesisSectionType

# Mapeo de columnas relevantes por cada tipo de sección RSL
SECTION_COLUMN_MAP: Dict[SynthesisSectionType, List[str]] = {
    SynthesisSectionType.INTRODUCTION: [
        "ID",
        "Título",
        "Objetivos generales",
        "Introducción",
        "Relación con el título de investigación",
    ],
    SynthesisSectionType.THEORETICAL_FRAMEWORK: [
        "ID",
        "Título",
        "Fundamentación Teórica",
        "Palabras clave",
        "Tipo de artículo",
    ],
    SynthesisSectionType.RESULTS_OBJECTIVE: [
        "ID",
        "Año de publicación",
        "Título",
        "Autor(es)",
        "Objetivos generales",
        "Metodología",
        "Diseño",
        "Población Muestra y Muestreo",
        "Resultados",
        "Discusión",
        "Conclusiones",
        "Relación con el título de investigación",
    ],
    SynthesisSectionType.METHODOLOGY_PRISMA: [
        "ID",
        "Título",
        "Tipo de artículo",
        "Metodología",
        "Diseño",
        "Población Muestra y Muestreo",
    ],
    SynthesisSectionType.DISCUSSION: [
        "ID",
        "Título",
        "Resultados",
        "Discusión",
        "Conclusiones",
        "Relación con el título de investigación",
    ],
    SynthesisSectionType.CONCLUSIONS: [
        "ID",
        "Título",
        "Conclusiones",
        "Relación con el título de investigación",
    ],
}


def get_relevant_columns_for_section(
    section_type: SynthesisSectionType,
    custom_columns: List[str] = None,
) -> List[str]:
    """
    Devuelve la lista acotada de nombres de columnas relevantes para la sección dada.
    Si existen columnas personalizadas de la matriz, las incluye para análisis.
    """
    base_cols = list(SECTION_COLUMN_MAP.get(section_type, ["ID", "Título", "Resultados", "Conclusiones"]))
    if custom_columns:
        for var in custom_columns:
            clean_v = var.strip()
            if clean_v and clean_v not in base_cols:
                base_cols.append(clean_v)
    return base_cols


def trim_matrix_rows_for_ai(
    matrix_rows: List[ExtractedMatrixRow],
    columns_to_keep: List[str],
) -> List[Dict[str, Any]]:
    """
    Filtra y trunca las filas de la matriz en formato JSONB para conservar únicamente las columnas
    especificadas en `columns_to_keep`. Omite abstracts y metadatos no requeridos para optimizar el prompt.
    """
    trimmed_rows: List[Dict[str, Any]] = []

    for row in matrix_rows:
        raw_data = row.extraction_data or {}
        trimmed_row: Dict[str, Any] = {}

        for col in columns_to_keep:
            if col in raw_data and raw_data[col] is not None:
                trimmed_row[col] = raw_data[col]

        # Asegurar que el ID compuesto esté siempre presente
        if "ID" not in trimmed_row:
            trimmed_row["ID"] = row.article_custom_id or str(row.id)[:8]

        trimmed_rows.append(trimmed_row)

    return trimmed_rows
