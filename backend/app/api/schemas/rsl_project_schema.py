from datetime import datetime
from typing import Any, Dict, List, Optional
import uuid
from pydantic import BaseModel, Field

from app.api.schemas.author_schema import AuthorRead


class RSLProjectBase(BaseModel):
    """Esquema base con atributos comunes de un Proyecto RSL."""

    title: str = Field(..., min_length=1, description="Título del proyecto RSL")
    variables: Optional[List[str]] = Field(
        default=None, description="Lista de variables o conceptos analizados"
    )
    geographic_scope: Optional[str] = Field(
        default=None, description="Ámbito o espacio geográfico"
    )
    extra_metadata: Optional[Dict[str, Any]] = Field(
        default=None, description="Metadatos adicionales en formato JSON"
    )


class RSLProjectCreate(RSLProjectBase):
    """Esquema para la creación de un Proyecto RSL."""

    author_ids: Optional[List[int]] = Field(
        default=None, description="Lista opcional de IDs de autores a vincular"
    )


class RSLProjectUpdate(BaseModel):
    """Esquema para la actualización parcial (PATCH) de un Proyecto RSL."""

    title: Optional[str] = Field(default=None, min_length=1)
    variables: Optional[List[str]] = None
    geographic_scope: Optional[str] = None
    extra_metadata: Optional[Dict[str, Any]] = None
    author_ids: Optional[List[int]] = Field(
        default=None, description="Lista opcional de IDs de autores para actualizar las asociaciones"
    )


class RSLProjectRead(RSLProjectBase):
    """Esquema de respuesta de lectura básica de un Proyecto RSL."""

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class RSLProjectReadWithAuthors(RSLProjectRead):
    """Esquema de respuesta de lectura de un Proyecto RSL incluyendo sus autores."""

    authors: List[AuthorRead] = []
