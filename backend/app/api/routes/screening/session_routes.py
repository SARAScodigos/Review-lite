"""
Controlador HTTP para la consulta de Estado de Sesión de Screening y Diagrama PRISMA 2020.
Maneja el endpoint del tablero general del proyecto RSL.
"""
import uuid

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.api.schemas.screening.session_schema import ScreeningSessionRead
from app.api.services.prisma_export_service import get_prisma_fulltext_retrieval_metrics
from app.api.services.screening.deduplication_service import get_or_create_screening_session
from app.db.session import get_session

router = APIRouter()


@router.get("/session", response_model=ScreeningSessionRead)
def get_screening_session_endpoint(
    project_id: uuid.UUID,
    db: Session = Depends(get_session),
):
    """
    Obtiene el estado actual de la sesión de cribado y las métricas acumuladas del Diagrama PRISMA 2020.
    """
    session_obj = get_or_create_screening_session(db, project_id)
    retrieval = get_prisma_fulltext_retrieval_metrics(db, project_id)
    response = ScreeningSessionRead.model_validate(session_obj)
    return response.model_copy(
        update={
            "fulltext_not_retrieved_count": retrieval["not_retrieved"],
            "fulltext_retrieved_count": retrieval["retrieved"],
        }
    )
