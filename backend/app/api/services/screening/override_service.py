"""
Servicio de Negocio para la Corrección y Sobrescritura Manual del Investigador sobre Decisiones de IA.
Permite cambiar decisiones de Título o Abstract y recalcula automáticamente el Diagrama PRISMA 2020.
"""
import uuid

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.api.models.screening_model import (
    ProcessStatus,
    ScreeningDecision,
    ScreeningDecisionEnum,
    ScreeningSession,
)
from app.api.services.screening.deduplication_service import get_or_create_screening_session


def override_screening_decision(
    db: Session,
    project_id: uuid.UUID,
    record_id: uuid.UUID,
    stage: str,
    new_status: ScreeningDecisionEnum,
    override_reason: str = None,
) -> ScreeningSession:
    """
    Sobrescribe la decisión de la IA sobre un artículo en la etapa especificada ('title' o 'abstract')
    y actualiza las métricas acumuladas de la sesión PRISMA.
    """
    session_obj = get_or_create_screening_session(db, project_id)

    statement = (
        select(ScreeningDecision)
        .where(ScreeningDecision.screening_session_id == session_obj.id)
        .where(ScreeningDecision.record_id == record_id)
    )
    decision = db.exec(statement).first()

    if not decision:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No se encontró un registro de decisión de cribado para el artículo '{record_id}'.",
        )

    stage_clean = stage.strip().lower()
    user_note = f" [SOBREESCRITO POR INVESTIGADOR: {override_reason}]" if override_reason else " [SOBREESCRITO POR INVESTIGADOR]"

    if stage_clean == "title":
        old_reason = decision.title_reason or ""
        decision.title_status = new_status
        decision.title_reason = f"{old_reason}{user_note}"
    elif stage_clean == "abstract":
        old_reason = decision.abstract_reason or ""
        decision.abstract_status = new_status
        decision.abstract_reason = f"{old_reason}{user_note}"
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Fase no válida. La etapa a modificar debe ser 'title' o 'abstract'.",
        )

    db.add(decision)
    db.commit()

    # Recalcular métricas de la sesión PRISMA
    all_decisions = db.exec(
        select(ScreeningDecision)
        .where(ScreeningDecision.screening_session_id == session_obj.id)
        .where(ScreeningDecision.is_duplicate == False)
    ).all()

    title_inc = sum(1 for d in all_decisions if d.title_status in (ScreeningDecisionEnum.INCLUDED, ScreeningDecisionEnum.MAYBE))
    title_exc = sum(1 for d in all_decisions if d.title_status == ScreeningDecisionEnum.EXCLUDED)
    abs_inc = sum(1 for d in all_decisions if d.abstract_status == ScreeningDecisionEnum.INCLUDED)
    abs_exc = sum(1 for d in all_decisions if d.abstract_status == ScreeningDecisionEnum.EXCLUDED)

    session_obj.title_included_count = title_inc
    session_obj.title_excluded_count = title_exc
    session_obj.abstract_included_count = abs_inc
    session_obj.abstract_excluded_count = abs_exc

    db.add(session_obj)
    db.commit()
    db.refresh(session_obj)

    return session_obj


def cancel_screening_process(db: Session, project_id: uuid.UUID) -> ScreeningSession:
    """
    Cancela manualmente el proceso de cribado en ejecución:
    1. Revoca la tarea activa de Celery si se encuentra registrada (celery_task_id).
    2. Resetea cualquier registro en estado 'EVALUATING' de vuelta a 'PENDING'.
    3. Restablece el estado de la sesión a 'IDLE'.
    """
    from app.workers.celery_app import celery_app

    session_obj = get_or_create_screening_session(db, project_id)

    evaluating_decisions = db.exec(
        select(ScreeningDecision)
        .where(ScreeningDecision.screening_session_id == session_obj.id)
        .where(
            (ScreeningDecision.title_status == ScreeningDecisionEnum.EVALUATING)
            | (ScreeningDecision.abstract_status == ScreeningDecisionEnum.EVALUATING)
        )
    ).all()

    # Cancelar sin una tarea activa es una operación idempotente.
    if not session_obj.celery_task_id and not evaluating_decisions:
        return session_obj

    # 1. Revocar tarea en Celery
    if session_obj.celery_task_id:
        try:
            celery_app.control.revoke(session_obj.celery_task_id, terminate=True)
        except Exception:
            pass
        session_obj.celery_task_id = None

    # 2. Resetear registros atrapados en EVALUATING
    for d in evaluating_decisions:
        if d.title_status == ScreeningDecisionEnum.EVALUATING:
            d.title_status = ScreeningDecisionEnum.PENDING
            d.title_reason = "Cancelado por el usuario."
        if d.abstract_status == ScreeningDecisionEnum.EVALUATING:
            d.abstract_status = ScreeningDecisionEnum.PENDING
            d.abstract_reason = "Cancelado por el usuario."
        db.add(d)

    # 3. Cambiar estado a IDLE
    session_obj.status = ProcessStatus.IDLE
    session_obj.error_message = "Proceso de cribado cancelado por el usuario."
    db.add(session_obj)
    db.commit()
    db.refresh(session_obj)

    return session_obj
