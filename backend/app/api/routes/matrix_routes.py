"""
Controladores HTTP para la Matriz de Extracción Dinámica JSONB, Descarga de Plantilla Excel,
Importación Masiva Desacoplada y Confirmación de Texto Completo (Hito 4).
"""
from typing import List
import uuid

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from app.api.schemas.extracted_record_schema import AsyncExtractionResponse, TaskStatusResponse
from app.api.schemas.matrix_schema import (
    ConfirmFulltextDecisionRequest,
    CreateManualMatrixRowRequest,
    CreateMatrixCustomColumnRequest,
    DeleteMatrixRowResponse,
    ExtractedMatrixRowRead,
    MatrixWorkbenchMetricsRead,
    MatrixColumnRead,
    PaginatedMatrixRowsResponse,
    PaginatedMatrixWorkbenchCandidatesResponse,
    PatchMatrixRowRequest,
    StartMatrixExtractionRequest,
    UpdateMatrixRowRequest,
    UpdateMatrixCustomColumnRequest,
    UpdateMatrixColumnAIInclusionRequest,
)
from app.api.schemas.screening.session_schema import ScreeningSessionRead
from app.api.services.matrix_extraction_service import (
    confirm_fulltext_decision,
    create_matrix_custom_column,
    create_manual_matrix_row,
    delete_matrix_row,
    delete_matrix_custom_column,
    export_project_matrix_excel,
    get_matrix_workbench_candidates_paginated,
    get_matrix_workbench_metrics,
    get_matrix_columns_for_frontend,
    get_project_matrix_rows,
    get_project_matrix_rows_paginated,
    import_matrix_from_excel_csv,
    patch_matrix_row_cells,
    synchronize_project_matrix_schema,
    set_matrix_column_ai_inclusion,
    update_matrix_row_cells,
    update_matrix_custom_column,
)
from app.api.services.parsers_pdf import generate_matrix_excel_template
from app.api.services.rsl_project_service import get_project_by_id
from app.db.session import get_session
from app.workers.celery_app import celery_app
from app.workers.tasks import run_matrix_extraction_task, run_single_matrix_extraction_task

router = APIRouter(prefix="/projects/{project_id}/matrix", tags=["Extraction Matrix & Full-Text Screening"])


@router.post("/extract-all", response_model=AsyncExtractionResponse)
def start_batch_matrix_extraction_endpoint(
    project_id: uuid.UUID,
    payload: StartMatrixExtractionRequest = StartMatrixExtractionRequest(),
    db: Session = Depends(get_session),
):
    """
    Inicia la tarea asíncrona en Celery para la extracción masiva de matrices desde PDFs con IA.
    Ejecuta 5 solicitudes en paralelo por worker (ThreadPoolExecutor) sin bloquear otros procesos.
    """
    task = run_matrix_extraction_task.delay(
        str(project_id),
        payload.provider,
        payload.model,
        payload.temperature,
    )

    return AsyncExtractionResponse(
        task_id=task.id,
        project_id=project_id,
        status="QUEUED",
        message=f"Extracción masiva de matrices encolada exitosamente en Celery con IA ({payload.provider} / {payload.model}).",
    )


@router.post("/records/{record_id}/extract", response_model=AsyncExtractionResponse)
def extract_single_matrix_row_endpoint(
    project_id: uuid.UUID,
    record_id: uuid.UUID,
    payload: StartMatrixExtractionRequest = StartMatrixExtractionRequest(),
    db: Session = Depends(get_session),
):
    """
    Encola la extracción de matriz por IA para un único artículo específico.
    """
    task = run_single_matrix_extraction_task.delay(
        str(project_id),
        str(record_id),
        payload.provider,
        payload.model,
        payload.temperature,
    )
    return AsyncExtractionResponse(
        task_id=task.id,
        project_id=project_id,
        status="QUEUED",
        message=(
            "Extracción individual de matriz encolada exitosamente "
            f"con IA ({payload.provider} / {payload.model})."
        ),
    )


