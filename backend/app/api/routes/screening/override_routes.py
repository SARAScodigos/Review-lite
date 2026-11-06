"""
Controlador HTTP para la corrección/sobrescritura manual de decisiones de la IA por el investigador.
"""
import uuid

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.api.schemas.screening.override_schema import OverrideDecisionRequest
from app.api.schemas.screening.session_schema import ScreeningSessionRead
from app.api.services.screening.override_service import (
    cancel_screening_process,
    override_screening_decision,
)
from app.db.session import get_session

router = APIRouter()


@router.post("/override-decision", response_model=ScreeningSessionRead)
def override_screening_decision_endpoint(
    project_id: uuid.UUID,
    payload: OverrideDecisionRequest,
    db: Session = Depends(get_session),
):
    """
    Permite al investigador sobrescribir manualmente la decisión de la IA sobre un artículo ('title' o 'abstract').
    Recalcula automáticamente los contadores acumulados del Diagrama PRISMA 2020.
    """
    return override_screening_decision(
        db=db,
        project_id=project_id,
        record_id=payload.record_id,
        stage=payload.stage,
        new_status=payload.new_status,
        override_reason=payload.override_reason,
    )


@router.post("/cancel", response_model=ScreeningSessionRead)
def cancel_screening_process_endpoint(
    project_id: uuid.UUID,
    db: Session = Depends(get_session),
):
    """
    Cancela manualmente el proceso de cribado por IA en ejecución:
    Revoca la tarea activa en Celery y resetea cualquier registro atascado en 'EVALUATING' de vuelta a 'PENDING'.
    """
    return cancel_screening_process(db=db, project_id=project_id)
