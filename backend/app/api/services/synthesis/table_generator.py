"""
Módulo Generador de Tablas Sintéticas Estructuradas por Objetivo (Hito 5).
Construye estructuras JSONB de tablas comparativas a partir de los artículos candidatos seleccionados.
"""
from typing import Any, Dict, List, Optional
import uuid

from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.ai.factory import AIEngineFactory
from app.api.models.extracted_matrix_model import ExtractedMatrixRow
from app.api.models.rsl_project_model import RSLProject
from app.api.models.synthesis_model import (
    RSLSynthesisSection,
    StatusWriting,
)
from app.api.services.synthesis.matrix_trimmer import trim_matrix_rows_for_ai


class SynthesisColumnHeader(BaseModel):
    """Cabecera de columna para la tabla sintética."""

    key: str = Field(..., description="Clave única de la columna")
    label: str = Field(..., description="Etiqueta visible en español de la columna")


class AISynthesisTableOutput(BaseModel):
    """Esquema Pydantic para la respuesta estructurada de la tabla de síntesis."""

    title: str = Field(..., description="Título académico representativo de la tabla sintética")
    columns: List[SynthesisColumnHeader] = Field(..., description="Encabezados de la tabla")
    rows: List[Dict[str, Any]] = Field(..., description="Filas comparativas por cada artículo candidato")


def generate_synthesis_table_for_section(
    db: Session,
    section_id: uuid.UUID,
    provider: str = "deepseek",
    model: str = "deepseek-v4-pro",
    temperature: float = 0.1,
    custom_prompt: Optional[str] = None,
) -> RSLSynthesisSection:
    """
    Genera la tabla comparativa estructurada para la sección u objetivo de investigación utilizando IA.
    """
    section = db.get(RSLSynthesisSection, section_id)
    if not section:
        raise ValueError("No se encontró la sección de síntesis.")

    project = db.get(RSLProject, section.project_id)
    if not project:
        raise ValueError("No se encontró el proyecto RSL.")

    if not section.candidate_article_ids:
        raise ValueError("No hay artículos candidatos seleccionados en esta sección. Ejecute primero el selector de candidatos.")

    # 1. Obtener solo las filas de la matriz que fueron seleccionadas como candidatas
    matrix_rows = db.exec(
        select(ExtractedMatrixRow).where(ExtractedMatrixRow.project_id == section.project_id)
    ).all()

    candidates = [
        r for r in matrix_rows
        if (r.article_custom_id in section.candidate_article_ids or str(r.id)[:8] in section.candidate_article_ids)
    ]

    if not candidates:
        raise ValueError("Los IDs candidatos no existen en la matriz del proyecto.")

    trimmed_candidates = trim_matrix_rows_for_ai(candidates, section.trimmed_columns_used or ["ID", "Título", "Resultados"])

    # 2. Consultar al motor de IA para construir la tabla estructurada
    ai = AIEngineFactory.get_provider(provider=provider, model=model)
    custom_instruction = (
        f"\nINSTRUCCIÓN TEMPORAL DEL INVESTIGADOR:\n{custom_prompt}"
        if custom_prompt
        else ""
    )
    prompt = (
        f"PROYECTO RSL: {project.title}\n"
        f"OBJETIVO / SECCIÓN: {section.objective_title or section.section_type.value}\n"
        f"DESCRIPCIÓN: {section.objective_description or 'Síntesis comparativa'}\n\n"
        f"ARTÍCULOS CANDIDATOS RECORTADOS:\n"
        f"{trimmed_candidates}\n\n"
        f"Sintetiza una tabla comparativa estructurada asignando columnas clave (ej. Autor/ID, Aporte Principal, Hallazgo Clave, Metodología)."
        f"{custom_instruction}"
    )

    system_instruction = (
        "Eres un diseñador de tablas de evidencia científica para RSL.\n"
        "Genera una estructura de tabla clara, rigurosa y comparativa en español. Responde en formato JSON."
    )

    result: AISynthesisTableOutput = ai.generate_structured(
        prompt=prompt,
        schema=AISynthesisTableOutput,
        system_instruction=system_instruction,
        temperature=temperature,
    )

    # 3. Guardar tabla estructurada en JSONB
    section.generated_table = result.model_dump()
    db.add(section)
    db.commit()
    db.refresh(section)
    return section
