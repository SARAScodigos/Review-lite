import os
import re
from typing import List, Optional

from fastapi import UploadFile
from sqlmodel import Session, select

from app.api.models.author_model import Author
from app.api.schemas.author_schema import AuthorCreate, AuthorUpdate
from app.config import settings


def _sanitize_path_part(value: str, fallback: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9._-]+", "_", value.strip()).strip("._-")
    return cleaned or fallback


def _get_author_signature_folder(first_name: str, last_name: str) -> str:
    author_name = f"{first_name}_{last_name}".strip("_")
    folder_name = _sanitize_path_part(author_name, "author")
    folder_path = os.path.join(settings.SIGNATURES_STORAGE_DIR, folder_name)
    os.makedirs(folder_path, exist_ok=True)
    return folder_path


def _save_signature_file(first_name: str, last_name: str, file: UploadFile) -> str:
    folder_path = _get_author_signature_folder(first_name, last_name)
    original_filename = file.filename or "signature"
    filename = _sanitize_path_part(original_filename, "signature")
    file_path = os.path.join(folder_path, filename)

    file_content = file.file.read()
    with open(file_path, "wb") as signature_file:
        signature_file.write(file_content)

    return file_path


def _delete_file_if_exists(file_path: Optional[str]) -> None:
    if file_path and os.path.exists(file_path):
        try:
            os.remove(file_path)
        except OSError:
            pass


def create_author(
    session: Session, author_in: AuthorCreate, signature_file: Optional[UploadFile] = None
) -> Author:
    """Crea un nuevo Autor en la base de datos."""
    if signature_file:
        author_in.signature_url = _save_signature_file(
            author_in.first_name, author_in.last_name, signature_file
        )

    author = Author.model_validate(author_in)
    session.add(author)
    session.commit()
    session.refresh(author)
    return author


def get_author_by_id(session: Session, author_id: int) -> Optional[Author]:
    """Obtiene un Autor por su ID."""
    return session.get(Author, author_id)


def get_authors(
    session: Session, skip: int = 0, limit: int = 100
) -> List[Author]:
    """Obtiene una lista paginada de Autores."""
    statement = select(Author).offset(skip).limit(limit)
    return list(session.exec(statement).all())


def update_author(
    session: Session,
    db_author: Author,
    author_in: AuthorUpdate,
    signature_file: Optional[UploadFile] = None,
) -> Author:
    """Actualiza parcialmente los datos de un Autor."""
    update_data = author_in.model_dump(exclude_unset=True)
    if signature_file:
        first_name = update_data.get("first_name", db_author.first_name)
        last_name = update_data.get("last_name", db_author.last_name)
        new_signature_path = _save_signature_file(first_name, last_name, signature_file)
        if new_signature_path != db_author.signature_url:
            _delete_file_if_exists(db_author.signature_url)
        update_data["signature_url"] = new_signature_path

    db_author.sqlmodel_update(update_data)
    session.add(db_author)
    session.commit()
    session.refresh(db_author)
    return db_author


def delete_author(session: Session, db_author: Author) -> None:
    """Elimina un Autor de la base de datos."""
    _delete_file_if_exists(db_author.signature_url)
    session.delete(db_author)
    session.commit()
