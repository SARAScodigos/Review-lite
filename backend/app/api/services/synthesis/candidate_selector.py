"""
Módulo de Selección de Artículos Candidatos por Sección con Modelo Rápido de IA (Hito 5).
Filtra la matriz de extracción y genera la columna explicativa del porqué para cada candidato seleccionado.
"""
from typing import Dict, List, Optional
import uuid

from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.ai.factory import AIEngineFactory
from app.api.models.extracted_matrix_model import ExtractedMatrixRow
from app.api.models.matrix_custom_column_model import MatrixCustomColumn
from app.api.models.rsl_project_model import RSLProject
from app.api.models.synthesis_model import (
    RSLSynthesisSection,
    StatusWriting,
    SynthesisSectionType,
)
from app.api.services.synthesis.matrix_trimmer import (
    get_relevant_columns_for_section,
    trim_matrix_rows_for_ai,
)


class SelectedCandidateItem(BaseModel):
    """Esquema Pydantic para un artículo candidato seleccionado junto a su justificación."""

    article_id: str = Field(..., description="ID compuesto del artículo (ej. DEEP_PINT, ART1_GARC)")
    why_selected_reasoning: str = Field(..., description="Justificación detallada de por qué aporta clavemente a esta sección o objetivo")


class AICandidateSelectionOutput(BaseModel):
    """Esquema Pydantic para la respuesta estructurada de selección de candidatos."""

    selected_candidates: List[SelectedCandidateItem] = Field(..., description="Lista de artículos candidatos seleccionados con su porqué")


def build_candidate_selection_prompt(
    project: RSLProject,
    section: RSLSynthesisSection,
    trimmed_matrix: List[Dict],
) -> str:
    """Construye el prompt acotado para el modelo rápido de IA."""
    section_name_map = {
        SynthesisSectionType.INTRODUCTION: "Introducción y Antecedentes del Manuscrito",
        SynthesisSectionType.THEORETICAL_FRAMEWORK: "Marco Teórico y Fundamentación",
        SynthesisSectionType.RESULTS_OBJECTIVE: f"Resultados para el Objetivo: '{section.objective_title or 'Objetivo Específico'}'",
        SynthesisSectionType.METHODOLOGY_PRISMA: "Sección Metodológica PRISMA",
        SynthesisSectionType.DISCUSSION: "Discusión de Hallazgos y Limitaciones",
        SynthesisSectionType.CONCLUSIONS: "Conclusiones y Trabajos Futuros",
    }

    target_name = section_name_map.get(section.section_type, "Sección de Síntesis")
    obj_desc = f"\nMeta del Objetivo: {section.objective_description}" if section.objective_description else ""

    return (
        f"PROYECTO DE REVISIÓN SISTEMÁTICA:\n"
        f"- Título: {project.title}\n"
        f"- Sección a Construir: {target_name}{obj_desc}\n\n"
        f"FILAS RECORTADAS DE LA MATRIZ DE EXTRACCIÓN ({len(trimmed_matrix)} artículos):\n"
        f"{trimmed_matrix}\n\n"
        f"Analiza la matriz y selecciona los mejores artículos candidatos para redactar esta sección.\n"
        f"Para cada candidato seleccionado, proporciona su 'article_id' y redacta la justificación ('why_selected_reasoning') en español."
    )


def select_candidates_for_section(
    db: Session,
    section_id: uuid.UUID,
    provider: str = "deepseek",
    model: str = "deepseek-v4-pro",
    temperature: float = 0.2,
) -> RSLSynthesisSection:
    """
    Ejecuta el filtrado con un modelo de IA rápido para elegir los artículos candidatos clave
    y generar la columna explicativa del porqué para la sección especificada.
    """
    section = db.get(RSLSynthesisSection, section_id)
    if not section:
        raise ValueError("No se encontró la sección de síntesis.")

    project = db.get(RSLProject, section.project_id)
    if not project:
        raise ValueError("No se encontró el proyecto RSL.")

    # 1. Actualizar estado a SELECTING_IDS
    section.status_writing = StatusWriting.SELECTING_IDS
    db.add(section)
    db.commit()

    try:
        # 2. Obtener filas de la matriz del proyecto
        matrix_rows = db.exec(
            select(ExtractedMatrixRow).where(ExtractedMatrixRow.project_id == section.project_id)
        ).all()

        if not matrix_rows:
            section.status_writing = StatusWriting.ERROR
            db.add(section)
            db.commit()
            raise ValueError("No existen filas en la matriz de extracción para este proyecto.")

        # 3. Recortar columnas de la matriz según el tipo de sección
        custom_columns = db.exec(
            select(MatrixCustomColumn.name)
            .where(MatrixCustomColumn.project_id == section.project_id)
            .order_by(MatrixCustomColumn.position, MatrixCustomColumn.name)
        ).all()
        columns_to_keep = get_relevant_columns_for_section(section.section_type, custom_columns)
        trimmed_matrix = trim_matrix_rows_for_ai(matrix_rows, columns_to_keep)

        # 4. Consultar al modelo de IA rápido
        ai = AIEngineFactory.get_provider(provider=provider, model=model)
        prompt = build_candidate_selection_prompt(project, section, trimmed_matrix)
        system_instruction = (
            "Eres un metodólogo científico experto en selecciones para RSL.\n"
            "Tu tarea es seleccionar los artículos más relevantes de la matriz para la sección especificada "
            "y explicar rigurosamente el porqué de cada selección en español. Responde en formato JSON."
        )

        result: AICandidateSelectionOutput = ai.generate_structured(
            prompt=prompt,
            schema=AICandidateSelectionOutput,
            system_instruction=system_instruction,
            temperature=temperature,
        )

        # 5. Guardar candidatos y justificante en la sección
        candidate_ids = [c.article_id for c in result.selected_candidates]
        justifications = {c.article_id: c.why_selected_reasoning for c in result.selected_candidates}

        section.candidate_article_ids = candidate_ids
        section.selection_justifications = justifications
        section.trimmed_columns_used = columns_to_keep
        section.status_writing = StatusWriting.TRIMER_COLUMNS

        db.add(section)
        db.commit()
        db.refresh(section)
        return section

    except Exception as e:
        section.status_writing = StatusWriting.ERROR
        db.add(section)
        db.commit()
        raise e
