"""
Esquemas Pydantic para el módulo de Exportación e Historial de Versiones del Manuscrito Word (.docx).
"""
from datetime import datetime
from typing import Optional
import uuid
from pydantic import BaseModel, ConfigDict

from app.api.models.rsl_export_model import ExportStatus


class RSLExportVersionRead(BaseModel):
    """DTO de lectura para presentar una versión de exportación del manuscrito RSL."""

    id: uuid.UUID
    project_id: uuid.UUID
    version_number: int
    version_label: str
    file_name: str
    file_size_bytes: Optional[int] = None
    sha256_checksum: Optional[str] = None
    export_status: ExportStatus
    error_message: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
