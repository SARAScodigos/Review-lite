from datetime import datetime, timezone
from enum import Enum
from typing import TYPE_CHECKING, List, Optional
import uuid
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.api.models.extracted_record_model import ExtractedRecord
    from app.api.models.rsl_project_model import RSLProject


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ProcessStatus(str, Enum):
    IDLE = "IDLE"
    PROCESSING_DUPLICATES = "PROCESSING_DUPLICATES"
    AWAITING_DUPLICATE_REVIEW = "AWAITING_DUPLICATE_REVIEW"
    PROCESSING_TITLE = "PROCESSING_TITLE"
    PROCESSING_ABSTRACT = "PROCESSING_ABSTRACT"
    COMPLETED = "COMPLETED"
    ERROR = "ERROR"


class ScreeningDecisionEnum(str, Enum):
    PENDING = "PENDING"
    EVALUATING = "EVALUATING"
    INCLUDED = "INCLUDED"
    EXCLUDED = "EXCLUDED"
    MAYBE = "MAYBE"


class DuplicateReviewStatus(str, Enum):
    NOT_APPLICABLE = "NOT_APPLICABLE"
    AUTO_CONFIRMED = "AUTO_CONFIRMED"
    PENDING_HUMAN_REVIEW = "PENDING_HUMAN_REVIEW"
    HUMAN_RESOLVED_DUPLICATE = "HUMAN_RESOLVED_DUPLICATE"
    HUMAN_RESOLVED_UNIQUE = "HUMAN_RESOLVED_UNIQUE"


class ScreeningSession(SQLModel, table=True):
    """Modelo para la Sesión de Cribado Global de un Proyecto RSL (Métricas para Diagrama PRISMA)."""

    __tablename__ = "screening_sessions"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        nullable=False,
        description="Identificador único de la sesión de cribado",
    )
    project_id: uuid.UUID = Field(
        foreign_key="rsl_projects.id",
        nullable=False,
        unique=True,
        ondelete="CASCADE",
        index=True,
        description="ID del proyecto RSL evaluado",
    )
    status: ProcessStatus = Field(
        default=ProcessStatus.IDLE,
        description="Estado actual del proceso ejecutado por Celery/IA",
    )
    error_message: Optional[str] = Field(
        default=None,
        description="Detalle de error si el proceso de Celery/IA falla",
    )
    celery_task_id: Optional[str] = Field(
        default=None,
        description="ID único de la tarea asíncrona de Celery en ejecución para permitir su cancelación",
    )

    # Métricas agregadas para el Diagrama de PRISMA
    total_initial_records: int = Field(default=0, description="Registros totales extraídos inicialmente")
    duplicate_records_count: int = Field(default=0, description="Total de registros identificados como duplicados")
    unique_records_count: int = Field(default=0, description="Total de registros únicos tras eliminación de duplicados")
    title_included_count: int = Field(default=0, description="Registros incluidos tras cribado de título")
    title_excluded_count: int = Field(default=0, description="Registros excluidos tras cribado de título")
    abstract_included_count: int = Field(default=0, description="Registros incluidos tras cribado de abstract")
    abstract_excluded_count: int = Field(default=0, description="Registros excluidos tras cribado de abstract")
    fulltext_included_count: int = Field(default=0, description="Registros finales incluidos tras texto completo")
    fulltext_excluded_count: int = Field(default=0, description="Registros excluidos tras texto completo")

    created_at: datetime = Field(default_factory=utc_now, nullable=False)
    updated_at: datetime = Field(default_factory=utc_now, sa_column_kwargs={"onupdate": utc_now}, nullable=False)

    # Relación a RSLProject
    project: Optional["RSLProject"] = Relationship(back_populates="screening_session")

    # Relación a decisiones de detalle
    decisions: List["ScreeningDecision"] = Relationship(
        back_populates="session",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class ScreeningDecision(SQLModel, table=True):
    """Modelo de Detalle con la trazabilidad y decisión de cribado por cada artículo/registro."""

    __tablename__ = "screening_decisions"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        nullable=False,
    )
    screening_session_id: uuid.UUID = Field(
        foreign_key="screening_sessions.id",
        nullable=False,
        ondelete="CASCADE",
        index=True,
    )
    record_id: uuid.UUID = Field(
        foreign_key="extracted_records.id",
        nullable=False,
        ondelete="CASCADE",
        index=True,
    )

    # Fase 1: Duplicados y Clusters
    is_duplicate: bool = Field(default=False, index=True)
    duplicate_of_id: Optional[uuid.UUID] = Field(
        default=None,
        foreign_key="extracted_records.id",
        description="ID del registro original del cual este artículo es duplicado",
    )
    duplicate_cluster_id: Optional[str] = Field(
        default=None,
        index=True,
        description="Identificador del grupo/cluster de duplicados en conflicto (UUID de cluster)",
    )
    similarity_score: Optional[float] = Field(
        default=None,
        description="Puntaje o grado de similitud entre 0.0 y 1.0 (o 0% a 100%)",
    )
    match_reason: Optional[str] = Field(
        default=None,
        description="Razón de detección de duplicado (ej. EXACT_DOI, EXACT_TITLE, FUZZY_TITLE_AUTHOR)",
    )
    duplicate_review_status: DuplicateReviewStatus = Field(
        default=DuplicateReviewStatus.NOT_APPLICABLE,
        index=True,
        description="Estado de la revisión de duplicado (AUTO_CONFIRMED, PENDING_HUMAN_REVIEW, etc.)",
    )

    # Fase 2: Cribado por Título
    title_status: ScreeningDecisionEnum = Field(default=ScreeningDecisionEnum.PENDING, index=True)
    title_reason: Optional[str] = Field(default=None, description="Razonamiento o justificación (IA / Humano)")

    # Fase 3: Cribado por Abstract
    abstract_status: ScreeningDecisionEnum = Field(default=ScreeningDecisionEnum.PENDING, index=True)
    abstract_reason: Optional[str] = Field(default=None, description="Razonamiento o justificación (IA / Humano)")

    # Fase 4: Texto Completo
    fulltext_status: ScreeningDecisionEnum = Field(default=ScreeningDecisionEnum.PENDING, index=True)
    fulltext_reason: Optional[str] = Field(default=None, description="Razonamiento o justificación (IA / Humano)")

    # Decisión Final
    final_decision: ScreeningDecisionEnum = Field(default=ScreeningDecisionEnum.PENDING, index=True)

    created_at: datetime = Field(default_factory=utc_now, nullable=False)
    updated_at: datetime = Field(default_factory=utc_now, sa_column_kwargs={"onupdate": utc_now}, nullable=False)

    # Relaciones
    session: Optional[ScreeningSession] = Relationship(back_populates="decisions")
    record: Optional["ExtractedRecord"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[ScreeningDecision.record_id]"}
    )
    duplicate_of: Optional["ExtractedRecord"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[ScreeningDecision.duplicate_of_id]"}
    )
