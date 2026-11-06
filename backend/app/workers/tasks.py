import logging
import uuid
from sqlmodel import Session

from app.ai.catalog import DEFAULT_SCREENING_MODEL, DEFAULT_SCREENING_PROVIDER
from app.db.session import engine
from app.api.services.extracted_record_service import extract_and_store_file_records
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="extract_search_file_task", bind=True)
def extract_search_file_task(self, file_id_str: str):
    """
    Tarea asíncrona de Celery para extraer y almacenar registros de un archivo de búsqueda.
    Ejecutada por el worker consumiendo eventos desde Redis.
    """
    logger.info(f"Iniciando extracción asíncrona para el archivo ID: {file_id_str}")
    file_id = uuid.UUID(file_id_str)

    with Session(engine) as session:
        count = extract_and_store_file_records(session=session, file_id=file_id)

    logger.info(f"Extracción completada con éxito. Archivo ID: {file_id_str}, Registros: {count}")
    return {
        "status": "SUCCESS",
        "file_id": file_id_str,
        "extracted_records_count": count,
    }


@celery_app.task(name="run_deduplication_task", bind=True)
def run_deduplication_task(self, project_id_str: str, force_rerun: bool = False):
    """
    Tarea asíncrona de Celery para ejecutar la desduplicación por clusters de un proyecto RSL.
    """
    from app.api.services.screening_service import run_deduplication_pipeline

    logger.info(f"Iniciando desduplicación asíncrona para el proyecto ID: {project_id_str} (force_rerun={force_rerun})")
    project_id = uuid.UUID(project_id_str)

    with Session(engine) as session:
        screening_session = run_deduplication_pipeline(
            db=session,
            project_id=project_id,
            force_rerun=force_rerun,
        )

    logger.info(f"Desduplicación completada para proyecto ID: {project_id_str}. Estado: {screening_session.status}")
    return {
        "status": "SUCCESS",
        "project_id": project_id_str,
        "session_status": screening_session.status,
        "duplicate_records_count": screening_session.duplicate_records_count,
        "unique_records_count": screening_session.unique_records_count,
    }


@celery_app.task(name="run_title_screening_task", bind=True)
def run_title_screening_task(
    self,
    project_id_str: str,
    provider: str = DEFAULT_SCREENING_PROVIDER,
    model: str = DEFAULT_SCREENING_MODEL,
    temperature: float = 0.2,
    re_run: bool = False,
):
    """
    Tarea asíncrona de Celery para ejecutar el cribado masivo por título utilizando el modelo de IA especificado.
    """
    from app.api.services.screening import run_title_screening_pipeline

    logger.info(
        f"Iniciando cribado por título con IA ({provider} / {model}, re_run={re_run}) para el proyecto ID: {project_id_str}"
    )
    project_id = uuid.UUID(project_id_str)

    with Session(engine) as session:
        screening_session = run_title_screening_pipeline(
            db=session,
            project_id=project_id,
            provider=provider,
            model=model,
            temperature=temperature,
            re_run=re_run,
            celery_task_id=self.request.id,
        )

    logger.info(
        f"Cribado por título completado para proyecto ID: {project_id_str}. "
        f"Incluidos/Maybes: {screening_session.title_included_count}, Excluidos: {screening_session.title_excluded_count}"
    )
    return {
        "status": "SUCCESS",
        "project_id": project_id_str,
        "provider": provider,
        "model": model,
        "title_included_count": screening_session.title_included_count,
        "title_excluded_count": screening_session.title_excluded_count,
    }


@celery_app.task(name="run_abstract_screening_task", bind=True)
def run_abstract_screening_task(
    self,
    project_id_str: str,
    provider: str = DEFAULT_SCREENING_PROVIDER,
    model: str = DEFAULT_SCREENING_MODEL,
    temperature: float = 0.2,
    re_run: bool = False,
):
    """
    Tarea asíncrona de Celery para ejecutar el cribado profundo por abstract utilizando el modelo de IA especificado.
    """
    from app.api.services.screening import run_abstract_screening_pipeline

    logger.info(
        f"Iniciando cribado por abstract con IA ({provider} / {model}, re_run={re_run}) para el proyecto ID: {project_id_str}"
    )
    project_id = uuid.UUID(project_id_str)

    with Session(engine) as session:
        screening_session = run_abstract_screening_pipeline(
            db=session,
            project_id=project_id,
            provider=provider,
            model=model,
            temperature=temperature,
            re_run=re_run,
            celery_task_id=self.request.id,
        )

    logger.info(
        f"Cribado por abstract completado para proyecto ID: {project_id_str}. "
        f"Incluidos: {screening_session.abstract_included_count}, Excluidos: {screening_session.abstract_excluded_count}"
    )
    return {
        "status": "SUCCESS",
        "project_id": project_id_str,
        "provider": provider,
        "model": model,
        "abstract_included_count": screening_session.abstract_included_count,
        "abstract_excluded_count": screening_session.abstract_excluded_count,
    }


