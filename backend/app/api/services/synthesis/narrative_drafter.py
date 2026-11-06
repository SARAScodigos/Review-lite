"""
Módulo Redactor de Narrativa Científica Profunda con Citas Bibliográficas Integradas (Hito 5).
Consume los candidatos filtrados, la tabla estructurada y la matriz recortada para generar
texto académico de alto nivel utilizando un modelo de IA potente.
"""
from typing import Any, Dict, List, Optional
import uuid

from sqlmodel import Session, select

from app.ai.factory import AIEngineFactory
from app.api.models.extracted_matrix_model import ExtractedMatrixRow
from app.api.models.rsl_project_model import RSLProject
from app.api.models.synthesis_model import (
    RSLSynthesisSection,
    StatusWriting,
    SynthesisSectionType,
)
from app.api.services.synthesis.matrix_trimmer import trim_matrix_rows_for_ai


def build_narrative_draft_prompt(
    project: RSLProject,
    section: RSLSynthesisSection,
    trimmed_candidates: List[Dict],
    table_json: Dict,
) -> str:
    """Construye el prompt de redacción científica de alta precisión."""
    style = section.citation_style or "APA7"
    custom_rules = f"\nREGLAS PERSONALIZADAS DEL INVESTIGADOR:\n{section.custom_prompt_instructions}" if section.custom_prompt_instructions else ""

    return (
        f"PROYECTO DE REVISIÓN SISTEMÁTICA:\n"
        f"- Título: {project.title}\n"
        f"- Objetivos del Proyecto: {project.objectives or 'No especificados'}\n"
        f"- Sección a Redactar: {section.objective_title or section.section_type.value}\n"
        f"- Meta de la Sección: {section.objective_description or 'Redacción sintética'}\n\n"
        f"ARTÍCULOS CANDIDATOS Y JUSTIFICACIÓN DEL PORQUÉ:\n"
        f"Justificaciones: {section.selection_justifications}\n"
        f"Matriz Recortada: {trimmed_candidates}\n\n"
        f"TABLA SINTÉTICA GENERADA:\n"
        f"{table_json}\n\n"
        f"REQUISITOS DE REDACCIÓN:\n"
        f"1. Estilo de Citas: {style}. Incluye las citas dentro del texto (ej. '(García et al., 2024)' para APA7 o '[1]' para IEEE) conectando cada afirmación con su ID/Autor correspondiente.\n"
        f"2. Integra fluido el contenido científico, comparando discrepancias y consensos entre los estudios candidatos.\n"
        f"3. Redacta de forma académica, rigurosa y en español neutro.{custom_rules}\n\n"
        f"Genera el texto borrador completo en formato Markdown."
    )


def draft_narrative_for_section(
    db: Session,
    section_id: uuid.UUID,
    provider: str = "deepseek",
    model: str = "deepseek-v4-pro",
    temperature: float = 0.3,
) -> RSLSynthesisSection:
    """
    Ejecuta la redacción científica profunda utilizando el modelo de IA potente.
    Integra citas en texto y sintetiza la tabla de evidencia.
    """
    section = db.get(RSLSynthesisSection, section_id)
    if not section:
        raise ValueError("No se encontró la sección de síntesis.")

    project = db.get(RSLProject, section.project_id)
    if not project:
        raise ValueError("No se encontró el proyecto RSL.")

    # 1. Actualizar estado a WRITING_BY_AI
    section.status_writing = StatusWriting.WRITING_BY_AI
    db.add(section)
    db.commit()

    try:
        # 2. Obtener filas recortadas de los artículos candidatos
        matrix_rows = db.exec(
            select(ExtractedMatrixRow).where(ExtractedMatrixRow.project_id == section.project_id)
        ).all()

        candidates = [
            r for r in matrix_rows
            if (r.article_custom_id in section.candidate_article_ids or str(r.id)[:8] in section.candidate_article_ids)
        ]

        if not candidates:
            candidates = matrix_rows[:10]

        trimmed_candidates = trim_matrix_rows_for_ai(candidates, section.trimmed_columns_used or ["ID", "Título", "Resultados", "Conclusiones"])

        # 3. Consultar al modelo de IA potente
        ai = AIEngineFactory.get_provider(provider=provider, model=model)
        prompt = build_narrative_draft_prompt(project, section, trimmed_candidates, section.generated_table)
        system_instruction = (
            "Eres un redactor científico sénior especializado en Revisiones Sistemáticas de la Literatura (RSL).\n"
            "Redacta un texto fluido, bien argumentado y citado rigurosamente en Markdown."
        )

        draft_text = ai.generate_text(
            prompt=prompt,
            system_instruction=system_instruction,
            temperature=temperature,
        )

        # 4. Guardar texto borrador y cambiar estado a COMPLETED
        section.generated_draft = draft_text
        section.status_writing = StatusWriting.COMPLETED
        db.add(section)
        db.commit()
        db.refresh(section)
        return section

    except Exception as e:
        section.status_writing = StatusWriting.ERROR
        db.add(section)
        db.commit()
        raise e
