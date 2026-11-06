from typing import List, Optional
import uuid
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from sqlmodel import Session

from app.api.schemas.search_result_file_schema import (
    SearchResultFileRead,
    SearchResultFileUpdate,
)
from app.api.services import rsl_project_service, search_result_file_service
from app.db.session import get_session

router = APIRouter(tags=["Search Result Files"])


@router.post(
    "/projects/{project_id}/search-files/",
    response_model=SearchResultFileRead,
    status_code=status.HTTP_201_CREATED,
)
def upload_search_result_file(
    project_id: uuid.UUID,
    file: UploadFile = File(..., description="Archivo de resultados de búsqueda (CSV, RIS, XLS, etc.)"),
    nombre: Optional[str] = Form(default=None, description="Nombre referencial del archivo"),
    database_source: Optional[str] = Form(default=None, description="Base de datos origen (ej. Scopus, WOS, PubMed)"),
    search_equation: Optional[str] = Form(default=None, description="Ecuación de búsqueda empleada"),
    notes: Optional[str] = Form(default=None, description="Anotaciones u observaciones sobre la búsqueda"),
    total_records: Optional[int] = Form(default=None, description="Total de artículos/registros en el archivo"),
    file_type: Optional[str] = Form(default=None, description="Extensión/Formato del archivo (csv, ris, xls)"),
    session: Session = Depends(get_session),
):
    """
    Suba un archivo de resultados de búsqueda (CSV, RIS, XLS) para un proyecto RSL especifico.
    El archivo físico se almacena en la carpeta dinámica app/data/search_results/{primeros_7_caracteres_titulo}_{hex6}/.
    """
    project = rsl_project_service.get_project_by_id(session=session, project_id=project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Proyecto RSL con ID {project_id} no encontrado.",
        )

    return search_result_file_service.save_search_file(
        session=session,
        project=project,
        file=file,
        nombre=nombre,
        database_source=database_source,
        search_equation=search_equation,
        notes=notes,
        total_records=total_records,
        file_type=file_type,
    )


@router.get(
    "/projects/{project_id}/search-files/",
    response_model=List[SearchResultFileRead],
)
def list_project_search_files(
    project_id: uuid.UUID,
    session: Session = Depends(get_session),
):
    """Obtiene la lista de archivos de búsqueda registrados para un proyecto RSL."""
    project = rsl_project_service.get_project_by_id(session=session, project_id=project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Proyecto RSL con ID {project_id} no encontrado.",
        )

    return search_result_file_service.get_files_by_project(session=session, project_id=project_id)


@router.get(
    "/search-files/{file_id}",
    response_model=SearchResultFileRead,
)
def get_search_file(
    file_id: uuid.UUID,
    session: Session = Depends(get_session),
):
    """Obtiene los detalles y metadatos de un archivo de búsqueda por su UUID."""
    db_file = search_result_file_service.get_file_by_id(session=session, file_id=file_id)
    if not db_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Archivo de búsqueda con ID {file_id} no encontrado.",
        )
    return db_file


@router.patch(
    "/search-files/{file_id}",
    response_model=SearchResultFileRead,
)
def update_search_file_metadata(
    file_id: uuid.UUID,
    file_in: SearchResultFileUpdate,
    session: Session = Depends(get_session),
):
    """Actualiza metadatos de un archivo de búsqueda (nombre, base de datos, ecuación, notas)."""
    db_file = search_result_file_service.get_file_by_id(session=session, file_id=file_id)
    if not db_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Archivo de búsqueda con ID {file_id} no encontrado.",
        )
    return search_result_file_service.update_file_metadata(
        session=session, db_file=db_file, file_in=file_in
    )


@router.delete(
    "/search-files/{file_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_search_file(
    file_id: uuid.UUID,
    session: Session = Depends(get_session),
):
    """Elimina el registro en la base de datos y borra el archivo físico del almacenamiento."""
    db_file = search_result_file_service.get_file_by_id(session=session, file_id=file_id)
    if not db_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Archivo de búsqueda con ID {file_id} no encontrado.",
        )
    search_result_file_service.delete_search_file(session=session, db_file=db_file)