@celery_app.task(name="run_pdf_download_task", bind=True)
def run_pdf_download_task(self, project_id_str: str, max_workers: int = 5):
    """
    Tarea asíncrona de Celery para orquestar la descarga masiva de PDFs en acceso abierto de un proyecto RSL.
    """
    from app.api.services.pdf_service import download_project_pdfs_pipeline

    logger.info(f"Iniciando descarga masiva de PDFs en acceso abierto para el proyecto ID: {project_id_str}")
    project_id = uuid.UUID(project_id_str)

    with Session(engine) as session:
        summary = download_project_pdfs_pipeline(
            db=session,
            project_id=project_id,
            max_workers=max_workers,
        )

    logger.info(
        f"Descarga masiva de PDFs completada para proyecto ID: {project_id_str}. "
        f"Descargados: {summary['downloaded']}, Pendientes Manuales: {summary['pending_manual']}, Errores: {summary['errors']}"
    )
    return {
        "status": "SUCCESS",
        "project_id": project_id_str,
        "downloaded_count": summary["downloaded"],
        "pending_manual_count": summary["pending_manual"],
        "error_count": summary["errors"],
    }


@celery_app.task(name="run_matrix_extraction_task", bind=True)
def run_matrix_extraction_task(
    self,
    project_id_str: str,
    provider: str = "deepseek",
    model: str = "deepseek-v4-pro",
    temperature: float = 0.1,
    max_workers: int = 5,
):
    """
    Tarea asíncrona de Celery para orquestar la extracción masiva de matrices desde PDFs con IA.
    Ejecuta 5 solicitudes en paralelo (ThreadPoolExecutor) por worker sin bloquear otros procesos.
    """
    from app.api.services.matrix_extraction_service import run_batch_matrix_extraction_pipeline

    logger.info(
        f"Iniciando extracción masiva de matrices con IA ({provider} / {model}) para el proyecto ID: {project_id_str}"
    )
    project_id = uuid.UUID(project_id_str)

    with Session(engine) as session:
        summary = run_batch_matrix_extraction_pipeline(
            db=session,
            project_id=project_id,
            provider=provider,
            model=model,
            temperature=temperature,
            max_workers=max_workers,
        )

    logger.info(
        f"Extracción de matriz completada para proyecto ID: {project_id_str}. "
        f"Procesados: {summary['processed']}, Errores: {summary['errors']}"
    )
    return {
        "status": "SUCCESS",
        "project_id": project_id_str,
        "provider": provider,
        "model": model,
        "processed_count": summary["processed"],
        "error_count": summary["errors"],
    }


@celery_app.task(name="run_single_matrix_extraction_task", bind=True)
def run_single_matrix_extraction_task(
    self,
    project_id_str: str,
    record_id_str: str,
    provider: str = "deepseek",
    model: str = "deepseek-v4-pro",
    temperature: float = 0.1,
):
    """Extrae una fila de matriz sin mantener bloqueada la solicitud HTTP."""
    from app.api.services.matrix_extraction_service import extract_matrix_row_for_record

    logger.info(
        "Iniciando extracción individual de matriz con IA (%s / %s) para proyecto %s y registro %s",
        provider,
        model,
        project_id_str,
        record_id_str,
    )
    with Session(engine) as session:
        matrix_row = extract_matrix_row_for_record(
            db=session,
            project_id=uuid.UUID(project_id_str),
            record_id=uuid.UUID(record_id_str),
            provider=provider,
            model=model,
            temperature=temperature,
        )

    return {
        "status": "SUCCESS",
        "project_id": project_id_str,
        "record_id": record_id_str,
        "matrix_row_id": str(matrix_row.id),
        "provider": provider,
        "model": model,
    }


