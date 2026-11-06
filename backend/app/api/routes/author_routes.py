import mimetypes
import os
from typing import List

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlmodel import Session

from app.api.schemas.author_schema import (
    AuthorCreate,
    AuthorRead,
    AuthorReadWithProjects,
    AuthorUpdate,
)
from app.api.services import author_service
from app.db.session import get_session

router = APIRouter(prefix="/authors", tags=["Authors"])


@router.post("/", response_model=AuthorRead, status_code=status.HTTP_201_CREATED)
def create_author(
    first_name: str = Form(..., min_length=1, description="Nombres del autor"),
    last_name: str = Form(..., min_length=1, description="Apellidos del autor"),
    orcid: str | None = Form(default=None, description="Código ORCID"),
    university_affiliation: str | None = Form(
        default=None, description="Afiliación universitaria"
    ),
    institutional_email: str | None = Form(
        default=None, description="Correo institucional"
    ),
    address: str | None = Form(default=None, description="Dirección de contacto"),
    dni: str | None = Form(default=None, description="DNI / Cédula"),
    signature_file: UploadFile | None = File(
        default=None,
        description=(
            "Archivo de firma del autor. Enviar como multipart/form-data; "
            "puede ser imagen, PDF u otro documento."
        ),
    ),
    session: Session = Depends(get_session),
):
    """
    Crea un nuevo Autor en el sistema.
    Debe recibirse como multipart/form-data para permitir subir signature_file.
    """
    author_in = AuthorCreate(
        first_name=first_name,
        last_name=last_name,
        orcid=orcid,
        university_affiliation=university_affiliation,
        institutional_email=institutional_email,
        address=address,
        dni=dni,
    )
    return author_service.create_author(
        session=session, author_in=author_in, signature_file=signature_file
    )


@router.get("/", response_model=List[AuthorRead])
def list_authors(
    skip: int = Query(default=0, ge=0, description="Registros a omitir"),
    limit: int = Query(default=100, ge=1, le=500, description="Límite por página"),
    session: Session = Depends(get_session),
):
    """Obtiene el listado paginado de Autores."""
    return author_service.get_authors(session=session, skip=skip, limit=limit)


@router.get("/{author_id}", response_model=AuthorReadWithProjects)
def get_author(
    author_id: int,
    session: Session = Depends(get_session),
):
    """Obtiene los detalles de un Autor por su ID, incluyendo sus proyectos asociados."""
    author = author_service.get_author_by_id(session=session, author_id=author_id)
    if not author:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Autor con ID {author_id} no encontrado.",
        )
    return author


@router.get("/{author_id}/signature/file")
def get_author_signature_file(
    author_id: int,
    session: Session = Depends(get_session),
):
    """
    Descarga o visualiza el archivo de firma del Autor.
    Usa el signature_url devuelto por AuthorRead como referencia interna del backend.
    """
    author = author_service.get_author_by_id(session=session, author_id=author_id)
    if not author:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Autor con ID {author_id} no encontrado.",
        )

    if not author.signature_url or not os.path.exists(author.signature_url):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El archivo de firma no se encuentra almacenado en el servidor.",
        )

    media_type, _ = mimetypes.guess_type(author.signature_url)
    return FileResponse(
        path=author.signature_url,
        media_type=media_type or "application/octet-stream",
        filename=os.path.basename(author.signature_url),
    )


@router.patch("/{author_id}", response_model=AuthorRead)
def update_author(
    author_id: int,
    first_name: str | None = Form(default=None, min_length=1),
    last_name: str | None = Form(default=None, min_length=1),
    orcid: str | None = Form(default=None),
    university_affiliation: str | None = Form(default=None),
    institutional_email: str | None = Form(default=None),
    address: str | None = Form(default=None),
    dni: str | None = Form(default=None),
    signature_file: UploadFile | None = File(
        default=None,
        description=(
            "Nuevo archivo de firma. Si se envía, reemplaza la ruta signature_url "
            "almacenada para el autor."
        ),
    ),
    session: Session = Depends(get_session),
):
    """
    Actualiza parcialmente la información de un Autor existente.
    Debe recibirse como multipart/form-data si se actualiza la firma.
    """
    db_author = author_service.get_author_by_id(session=session, author_id=author_id)
    if not db_author:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Autor con ID {author_id} no encontrado.",
        )
    update_payload = {
        key: value
        for key, value in {
            "first_name": first_name,
            "last_name": last_name,
            "orcid": orcid,
            "university_affiliation": university_affiliation,
            "institutional_email": institutional_email,
            "address": address,
            "dni": dni,
        }.items()
        if value is not None
    }
    author_in = AuthorUpdate(**update_payload)
    return author_service.update_author(
        session=session,
        db_author=db_author,
        author_in=author_in,
        signature_file=signature_file,
    )


@router.delete("/{author_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_author(
    author_id: int,
    session: Session = Depends(get_session),
):
    """Elimina un Autor por su ID."""
    db_author = author_service.get_author_by_id(session=session, author_id=author_id)
    if not db_author:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Autor con ID {author_id} no encontrado.",
        )
    author_service.delete_author(session=session, db_author=db_author)