@router.get("/tasks/{task_id}/status", response_model=TaskStatusResponse)
def get_matrix_extraction_task_status_endpoint(task_id: str):
    """Consulta el estado de una extracción individual o masiva de matriz."""
    task_result = AsyncResult(task_id, app=celery_app)
    result = None
    error = None
    if task_result.ready():
        if task_result.successful():
            result = task_result.result
        else:
            error = str(task_result.result) if task_result.result else "Error en la tarea de extracción."
            result = error
    return TaskStatusResponse(task_id=task_id, status=task_result.status, result=result, error=error)


@router.get("/rows", response_model=List[ExtractedMatrixRowRead])
def get_project_matrix_rows_endpoint(
    project_id: uuid.UUID,
    db: Session = Depends(get_session),
):
    """
    Retorna la lista de todas las filas de la matriz de extracción del proyecto (tanto generadas por IA como importadas por el usuario).
    """
    return get_project_matrix_rows(db, project_id)


@router.get("/columns", response_model=List[MatrixColumnRead])
def get_matrix_custom_columns_endpoint(project_id: uuid.UUID, db: Session = Depends(get_session)):
    return get_matrix_columns_for_frontend(db, project_id)


@router.post("/columns", response_model=MatrixColumnRead, status_code=status.HTTP_201_CREATED)
def create_matrix_custom_column_endpoint(project_id: uuid.UUID, payload: CreateMatrixCustomColumnRequest, db: Session = Depends(get_session)):
    custom_column = create_matrix_custom_column(db, project_id, payload.name)
    return next(
        column
        for column in get_matrix_columns_for_frontend(db, project_id)
        if column["id"] == custom_column.id
    )


@router.patch("/columns/ai-inclusion", response_model=MatrixColumnRead)
def update_matrix_column_ai_inclusion_endpoint(
    project_id: uuid.UUID,
    payload: UpdateMatrixColumnAIInclusionRequest,
    db: Session = Depends(get_session),
):
    return set_matrix_column_ai_inclusion(db, project_id, payload.name.strip(), payload.include_in_ai)


@router.patch("/columns/{column_id}", response_model=MatrixColumnRead)
def update_matrix_custom_column_endpoint(project_id: uuid.UUID, column_id: uuid.UUID, payload: UpdateMatrixCustomColumnRequest, db: Session = Depends(get_session)):
    custom_column = update_matrix_custom_column(db, project_id, column_id, payload.name, payload.position)
    return next(
        column
        for column in get_matrix_columns_for_frontend(db, project_id)
        if column["id"] == custom_column.id
    )


@router.delete("/columns/{column_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_matrix_custom_column_endpoint(project_id: uuid.UUID, column_id: uuid.UUID, db: Session = Depends(get_session)):
    delete_matrix_custom_column(db, project_id, column_id)


@router.get("/rows/paginated", response_model=PaginatedMatrixRowsResponse)
def get_project_matrix_rows_paginated_endpoint(
    project_id: uuid.UUID,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_session),
):
    """Retorna filas de la matriz por página, incluidas las importadas manualmente."""
    return get_project_matrix_rows_paginated(db, project_id, skip, limit)


@router.get("/workbench", response_model=PaginatedMatrixWorkbenchCandidatesResponse)
def get_matrix_workbench_endpoint(
    project_id: uuid.UUID,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_session),
):
    """Mesa paginada de control de PDF, extracción y decisión a texto completo."""
    return get_matrix_workbench_candidates_paginated(db, project_id, skip, limit)


@router.get("/metrics", response_model=MatrixWorkbenchMetricsRead)
def get_matrix_workbench_metrics_endpoint(
    project_id: uuid.UUID,
    db: Session = Depends(get_session),
):
    """Retorna los indicadores agregados de la mesa de extracción."""
    return get_matrix_workbench_metrics(db, project_id)


@router.post("/rows", response_model=ExtractedMatrixRowRead)
def create_manual_matrix_row_endpoint(
    project_id: uuid.UUID,
    payload: CreateManualMatrixRowRequest,
    db: Session = Depends(get_session),
):
    """Crea una fila manual desacoplada dentro de la matriz."""
    return create_manual_matrix_row(
        db,
        project_id,
        payload.article_custom_id,
        payload.extraction_data,
        payload.review_status,
    )


