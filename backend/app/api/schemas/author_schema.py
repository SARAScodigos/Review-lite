from datetime import datetime
from typing import TYPE_CHECKING, List, Optional
from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from app.api.schemas.rsl_project_schema import RSLProjectRead


class AuthorBase(BaseModel):
    """Esquema base con atributos comunes de un Autor."""

    first_name: str = Field(..., min_length=1, description="Nombres del autor")
    last_name: str = Field(..., min_length=1, description="Apellidos del autor")
    orcid: Optional[str] = Field(default=None, description="Código ORCID")
    university_affiliation: Optional[str] = Field(
        default=None, description="Afiliación universitaria"
    )
    institutional_email: Optional[str] = Field(
        default=None, description="Correo institucional"
    )
    address: Optional[str] = Field(default=None, description="Dirección de contacto")
    dni: Optional[str] = Field(default=None, description="DNI / Cédula")
    signature_url: Optional[str] = Field(
        default=None,
        description=(
            "Ruta del archivo de firma guardado por el backend. El frontend no debe "
            "enviar este campo al crear/editar; debe enviar signature_file como "
            "multipart/form-data."
        ),
    )


class AuthorCreate(AuthorBase):
    """
    Esquema interno para la creación de un Autor.

    Documentación frontend:
    - POST /authors/ recibe multipart/form-data, no JSON.
    - Enviar los campos de texto de AuthorBase como partes Form.
    - Enviar la firma en la parte signature_file. Puede ser imagen, PDF u otro documento.
    - La respuesta devuelve signature_url con la ruta donde quedó almacenado el archivo.
    """

    pass


class AuthorUpdate(BaseModel):
    """
    Esquema interno para la actualización parcial (PATCH) de un Autor.

    Documentación frontend:
    - PATCH /authors/{author_id} recibe multipart/form-data cuando se envía firma.
    - Todos los campos son opcionales; enviar solo los que cambian.
    - Enviar signature_file para reemplazar la firma actual.
    - No enviar signature_url; ese valor lo calcula y retorna el backend.
    """

    first_name: Optional[str] = Field(default=None, min_length=1)
    last_name: Optional[str] = Field(default=None, min_length=1)
    orcid: Optional[str] = None
    university_affiliation: Optional[str] = None
    institutional_email: Optional[str] = None
    address: Optional[str] = None
    dni: Optional[str] = None
    signature_url: Optional[str] = Field(
        default=None,
        description=(
            "Ruta generada por el backend. No se debe enviar desde el frontend; "
            "usar signature_file en multipart/form-data."
        ),
    )


class AuthorRead(AuthorBase):
    """
    Esquema de respuesta de lectura de un Autor.

    Documentación frontend:
    - signature_url llega como string o null.
    - Si existe, apunta al archivo físico guardado en app/data/signatures/{nombre_autor}/.
    - Para descargar o visualizar la firma, usar GET /authors/{author_id}/signature/file.
    """

    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AuthorReadWithProjects(AuthorRead):
    """Esquema de respuesta de lectura de un Autor incluyendo sus proyectos."""

    projects: List["RSLProjectRead"] = []
