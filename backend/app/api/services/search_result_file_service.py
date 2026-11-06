import os
import re
import secrets
from typing import List, Optional
import uuid

from fastapi import UploadFile
from sqlmodel import Session, select

from app.api.models.rsl_project_model import RSLProject
from app.api.models.search_result_file_model import SearchResultFile
from app.api.schemas.search_result_file_schema import SearchResultFileUpdate
from app.config import settings


def _get_or_create_project_folder(project_title: str) -> str:
    """
    Genera y crea una subcarpeta dentro de settings.SEARCH_RESULTS_DIR
    utilizando las primeras 7 letras del título del proyecto más un código hexadecimal aleatorio
    para evitar colisiones. Maneja incrementos (_2, _3) en caso improbable de colisión.
    """
    os.makedirs(settings.SEARCH_RESULTS_DIR, exist_ok=True)

    # Limpiar el título: minúsculas, solo caracteres alfanuméricos
    cleaned_title = re.sub(r"[^a-zA-Z0-9]", "", project_title).lower()
    prefix = cleaned_title[:7] if len(cleaned_title) >= 7 else cleaned_title.ljust(7, "x")

    hex_suffix = secrets.token_hex(3)  # 6 caracteres hexadecimales
    folder_name = f"{prefix}_{hex_suffix}"
    folder_path = os.path.join(settings.SEARCH_RESULTS_DIR, folder_name)

    counter = 1
    original_folder_path = folder_path
    while os.path.exists(folder_path):
        counter += 1
        folder_path = f"{original_folder_path}_{counter}"

    os.makedirs(folder_path, exist_ok=True)
    return folder_path


def save_search_file(
    session: Session,
    project: RSLProject,
    file: UploadFile,
    nombre: Optional[str] = None,
    database_source: Optional[str] = None,
    search_equation: Optional[str] = None,
    notes: Optional[str] = None,
    total_records: Optional[int] = None,
    file_type: Optional[str] = None,
) -> SearchResultFile:
    """
    Guarda físicamente el archivo subido en el directorio app/data/search_results/
    y registra sus metadatos en la base de datos.
    """
    folder_path = _get_or_create_project_folder(project.title)

    original_filename = file.filename or "uploaded_file"
    file_path = os.path.join(folder_path, original_filename)

    # Si no se provee el tipo de archivo, inferirlo de la extensión
    if not file_type and "." in original_filename:
        file_type = original_filename.rsplit(".", 1)[-1].lower()

    # Escribir el contenido del archivo en disco
    file_content = file.file.read()
    with open(file_path, "wb") as f:
        f.write(file_content)

    display_name = nombre if nombre and nombre.strip() else original_filename

    search_file = SearchResultFile(
        project_id=project.id,
        nombre=display_name,
        file_path=os.path.relpath(file_path, os.getcwd()),
        database_source=database_source,
        search_equation=search_equation,
        notes=notes,
        total_records=total_records,
        file_type=file_type,
    )

    session.add(search_file)
    session.commit()
    session.refresh(search_file)
    return search_file


def get_file_by_id(
    session: Session, file_id: uuid.UUID
) -> Optional[SearchResultFile]:
    """Obtiene el registro de un archivo por su UUID."""
    return session.get(SearchResultFile, file_id)


def get_files_by_project(
    session: Session, project_id: uuid.UUID
) -> List[SearchResultFile]:
    """Obtiene la lista de archivos asociados a un proyecto RSL."""
    statement = select(SearchResultFile).where(SearchResultFile.project_id == project_id)
    return list(session.exec(statement).all())


def update_file_metadata(
    session: Session, db_file: SearchResultFile, file_in: SearchResultFileUpdate
) -> SearchResultFile:
    """Actualiza metadatos del archivo registrado."""
    update_data = file_in.model_dump(exclude_unset=True)
    db_file.sqlmodel_update(update_data)
    session.add(db_file)
    session.commit()
    session.refresh(db_file)
    return db_file


def delete_search_file(session: Session, db_file: SearchResultFile) -> None:
    """Elimina el archivo físico del disco y su registro en la base de datos."""
    if os.path.exists(db_file.file_path):
        try:
            os.remove(db_file.file_path)
        except OSError:
            pass

    session.delete(db_file)
    session.commit()