@router.put("/rows/{row_id}", response_model=ExtractedMatrixRowRead)
def update_matrix_row_endpoint(
    project_id: uuid.UUID,
    row_id: uuid.UUID,
    payload: UpdateMatrixRowRequest,
    db: Session = Depends(get_session),
):
    """
    Permite al investigador editar celda por celda cualquier valor de la matriz en formato JSONB.
    """
    return update_matrix_row_cells(
        db=db,
        project_id=project_id,
        row_id=row_id,
        extraction_data=payload.extraction_data,
        review_status=payload.review_status,
    )


@router.patch("/rows/{row_id}", response_model=ExtractedMatrixRowRead)
def patch_matrix_row_endpoint(
    project_id: uuid.UUID,
    row_id: uuid.UUID,
    payload: PatchMatrixRowRequest,
    db: Session = Depends(get_session),
):
    """Actualiza solamente las celdas incluidas por el investigador."""
    return patch_matrix_row_cells(
        db,
        project_id,
        row_id,
        payload.extraction_data_patch,
        payload.review_status,
    )


@router.delete("/rows/{row_id}", response_model=DeleteMatrixRowResponse)
def delete_matrix_row_endpoint(
    project_id: uuid.UUID,
    row_id: uuid.UUID,
    db: Session = Depends(get_session),
):
    """Elimina una fila de la matriz por acción explícita del investigador."""
    return delete_matrix_row(db, project_id, row_id)


@router.get("/template/excel")
def download_matrix_excel_template_endpoint(
    project_id: uuid.UUID,
    db: Session = Depends(get_session),
):
    """
    Exporta y descarga una plantilla limpia en Excel (.xlsx) con las 18 columnas estándar
    más las columnas personalizadas de esta matriz, lista para llenado e importación manual.
    """
    project = get_project_by_id(session=db, project_id=project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="El proyecto RSL no existe.")

    excel_buffer = generate_matrix_excel_template(
        project_title=project.title,
        custom_columns=[
            column.name
            for column in synchronize_project_matrix_schema(db, project_id)
        ],
    )

    filename = f"plantilla_matriz_{project.title[:15].strip().replace(' ', '_')}.xlsx"

    return StreamingResponse(
        excel_buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/excel")
def export_project_matrix_excel_endpoint(
    project_id: uuid.UUID,
    db: Session = Depends(get_session),
):
    """Descarga la matriz disponible con sus filas reales en formato Excel."""
    excel_buffer, filename = export_project_matrix_excel(db, project_id)
    return StreamingResponse(
        excel_buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/import-excel", response_model=List[ExtractedMatrixRowRead])
async def import_matrix_excel_endpoint(
    project_id: uuid.UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_session),
):
    """
    Permite importar masivamente matrices hechas en Excel (.xlsx, .xls) o CSV directamente al proyecto
    de forma desacoplada (record_id = NULL, source_type = USER_IMPORTED).
    """
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El archivo importado está vacío.")

    return import_matrix_from_excel_csv(
        db=db,
        project_id=project_id,
        file_bytes=file_bytes,
        filename=file.filename or "matriz.xlsx",
    )


@router.post("/confirm-fulltext", response_model=ScreeningSessionRead)
def confirm_fulltext_decision_endpoint(
    project_id: uuid.UUID,
    payload: ConfirmFulltextDecisionRequest,
    db: Session = Depends(get_session),
):
    """
    Confirmación humana definitiva de la fase de Cribado a Texto Completo (Human-in-the-Loop).
    Actualiza el veredicto en ScreeningDecision y recalcula el contador final del Diagrama PRISMA 2020.
    """
    return confirm_fulltext_decision(
        db=db,
        project_id=project_id,
        record_id=payload.record_id,
        final_status=payload.final_status,
        decision_reason=payload.decision_reason,
    )
