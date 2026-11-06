"""
Servicio de Redacción de las Secciones de Discusión y Conclusiones (Hito 5).
Integra de forma transversal los hallazgos de todos los objetivos de investigación (RO1, RO2, RO3...),
y genera las Conclusiones basadas exclusivamente en los borradores previos de Resultados y Discusión con validación estricta.
"""
from typing import Any, Dict, List, Optional
import uuid

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.ai.factory import AIEngineFactory
from app.api.models.extracted_matrix_model import ExtractedMatrixRow
from app.api.models.rsl_project_model import RSLProject
from app.api.models.synthesis_model import (
    RSLSynthesisSection,
    StatusWriting,
    SynthesisSectionType,
)
from app.api.services.synthesis.section_eligibility_service import (
    prepare_trimmed_matrix_for_eligibility,
)


def gather_all_objectives_data_from_db(db: Session, project_id: uuid.UUID) -> List[Dict[str, Any]]:
    """Recopila las tablas y borradores redactados de todos los objetivos de investigación (RESULTS_OBJECTIVE)."""
    objective_sections = db.exec(
        select(RSLSynthesisSection)
        .where(RSLSynthesisSection.project_id == project_id)
        .where(RSLSynthesisSection.section_type == SynthesisSectionType.RESULTS_OBJECTIVE)
    ).all()

    sections_summary: List[Dict[str, Any]] = []
    for sec in objective_sections:
        if sec.generated_draft:  # Únicamente los que ya tienen borrador redactado
            sections_summary.append({
                "objective_code": sec.objective_title or "Objetivo",
                "objective_description": sec.objective_description or "",
                "candidate_ids": sec.candidate_article_ids,
                "generated_draft": sec.generated_draft,
            })

    return sections_summary


def validate_project_objective_results(objectives_drafts: List[Dict[str, Any]]) -> None:
    """Discusión y conclusiones pueden comenzar desde cualquier resultado ya redactado."""
    if not objectives_drafts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debe redactar primero los Resultados de al menos un Objetivo de investigación.",
        )