@celery_app.task(name="run_synthesis_section_task", bind=True)
def run_synthesis_section_task(
    self,
    action: str,
    section_id_str: str,
    provider: str = "deepseek",
    model: str = "deepseek-v4-pro",
    temperature: float = 0.2,
    selected_columns: list[str] | None = None,
    objective_code: str | None = None,
    custom_prompt: str | None = None,
):
    """Ejecuta en segundo plano la selección, tabla o redacción de una sección RSL."""
    from app.api.models.synthesis_model import SynthesisSectionType
    from app.api.services.synthesis import (
        draft_discussion_or_conclusions_section_with_ai,
        draft_intro_or_theory_section_with_ai,
        draft_objective_results_from_table_with_ai,
        draft_prisma_methodology_section_with_ai,
        evaluate_results_objective_eligibility_and_columns_with_ai,
        evaluate_section_eligibility_with_ai,
        identify_objective_candidate_ids_with_ai,
        recommend_objective_columns_with_ai,
    )
    from app.api.services.synthesis.table_generator import generate_synthesis_table_for_section
    from app.api.models.synthesis_model import RSLSynthesisSection

    from app.api.services.synthesis_policy import is_guided_synthesis_section

    section_id = uuid.UUID(section_id_str)
    with Session(engine) as session:
        section = session.get(RSLSynthesisSection, section_id)
        if not section:
            raise ValueError("No se encontró la sección de síntesis.")
        if is_guided_synthesis_section(section.section_type):
            raise ValueError("Las acciones automáticas de IA están deshabilitadas para esta sección; utiliza la guía para el investigador.")


        if action == "EVALUATE_ELIGIBILITY":
            if section.section_type == SynthesisSectionType.RESULTS_OBJECTIVE:
                result = evaluate_results_objective_eligibility_and_columns_with_ai(
                    session, section_id, objective_code or section.objective_title,
                    selected_columns, provider, model, temperature, custom_prompt,
                )
            else:
                result = evaluate_section_eligibility_with_ai(
                    session, section_id, selected_columns, provider, model, temperature, custom_prompt,
                )
        elif action == "RECOMMEND_COLUMNS":
            result = recommend_objective_columns_with_ai(
                session, section_id, provider, model, temperature, custom_prompt,
            )
        elif action == "IDENTIFY_IDS":
            result = identify_objective_candidate_ids_with_ai(
                session, section_id, provider, model, temperature, custom_prompt,
            )
        elif action == "GENERATE_TABLE":
            result = generate_synthesis_table_for_section(
                session, section_id, provider, model, temperature, custom_prompt,
            )
        elif action == "GENERATE_DRAFT":
            if section.section_type in (SynthesisSectionType.INTRODUCTION, SynthesisSectionType.THEORETICAL_FRAMEWORK):
                result = draft_intro_or_theory_section_with_ai(
                    session, section_id, selected_columns, provider, model, temperature, custom_prompt,
                )
            elif section.section_type == SynthesisSectionType.RESULTS_OBJECTIVE:
                result = draft_objective_results_from_table_with_ai(
                    session, section_id, provider, model, temperature, custom_prompt,
                )
            elif section.section_type == SynthesisSectionType.METHODOLOGY_PRISMA:
                result = draft_prisma_methodology_section_with_ai(
                    session, section_id, provider, model, temperature, custom_prompt,
                )
            else:
                result = draft_discussion_or_conclusions_section_with_ai(
                    session, section_id, selected_columns, provider, model, temperature, custom_prompt,
                )
        else:
            raise ValueError(f"Acción de síntesis no soportada: {action}")

        result_section_id = str(result.id)

    return {"status": "SUCCESS", "action": action, "section_id": result_section_id}


@celery_app.task(name="run_export_docx_task", bind=True)
def run_export_docx_task(self, project_id_str: str, version_id_str: str):
    """
    Tarea asíncrona de Celery para construir y exportar el manuscrito Word (.docx) en segundo plano.
    """
    from app.api.services.rsl_export_service import generate_docx_export_pipeline

    logger.info(f"Iniciando exportación Word (.docx) versión ID {version_id_str} para proyecto ID: {project_id_str}")
    project_id = uuid.UUID(project_id_str)
    version_id = uuid.UUID(version_id_str)

    with Session(engine) as session:
        export_ver = generate_docx_export_pipeline(
            db=session,
            project_id=project_id,
            version_id=version_id,
        )

    logger.info(f"Exportación Word completada para versión {export_ver.version_label} (ID: {version_id_str})")
    return {
        "status": "SUCCESS",
        "project_id": project_id_str,
        "version_id": version_id_str,
        "version_label": export_ver.version_label,
        "file_name": export_ver.file_name,
        "file_size_bytes": export_ver.file_size_bytes,
    }
