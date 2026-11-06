from datetime import datetime
from typing import Optional
import uuid
from pydantic import BaseModel, Field


class SearchResultFileBase(BaseModel):
    """Esquema base con metadatos del archivo de búsqueda."""

    nombre: str = Field(..., min_length=1, description="Nombre referencial del archivo")
    database_source: Optional[str] = Field(
        default=None, description="Base de datos científica origen (Scopus, WOS, etc.)"
    )
    search_equation: Optional[str] = Field(
        default=None, description="Ecuación de búsqueda ejecutada"
    )
    notes: Optional[str] = Field(
        default=None, description="Anotaciones u observaciones"
    )
    total_records: Optional[int] = Field(
        default=None, description="Total de registros/artículos reportados"
    )
    file_type: Optional[str] = Field(
        default=None, description="Formato o extensión del archivo (csv, ris, xls)"
    )


class SearchResultFileRead(SearchResultFileBase):
    """Esquema de respuesta al leer los metadatos de un archivo registrado."""

    id: uuid.UUID
    project_id: uuid.UUID
    file_path: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SearchResultFileUpdate(BaseModel):
    """Esquema para actualizar únicamente metadatos del archivo registrado."""

    nombre: Optional[str] = Field(default=None, min_length=1)
    database_source: Optional[str] = None
    search_equation: Optional[str] = None
    notes: Optional[str] = None
    total_records: Optional[int] = None
    file_type: Optional[str] = None