def draft_discussion_or_conclusions_section_with_ai(
    db: Session,
    section_id: uuid.UUID,
    selected_custom_columns: Optional[List[str]] = None,
    provider: str = "deepseek",
    model: str = "deepseek-v4-pro",
    temperature: float = 0.3,
    custom_prompt: Optional[str] = None,
) -> RSLSynthesisSection:
    """
    Ejecuta la redacción de la Discusión o las Conclusiones.
    - Para la Discusión: Consume las tablas y borradores de los objetivos + matriz recortada + regla del párrafo final de aporte emergente.
    - Para las Conclusiones: Valida que existan los borradores de Resultados y Discusión previa. Consume ÚNICAMENTE el título, los objetivos del proyecto, los borradores de resultados y el borrador de la discusión.
    """
    section = db.get(RSLSynthesisSection, section_id)
    if not section:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la sección de síntesis.")

    if section.section_type not in (SynthesisSectionType.DISCUSSION, SynthesisSectionType.CONCLUSIONS):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Este servicio es exclusivo para las secciones de Discusión y Conclusiones.")

    project = db.get(RSLProject, section.project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró el proyecto RSL.")

    # 1. Obtener borradores de Resultados por Objetivo
    objectives_drafts = gather_all_objectives_data_from_db(db, section.project_id)

    # 2. Los resultados por objetivo son necesarios para Discusión y Conclusiones.
    discussion_section = db.exec(
        select(RSLSynthesisSection)
        .where(RSLSynthesisSection.project_id == section.project_id)
        .where(RSLSynthesisSection.section_type == SynthesisSectionType.DISCUSSION)
    ).first()

    validate_project_objective_results(objectives_drafts)

    if section.section_type == SynthesisSectionType.CONCLUSIONS:
        if not discussion_section or not discussion_section.generated_draft:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se pueden generar las Conclusiones. Es obligatorio haber redactado primero el borrador de la sección de Discusión.",
            )

    section.status_writing = StatusWriting.WRITING_BY_AI
    db.add(section)
    db.commit()

    try:
        ai = AIEngineFactory.get_provider(provider=provider, model=model)
        custom_rules = f"\nINSTRUCCIONES ADICIONALES DEL INVESTIGADOR:\n{custom_prompt}" if custom_prompt else ""

        if section.section_type == SynthesisSectionType.DISCUSSION:
            # Incluye la evidencia de los objetivos redactados y los IDs extra elegidos para Discusión.
            matrix_rows = db.exec(
                select(ExtractedMatrixRow).where(ExtractedMatrixRow.project_id == section.project_id)
            ).all()
            objective_candidate_ids = {
                article_id
                for objective in objectives_drafts
                for article_id in objective["candidate_ids"]
            }
            discussion_extra_ids = set(section.candidate_article_ids or [])
            effective_candidate_ids = objective_candidate_ids | discussion_extra_ids
            if not effective_candidate_ids:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Los resultados redactados no tienen IDs candidatos. Agregue al menos un ID a la Discusión.",
                )
            candidate_rows = [
                row
                for row in matrix_rows
                if row.article_custom_id in effective_candidate_ids
                or str(row.id)[:8] in effective_candidate_ids
            ]
            if not candidate_rows:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Los IDs de objetivos y de Discusión no existen en la matriz del proyecto.",
                )

            target_cols = selected_custom_columns or section.trimmed_columns_used or ["ID", "Título", "Resultados", "Discusión", "Conclusiones", "Relación con el título de investigación"]
            trimmed_matrix = prepare_trimmed_matrix_for_eligibility(candidate_rows, target_cols)

            prompt = (
                f"PROYECTO DE REVISIÓN SISTEMÁTICA:\n"
                f"- Título: {project.title}\n"
                f"- Alcance Geográfico: {project.geographic_scope or 'No delimitado'}\n\n"
                f"RESULTADOS REDACTADOS POR OBJETIVO DE INVESTIGACIÓN:\n"
                f"{objectives_drafts}\n\n"
                f"IDS DE OBJETIVOS + IDS EXTRA CONFIRMADOS PARA DISCUSIÓN:\n"
                f"{sorted(effective_candidate_ids)}\n\n"
                f"MATRIZ RECORTADA DE APOYO:\n"
                f"{trimmed_matrix}\n\n"
                f"INSTRUCCIONES DE DISCUSIÓN ACADÉMICA:\n"
                f"1. CITACIÓN POR ID COMPUESTO: Cita obligatoriamente las evidencias usando el ID compuesto entre corchetes o paréntesis, ej. '[AgentJulc]' o '(AgentJulc)'. Cero formatos APA o IEEE.\n"
                f"2. ANÁLISIS COMPARATIVO Y DISCREPANCIAS: Discute y contrasta los hallazgos entre los objetivos (OB1 vs OB2...), analizando inconsistencias y brechas metodológicas.\n"
                f"3. PÁRRAFO CULMINANTE DE APORTE Y SÍNTESIS CONCEPTUAL EMERGENTE (CRUCIAL): Finaliza la Discusión con un párrafo culminante de alto impacto que proponga un Marco Teórico Emergente, modelo conceptual o taxonomía integradora según los resultados.{custom_rules}\n\n"
                f"Genera la Discusión completa en formato Markdown."
            )

            system_instruction = "Eres un redactor científico sénior. Elabora una discusión académica profunda y culmina con un párrafo de aporte teórico emergente. Cita únicamente por ID [AgentJulc]."

        else:
            # CONCLUSIONES: Consume ÚNICAMENTE el título del proyecto, los objetivos, borradores de resultados y el borrador de la discusión
            prompt = (
                f"PROYECTO DE REVISIÓN SISTEMÁTICA:\n"
                f"- Título del Proyecto: {project.title}\n"
                f"- Objetivos Generales del Proyecto: {project.extra_metadata.get('objectives') if project.extra_metadata else 'No especificados'}\n\n"
                f"INSUMO 1: BORRADORES REDACTADOS DE RESULTADOS POR OBJETIVO:\n"
                f"{objectives_drafts}\n\n"
                f"INSUMO 2: BORRADOR REDACTADO DE LA DISCUSIÓN DEL PROYECTO:\n"
                f"{discussion_section.generated_draft}\n\n"
                f"INSTRUCCIONES DE CONCLUSIÓN ACADÉMICA:\n"
                f"1. CITACIÓN POR ID COMPUESTO: Si referencias evidencia previa, usa únicamente el ID compuesto entre corchetes o paréntesis, ej. '[AgentJulc]' o '(AgentJulc)'. Cero formatos APA o IEEE.\n"
                f"2. CONCLUSIONES FINALES: Sintetiza de forma elegante y concluyente las respuestas finales a los objetivos planteados basándote estrictamente en los Resultados y la Discusión provistos.\n"
                f"3. LÍNEAS DE INVESTIGACIÓN FUTURAS: Cierra proponiendo líneas de investigación futuras y aplicaciones prácticas derivadas de las brechas de la RSL.{custom_rules}\n\n"
                f"Genera las Conclusiones finales en formato Markdown."
            )

            system_instruction = "Eres un sintetizador científico sénior. Genera las conclusiones del estudio RSL basadas estrictamente en la Discusión y Resultados provistos. Cita únicamente por ID [AgentJulc]."

        draft_text = ai.generate_text(
            prompt=prompt,
            system_instruction=system_instruction,
            temperature=temperature,
        )

        section.generated_draft = draft_text
        section.status_writing = StatusWriting.COMPLETED

        db.add(section)
        db.commit()
        db.refresh(section)
        return section

    except HTTPException:
        section.status_writing = StatusWriting.ERROR
        db.add(section)
        db.commit()
        raise
    except Exception as e:
        section.status_writing = StatusWriting.ERROR
        db.add(section)
        db.commit()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error en redacción: {str(e)}")
