from datetime import datetime, timezone
import os
from typing import List, Optional
import uuid
from sqlalchemy import func, insert
from sqlmodel import Session, select

from app.config import settings
from app.api.models.extracted_record_model import ExtractedRecord
from app.api.models.search_result_file_model import SearchResultFile
from app.api.services.parsers import FileParserFactory, normalize_record


def _resolve_search_result_file_path(file_path: str) -> str:
    """
    Resolve legacy absolute paths saved by another runtime.

    Local FastAPI stores files under the host project path, while Docker sees the
    same mounted directory under /app. The database may contain either absolute
    form, so derive the path relative to app/data/search_results when needed.
    """
    if os.path.exists(file_path):
        return file_path

    marker = os.path.join("app", "data", "search_results") + os.sep
    normalized = file_path.replace("\\", os.sep)
    if marker in normalized:
        relative_path = normalized.split(marker, 1)[1]
        candidate = os.path.join(settings.SEARCH_RESULTS_DIR, relative_path)
        if os.path.exists(candidate):
            return candidate

    raise FileNotFoundError(f"No existe el archivo de búsqueda en {file_path}")


def extract_and_store_file_records(session: Session, file_id: uuid.UUID) -> int:
    """
    Lee el archivo físico guardado en disco asociado a `file_id`, utiliza la minifábrica de parsers
    para procesar las filas, normaliza las columnas y realiza una inserción masiva (bulk insert)
    en la tabla `extracted_records`.
    """
    search_file = session.get(SearchResultFile, file_id)
    if not search_file:
        raise ValueError(f"Archivo con ID {file_id} no encontrado.")

    ext = search_file.file_type or search_file.file_path.rsplit(".", 1)[-1]
    parser = FileParserFactory.get_parser(ext)

    file_path = _resolve_search_result_file_path(search_file.file_path)
    rows = parser.parse(file_path)
    if not rows:
        return 0

    now = datetime.now(timezone.utc)
    records_to_insert = []

    for row in rows:
        norm_fields, raw_data = normalize_record(row)
        record_dict = {
            "id": uuid.uuid4(),
            "file_id": search_file.id,
            "title": norm_fields["title"],
            "authors": norm_fields["authors"],
            "publication_year": norm_fields["publication_year"],
            "doi": norm_fields["doi"],
            "source_title": norm_fields["source_title"],
            "abstract": norm_fields["abstract"],
            "raw_data": raw_data,
            "created_at": now,
            "updated_at": now,
        }
        records_to_insert.append(record_dict)

    # Inserción masiva optimizada (Bulk Insert) en fragmentos de 2000 filas
    chunk_size = 2000
    for i in range(0, len(records_to_insert), chunk_size):
        chunk = records_to_insert[i : i + chunk_size]
        session.exec(insert(ExtractedRecord).values(chunk))

    # Actualizar la cuenta total de registros en el archivo de búsqueda
    search_file.total_records = len(records_to_insert)
    session.add(search_file)
    session.commit()

    return len(records_to_insert)


def get_records_by_file(
    session: Session, file_id: uuid.UUID, skip: int = 0, limit: int = 100
) -> List[ExtractedRecord]:
    """Obtiene una lista paginada de registros extraídos de un archivo específico."""
    statement = select(ExtractedRecord).where(ExtractedRecord.file_id == file_id).offset(skip).limit(limit)
    return list(session.exec(statement).all())


def count_records_by_file(session: Session, file_id: uuid.UUID) -> int:
    """Cuenta el total de registros extraídos de un archivo específico."""
    statement = select(func.count()).select_from(ExtractedRecord).where(ExtractedRecord.file_id == file_id)
    return int(session.exec(statement).one())


def get_record_by_id(
    session: Session, record_id: uuid.UUID
) -> Optional[ExtractedRecord]:
    """Obtiene un registro extraído individual por su UUID."""
    return session.get(ExtractedRecord, record_id)
