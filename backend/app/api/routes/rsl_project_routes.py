from typing import List
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.api.schemas.rsl_project_schema import (
    RSLProjectCreate,
    RSLProjectRead,
    RSLProjectReadWithAuthors,
    RSLProjectUpdate,
)
from app.api.services import rsl_project_service
from app.db.session import get_session

router = APIRouter(prefix="/projects", tags=["RSL Projects"])


@router.post(
    "/",
    response_model=RSLProjectReadWithAuthors,
    status_code=status.HTTP_201_CREATED,
)
def create_project(
    project_in: RSLProjectCreate,
    session: Session = Depends(get_session),
):
    """
    Crea un nuevo Proyecto RSL.
    Opcionalmente se puede enviar 'author_ids': [1, 2] en el cuerpo JSON para asociar autores.
    """
    return rsl_project_service.create_project(session=session, project_in=project_in)


@router.get("/", response_model=List[RSLProjectRead])
def list_projects(
    skip: int = Query(default=0, ge=0, description="Registros a omitir"),
    limit: int = Query(default=100, ge=1, le=500, description="Límite por página"),
    session: Session = Depends(get_session),
):
    """Obtiene el listado paginado de Proyectos RSL."""
    return rsl_project_service.get_projects(session=session, skip=skip, limit=limit)


@router.get("/{project_id}", response_model=RSLProjectReadWithAuthors)
def get_project(
    project_id: uuid.UUID,
    session: Session = Depends(get_session),
):
    """Obtiene los detalles de un Proyecto RSL por su UUID, incluyendo sus autores asociados."""
    project = rsl_project_service.get_project_by_id(
        session=session, project_id=project_id
    )
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Proyecto RSL con ID {project_id} no encontrado.",
        )
    return project


@router.patch("/{project_id}", response_model=RSLProjectReadWithAuthors)
def update_project(
    project_id: uuid.UUID,
    project_in: RSLProjectUpdate,
    session: Session = Depends(get_session),
):
    """
    Actualiza parcialmente la información de un Proyecto RSL existente.
    Si se incluye 'author_ids', actualiza la lista completa de autores asociados.
    """
    db_project = rsl_project_service.get_project_by_id(
        session=session, project_id=project_id
    )
    if not db_project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Proyecto RSL con ID {project_id} no encontrado.",
        )
    return rsl_project_service.update_project(
        session=session, db_project=db_project, project_in=project_in
    )


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: uuid.UUID,
    session: Session = Depends(get_session),
):
    """Elimina un Proyecto RSL por su UUID."""
    db_project = rsl_project_service.get_project_by_id(
        session=session, project_id=project_id
    )
    if not db_project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Proyecto RSL con ID {project_id} no encontrado.",
        )
    rsl_project_service.delete_project(session=session, db_project=db_project)
