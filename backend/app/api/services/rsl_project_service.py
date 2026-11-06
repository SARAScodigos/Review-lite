from typing import List, Optional
import uuid
from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.api.models.author_model import Author
from app.api.models.rsl_project_model import RSLProject
from app.api.schemas.rsl_project_schema import RSLProjectCreate, RSLProjectUpdate


def create_project(session: Session, project_in: RSLProjectCreate) -> RSLProject:
    """Crea un nuevo Proyecto RSL y opcionalmente vincula autores por sus IDs."""
    project_data = project_in.model_dump(exclude={"author_ids"})
    project = RSLProject.model_validate(project_data)

    if project_in.author_ids:
        authors = session.exec(
            select(Author).where(Author.id.in_(project_in.author_ids))
        ).all()
        project.authors = list(authors)

    session.add(project)
    session.commit()
    session.refresh(project)
    return project


def get_project_by_id(
    session: Session, project_id: uuid.UUID
) -> Optional[RSLProject]:
    """Obtiene un Proyecto RSL por su UUID."""
    return session.get(RSLProject, project_id)


def get_projects(
    session: Session, skip: int = 0, limit: int = 100
) -> List[RSLProject]:
    """Obtiene una lista paginada de Proyectos RSL."""
    statement = select(RSLProject).offset(skip).limit(limit)
    return list(session.exec(statement).all())


def update_project(
    session: Session, db_project: RSLProject, project_in: RSLProjectUpdate
) -> RSLProject:
    """Actualiza parcialmente los datos de un Proyecto RSL y sus autores vinculados."""
    update_data = project_in.model_dump(exclude_unset=True, exclude={"author_ids"})
    db_project.sqlmodel_update(update_data)

    if project_in.author_ids is not None:
        if project_in.author_ids:
            authors = session.exec(
                select(Author).where(Author.id.in_(project_in.author_ids))
            ).all()
            db_project.authors = list(authors)
        else:
            db_project.authors = []

    session.add(db_project)
    session.commit()
    session.refresh(db_project)
    return db_project


def delete_project(session: Session, db_project: RSLProject) -> None:
    """Elimina un Proyecto RSL de la base de datos."""
    session.delete(db_project)
    session.commit()


def add_author_to_project(
    session: Session, project: RSLProject, author: Author
) -> RSLProject:
    """Asocia un Autor a un Proyecto RSL existente."""
    if author not in project.authors:
        project.authors.append(author)
        session.add(project)
        session.commit()
        session.refresh(project)
    return project


def remove_author_from_project(
    session: Session, project: RSLProject, author: Author
) -> RSLProject:
    """Desasocia un Autor de un Proyecto RSL."""
    if author in project.authors:
        project.authors.remove(author)
        session.add(project)
        session.commit()
        session.refresh(project)
    return project
