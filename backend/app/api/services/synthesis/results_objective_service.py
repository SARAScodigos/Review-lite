"""
Servicio de Selección, Generación de Tablas y Redacción Unificada para Resultados por Objetivo (Hito 5).
Pipeline en 3 pasos lógicos:
1A. Determinación de Columnas: La IA analiza OB1 y selecciona qué columnas de la matriz usar.
1B. Elegibilidad y Justificación: La matriz se recorta a esas columnas y la IA evalúa qué artículos (IDs) son elegibles y por qué.
2. Generación Unificada en 1 paso: La matriz ultra-reducida (solo IDs elegibles y columnas recomendadas) genera la Tabla JSONB + Narrativa [ID].
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
    SynthesisSectionType,
)
from app.api.services.synthesis.section_eligibility_service import (
    prepare_trimmed_matrix_for_eligibility,
)
from app.api.services.synthesis.table_generator import AISynthesisTableOutput


class RecommendedColumnsOutput(BaseModel):
    """Paso 1A: Respuesta de la IA recomendando las mejores columnas de la matriz para un objetivo."""

    recommended_columns: List[str] = Field(..., description="Lista de nombres de columnas de la matriz seleccionadas para responder a este objetivo (ej. ['ID', 'País', 'Resultados'])")


class JustifyEligibilityOutput(BaseModel):
    """Paso 1B: Respuesta de la IA con la elegibilidad de artículos e identificación de la columna del porqué."""

    eligible_candidate_ids: List[str] = Field(..., description="Lista de IDs compuestos de los artículos elegibles para este objetivo")
    selection_justifications: Dict[str, str] = Field(..., description="Mapa JSONB de ID -> Razón explicativa del porqué fue seleccionado")


class UnifiedObjectiveResultsOutput(BaseModel):
    """Paso 2: Respuesta unificada en 1 paso: Tabla sintética estructurada JSONB + Explicación narrativa con citas [ID]."""

    table: AISynthesisTableOutput = Field(..., description="Tabla sintética estructurada comparativa")
    narrative_explanation: str = Field(..., description="Explicación narrativa profunda citando con el ID compuesto exacto ej. [AgentJulc]")


def draft_objective_results_from_table_with_ai(
    db: Session,
    section_id: uuid.UUID,
    provider: str = "deepseek",
    model: str = "deepseek-v4-pro",
    temperature: float = 0.2,
    custom_prompt: Optional[str] = None,
) -> RSLSynthesisSection:
    """Redacta resultados a partir de la tabla ya revisable, sin regenerarla."""
    section = db.get(RSLSynthesisSection, section_id)
    if not section or section.section_type != SynthesisSectionType.RESULTS_OBJECTIVE:
        raise ValueError("La redacción de resultados requiere una sección RESULTS_OBJECTIVE válida.")
    if not section.candidate_article_ids:
        raise ValueError("No hay IDs candidatos confirmados para este objetivo.")
    if not section.generated_table:
        raise ValueError("Genere o cargue primero la tabla del objetivo antes de redactar resultados.")

    project = db.get(RSLProject, section.project_id)
    if not project:
        raise ValueError("No se encontró el proyecto RSL.")
    rows = db.exec(
        select(ExtractedMatrixRow).where(ExtractedMatrixRow.project_id == section.project_id)
    ).all()
    candidates = [row for row in rows if row.article_custom_id in section.candidate_article_ids]
    if not candidates:
        raise ValueError("Los IDs candidatos no existen en la matriz del proyecto.")

    section.status_writing = StatusWriting.WRITING_BY_AI
    db.add(section)
    db.commit()
    try:
        custom_instruction = (
            f"\nINSTRUCCIÓN TEMPORAL DEL INVESTIGADOR:\n{custom_prompt}"
            if custom_prompt
            else ""
        )
        trimmed_candidates = prepare_trimmed_matrix_for_eligibility(
            candidates,
            section.trimmed_columns_used or ["ID", "Título", "Resultados", "Conclusiones"],
        )
        prompt = (
            f"PROYECTO RSL: {project.title}\n"
            f"OBJETIVO: {section.objective_title}\n"
            f"DESCRIPCIÓN: {section.objective_description}\n\n"
            f"TABLA REVISABLE DEL OBJETIVO:\n{section.generated_table}\n\n"
            f"EVIDENCIA DE LOS IDs CANDIDATOS:\n{trimmed_candidates}\n\n"
            "Redacta los resultados académicos en Markdown. Cita cada evidencia con su ID compuesto entre corchetes. "
            "No alteres la tabla ni inventes IDs."
            f"{custom_instruction}"
        )
        ai = AIEngineFactory.get_provider(provider=provider, model=model)
        section.generated_draft = ai.generate_text(
            prompt=prompt,
            system_instruction="Eres un redactor científico de resultados para RSL. Responde en Markdown y cita solo IDs existentes.",
            temperature=temperature,
        )
        section.status_writing = StatusWriting.COMPLETED
        db.add(section)
        db.commit()
        db.refresh(section)
        return section
    except Exception:
        section.status_writing = StatusWriting.ERROR
        db.add(section)
        db.commit()
        raise


def get_objective_description_from_project(project: RSLProject, objective_code: Optional[str] = None) -> str:
    """Extrae la descripción de un objetivo (ej. OB1, OB2, OB3) desde project.extra_metadata['objectives']."""
    if not objective_code or not project.extra_metadata:
        return "Análisis de resultados por objetivo de investigación"

    objectives_dict = project.extra_metadata.get("objectives", {})
    if isinstance(objectives_dict, dict) and objective_code in objectives_dict:
        return str(objectives_dict[objective_code])

    return f"Objetivo {objective_code}"


def recommend_objective_columns_with_ai(
    db: Session,
    section_id: uuid.UUID,
    provider: str = "deepseek",
    model: str = "deepseek-v4-pro",
    temperature: float = 0.2,
    custom_prompt: Optional[str] = None,
) -> RSLSynthesisSection:
    """Propone columnas para un objetivo sin seleccionar todavía artículos."""
    section = db.get(RSLSynthesisSection, section_id)
    if not section or section.section_type != SynthesisSectionType.RESULTS_OBJECTIVE:
        raise ValueError("La recomendación de columnas requiere una sección RESULTS_OBJECTIVE válida.")
    project = db.get(RSLProject, section.project_id)
    if not project:
        raise ValueError("No se encontró el proyecto RSL.")
    matrix_rows = db.exec(
        select(ExtractedMatrixRow).where(ExtractedMatrixRow.project_id == section.project_id)
    ).all()
    if not matrix_rows:
        raise ValueError("No se encontraron filas en la matriz de extracción del proyecto.")

    available_columns = list((matrix_rows[0].extraction_data or {}).keys())
    custom_instruction = (
        f"\nINSTRUCCIÓN TEMPORAL DEL INVESTIGADOR:\n{custom_prompt}"
        if custom_prompt
        else ""
    )
    section.status_writing = StatusWriting.SELECTING_IDS
    db.add(section)
    db.commit()
    try:
        ai = AIEngineFactory.get_provider(provider=provider, model=model)
        result: RecommendedColumnsOutput = ai.generate_structured(
            prompt=(
                f"PROYECTO RSL: {project.title}\n"
                f"OBJETIVO: {section.objective_title}\n"
                f"DESCRIPCIÓN: {section.objective_description}\n\n"
                f"COLUMNAS DISPONIBLES: {available_columns}\n\n"
                "Recomienda únicamente los nombres de columnas necesarios para responder el objetivo. "
                "Incluye ID para mantener las citas trazables."
                f"{custom_instruction}"
            ),
            schema=RecommendedColumnsOutput,
            system_instruction="Eres metodólogo de RSL. Responde en JSON con columnas existentes de la matriz.",
            temperature=temperature,
        )
        columns = [column for column in result.recommended_columns if column in available_columns]
        if "ID" not in columns:
            columns.insert(0, "ID")
        section.trimmed_columns_used = list(dict.fromkeys(columns))
        section.status_writing = StatusWriting.TRIMER_COLUMNS
        db.add(section)
        db.commit()
        db.refresh(section)
        return section
    except Exception:
        section.status_writing = StatusWriting.ERROR
        db.add(section)
        db.commit()
        raise


def identify_objective_candidate_ids_with_ai(
    db: Session,
    section_id: uuid.UUID,
    provider: str = "deepseek",
    model: str = "deepseek-v4-pro",
    temperature: float = 0.2,
    custom_prompt: Optional[str] = None,
) -> RSLSynthesisSection:
    """Identifica IDs candidatos usando las columnas confirmadas por el investigador."""
    section = db.get(RSLSynthesisSection, section_id)
    if not section or section.section_type != SynthesisSectionType.RESULTS_OBJECTIVE:
        raise ValueError("La identificación de IDs requiere una sección RESULTS_OBJECTIVE válida.")
    if not section.trimmed_columns_used:
        raise ValueError("Confirme primero las columnas que se usarán para el objetivo.")
    project = db.get(RSLProject, section.project_id)
    if not project:
        raise ValueError("No se encontró el proyecto RSL.")
    matrix_rows = db.exec(
        select(ExtractedMatrixRow).where(ExtractedMatrixRow.project_id == section.project_id)
    ).all()
    if not matrix_rows:
        raise ValueError("No se encontraron filas en la matriz de extracción del proyecto.")

    section.status_writing = StatusWriting.SELECTING_IDS
    db.add(section)
    db.commit()
    try:
        valid_ids = {
            row.article_custom_id or str((row.extraction_data or {}).get("ID") or "")
            for row in matrix_rows
        }
        trimmed_matrix = prepare_trimmed_matrix_for_eligibility(
            matrix_rows,
            section.trimmed_columns_used,
        )
        custom_instruction = (
            f"\nINSTRUCCIÓN TEMPORAL DEL INVESTIGADOR:\n{custom_prompt}"
            if custom_prompt
            else ""
        )
        ai = AIEngineFactory.get_provider(provider=provider, model=model)
        result: JustifyEligibilityOutput = ai.generate_structured(
            prompt=(
                f"PROYECTO RSL: {project.title}\n"
                f"OBJETIVO: {section.objective_title}\n"
                f"DESCRIPCIÓN: {section.objective_description}\n\n"
                f"MATRIZ CON COLUMNAS CONFIRMADAS ({section.trimmed_columns_used}):\n"
                f"{trimmed_matrix}\n\n"
                "Selecciona IDs candidatos pertinentes y justifica cada selección. "
                "Devuelve únicamente IDs presentes en la matriz."
                f"{custom_instruction}"
            ),
            schema=JustifyEligibilityOutput,
            system_instruction="Eres evaluador de evidencia RSL. Responde en JSON y no inventes IDs.",
            temperature=temperature,
        )
        candidate_ids = [item for item in result.eligible_candidate_ids if item in valid_ids]
        section.candidate_article_ids = list(dict.fromkeys(candidate_ids))
        section.selection_justifications = {
            item: reason
            for item, reason in result.selection_justifications.items()
            if item in section.candidate_article_ids
        }
        section.status_writing = StatusWriting.TRIMER_COLUMNS
        db.add(section)
        db.commit()
        db.refresh(section)
        return section
    except Exception:
        section.status_writing = StatusWriting.ERROR
        db.add(section)
        db.commit()
        raise


def evaluate_results_objective_eligibility_and_columns_with_ai(
    db: Session,
    section_id: uuid.UUID,
    objective_code: Optional[str] = None,
    user_chosen_columns: Optional[List[str]] = None,
    provider: str = "deepseek",
    model: str = "deepseek-v4-pro",
    temperature: float = 0.2,
    custom_prompt: Optional[str] = None,
) -> RSLSynthesisSection:
    """
    PASO 1A & PASO 1B:
    1A. Determina las columnas (recommended_columns) basadas en OB1 (o usa user_chosen_columns si el usuario las envió).
    1B. Recorta la matriz completa a esas columnas y evalúa con la IA cuáles artículos (eligible_candidate_ids) son elegibles y genera el mapa del porqué (selection_justifications).
    """
    section = db.get(RSLSynthesisSection, section_id)
    if not section:
        raise ValueError("No se encontró la sección de síntesis.")

    if section.section_type != SynthesisSectionType.RESULTS_OBJECTIVE:
        raise ValueError("Este servicio es exclusivo para secciones del tipo Resultados por Objetivo (RESULTS_OBJECTIVE).")

    project = db.get(RSLProject, section.project_id)
    if not project:
        raise ValueError("No se encontró el proyecto RSL.")

    obj_desc = get_objective_description_from_project(project, objective_code)
    section.objective_title = objective_code or section.objective_title or "Objetivo Específico"
    section.objective_description = obj_desc

    section.status_writing = StatusWriting.SELECTING_IDS
    db.add(section)
    db.commit()

    try:
        matrix_rows = db.exec(
            select(ExtractedMatrixRow).where(ExtractedMatrixRow.project_id == section.project_id)
        ).all()

        if not matrix_rows:
            section.status_writing = StatusWriting.ERROR
            db.add(section)
            db.commit()
            raise ValueError("No se encontraron filas en la matriz de extracción del proyecto.")

        available_columns = list((matrix_rows[0].extraction_data or {}).keys())
        ai = AIEngineFactory.get_provider(provider=provider, model=model)
        custom_instruction = (
            f"\nINSTRUCCIÓN TEMPORAL DEL INVESTIGADOR:\n{custom_prompt}"
            if custom_prompt
            else ""
        )

        # PASO 1A: Determinación de Columnas
        if user_chosen_columns and len(user_chosen_columns) > 0:
            target_cols = [c for c in user_chosen_columns if c in available_columns or c == "ID"]
            if "ID" not in target_cols:
                target_cols.insert(0, "ID")
        else:
            # Enviar los nombres de columnas a la IA para que recomiende cuáles usar para este objetivo
            prompt_cols = (
                f"PROYECTO RSL: {project.title}\n"
                f"CÓDIGO DE OBJETIVO: {section.objective_title}\n"
                f"DESCRIPCIÓN DEL OBJETIVO: {section.objective_description}\n\n"
            f"NOMBRES DE COLUMNAS DISPONIBLES EN LA MATRIZ DE EXTRACCIÓN:\n"
            f"{available_columns}\n\n"
                f"Selecciona las columnas (recommended_columns) más relevantes de la matriz para responder a este objetivo."
                f"{custom_instruction}"
            )
            sys_cols = "Recomienda las columnas de la matriz necesarias para analizar el objetivo RSL. Responde en formato JSON."
            
            res_cols: RecommendedColumnsOutput = ai.generate_structured(
                prompt=prompt_cols,
                schema=RecommendedColumnsOutput,
                system_instruction=sys_cols,
                temperature=temperature,
            )

            target_cols = res_cols.recommended_columns
            if "ID" not in target_cols:
                target_cols.insert(0, "ID")

        # PASO 1B: Elegibilidad de IDs y Justificación (con la matriz reducida a las columnas del paso 1A)
        trimmed_matrix = prepare_trimmed_matrix_for_eligibility(matrix_rows, target_cols)

        prompt_ids = (
            f"PROYECTO RSL: {project.title}\n"
            f"CÓDIGO DE OBJETIVO: {section.objective_title}\n"
            f"DESCRIPCIÓN DEL OBJETIVO: {section.objective_description}\n\n"
            f"MATRIZ RECORTADA A LAS COLUMNAS DETERMINADAS ({target_cols}):\n"
            f"{trimmed_matrix}\n\n"
            f"1. Evalúa qué artículos de esta matriz recortada son candidatos elegibles (eligible_candidate_ids) para aportar a este objetivo.\n"
            f"2. Explica detalladamente la razón (selection_justifications) del porqué para cada candidato elegido."
            f"{custom_instruction}"
        )
        sys_ids = "Evalúa la elegibilidad científica de artículos en la matriz recortada para el objetivo RSL. Responde en formato JSON."

        res_ids: JustifyEligibilityOutput = ai.generate_structured(
            prompt=prompt_ids,
            schema=JustifyEligibilityOutput,
            system_instruction=sys_ids,
            temperature=temperature,
        )

        section.candidate_article_ids = res_ids.eligible_candidate_ids
        section.selection_justifications = res_ids.selection_justifications
        section.trimmed_columns_used = target_cols
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


def generate_objective_results_unified_with_ai(
    db: Session,
    section_id: uuid.UUID,
    provider: str = "deepseek",
    model: str = "deepseek-v4-pro",
    temperature: float = 0.2,
) -> RSLSynthesisSection:
    """
    PASO 2:
    Toma únicamente los IDs elegibles (eligible_candidate_ids) y únicamente las columnas recortadas (trimmed_columns_used).
    Envía esa matriz ultra-reducida a la IA potente para que devuelva la Tabla JSONB + Explicación Narrativa con citas [ID] en 1 solo paso.
    """
    section = db.get(RSLSynthesisSection, section_id)
    if not section:
        raise ValueError("No se encontró la sección de síntesis.")

    if section.section_type != SynthesisSectionType.RESULTS_OBJECTIVE:
        raise ValueError("Este servicio es exclusivo para secciones de Resultados por Objetivo.")

    project = db.get(RSLProject, section.project_id)
    if not project:
        raise ValueError("No se encontró el proyecto RSL.")

    if not section.candidate_article_ids:
        raise ValueError("No hay artículos candidatos elegidos en esta sección. Ejecute el Paso 1 de elegibilidad primero.")

    section.status_writing = StatusWriting.WRITING_BY_AI
    db.add(section)
    db.commit()

    try:
        matrix_rows = db.exec(
            select(ExtractedMatrixRow).where(ExtractedMatrixRow.project_id == section.project_id)
        ).all()

        candidates = [
            r for r in matrix_rows
            if (r.article_custom_id in section.candidate_article_ids or str(r.id)[:8] in section.candidate_article_ids)
        ]

        if not candidates:
            candidates = matrix_rows[:10]

        target_cols = section.trimmed_columns_used or ["ID", "Título", "Resultados", "Conclusiones"]
        trimmed_candidates = prepare_trimmed_matrix_for_eligibility(candidates, target_cols)

        ai = AIEngineFactory.get_provider(provider=provider, model=model)

        prompt = (
            f"PROYECTO RSL: {project.title}\n"
            f"CÓDIGO DE OBJETIVO: {section.objective_title}\n"
            f"DESCRIPCIÓN DEL OBJETIVO: {section.objective_description}\n\n"
            f"JUSTIFICACIONES DE SELECCIÓN (PORQUÉ): {section.selection_justifications}\n"
            f"MATRIZ ULTRA-REDUCIDA (ÚNICAMENTE ARTÍCULOS ELEGIBLES Y COLUMNAS DETERMINADAS):\n"
            f"{trimmed_candidates}\n\n"
            f"REQUISITOS EN 1 PASO:\n"
            f"1. TABLA (table): Construye una tabla sintética comparativa bien estructurada.\n"
            f"2. NARRATIVA (narrative_explanation): Redacta una explicación académica profunda en Markdown sintetizando los patrones. Cita obligatoriamente cada hallazgo usando el ID compuesto exacto entre corchetes o paréntesis, ej. '[AgentJulc]' o '(AgentJulc)'. Cero formatos APA o IEEE."
        )

        system_instruction = (
            "Eres un analista de datos científicos especializado en RSL.\n"
            "Genera la tabla comparativa estructurada y la explicación narrativa profunda con citas exactas por ID [AgentJulc]. Responde en formato JSON."
        )

        result: UnifiedObjectiveResultsOutput = ai.generate_structured(
            prompt=prompt,
            schema=UnifiedObjectiveResultsOutput,
            system_instruction=system_instruction,
            temperature=temperature,
        )

        section.generated_table = result.table.model_dump()
        section.generated_draft = result.narrative_explanation
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
