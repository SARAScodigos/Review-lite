"""
Modelo de Base de Datos SQLModel para el Módulo de Síntesis y Redacción Científica (Hito 5).
Administra la selección de candidatos por sección, justificante del porqué, tablas estructuradas por objetivo
y borradores científicos redactados por IA con citas integradas.
"""
from datetime import datetime, timezone
from enum import Enum
from typing import TYPE_CHECKING, Any, Dict, List, Optional
import uuid
from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.api.models.rsl_project_model import RSLProject


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class SynthesisSectionType(str, Enum):
    """Tipos de secciones estándar en un reporte final de Revisión Sistemática de la Literatura."""

    INTRODUCTION = "INTRODUCTION"
    THEORETICAL_FRAMEWORK = "THEORETICAL_FRAMEWORK"
    RESULTS_OBJECTIVE = "RESULTS_OBJECTIVE"
    METHODOLOGY_PRISMA = "METHODOLOGY_PRISMA"
    DISCUSSION = "DISCUSSION"
    CONCLUSIONS = "CONCLUSIONS"

class StatusWriting (str, Enum):
    """Estados en los que se puede encontrar la redaccion de una seccion del articulo"""
    SELECTING_IDS="SELECTING_IDS"
    TRIMER_COLUMNS="TRIMER_COLUMNS"
    WRITING_BY_AI="WRITING_BY_AI"
    ERROR="ERROR"
    PENDING="PENDING"
    COMPLETED="COMPLETED"



class RSLSynthesisSection(SQLModel, table=True):
    """
    Entidad que administra una sección o capítulo del informe de síntesis RSL.
    Guarda los artículos candidatos seleccionados por el modelo rápido, sus justificaciones,
    las tablas sintetizadas y el texto borrador final con citas generado por el modelo potente.
    """

    __tablename__ = "rsl_synthesis_sections"

    # Clave primaria UUID v4 única de la sección de síntesis
    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        nullable=False,
        description="Identificador único UUID v4 de la sección de síntesis",
    )

    # ID del proyecto RSL al que pertenece esta sección (Clave foránea con borrado en cascada)
    project_id: uuid.UUID = Field(
        foreign_key="rsl_projects.id",
        nullable=False,
        ondelete="CASCADE",
        index=True,
        description="ID del proyecto RSL al que pertenece esta sección",
    )

    # Tipo de sección de la RSL (INTRODUCTION, THEORETICAL_FRAMEWORK, RESEARCH_OBJECTIVE, etc.)
    section_type: SynthesisSectionType = Field(
        default=SynthesisSectionType.INTRODUCTION,
        index=True,
        description="Tipo de capítulo o sección RSL",
    )

    status_writing: StatusWriting = Field (
        default=StatusWriting.PENDING,
        nullable=False,
        description="Estado en el que la redaccion de una seccion de encuentra"
    )

    # Título personalizado para objetivos específicos (ej. 'Líneas temáticas de investigación', 'Aplicaciones por sector')
    objective_title: Optional[str] = Field(
        default=None,
        description="Título descriptivo del objetivo de investigación específico (si aplica)",
    )

    # Descripción o metas del objetivo escritas por el investigador para guiar el análisis
    objective_description: Optional[str] = Field(
        default=None,
        description="Detalle o meta de investigación definida por el usuario para esta sección",
    )

    # Índice entero para definir la secuencia y orden del capítulo en el reporte final (1, 2, 3...)
    order_index: int = Field(
        default=1,
        index=True,
        description="Posición y orden numérico de la sección dentro del documento final",
    )

    # Lista de IDs compuestos de artículos seleccionados por el modelo rápido como candidatos ideales (ej. ['DEEP_PINT', 'ART1_GARC'])
    candidate_article_ids: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default="[]"),
        description="Lista de IDs compuestos de los artículos seleccionados como mejores candidatos",
    )

    # Diccionario JSONB que mapea el ID del artículo con la columna explicativa del porqué fue seleccionado por la IA
    # Ejemplo: {"DEEP_PINT": "Aporta métricas empíricas sobre consumo energético en hospitales."}
    selection_justifications: Dict[str, str] = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False, server_default="{}"),
        description="Mapa JSONB con el ID del artículo y la razón justificada de su selección",
    )

    # Nombres de las columnas de la matriz utilizadas en esta sección para recortar el envío y ahorrar tokens
    # Ejemplo: ["ID", "Título", "Objetivos generales", "Metodología"]
    trimmed_columns_used: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default="[]"),
        description="Lista de columnas de la matriz utilizadas excluyendo abstract y metadatos innecesarios",
    )

    # Objeto JSONB con la tabla estructurada sintetizada para este objetivo de investigación
    generated_table: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False, server_default="{}"),
        description="Estructura JSONB con la tabla sintética del objetivo",
    )

    # Borrador de texto en markdown redactado por el modelo potente con citas bibliográficas en texto
    generated_draft: Optional[str] = Field(
        default=None,
        description="Texto redactado con rigor científico e integración de citas por el modelo potente",
    )

    # Instrucciones o reglas de redacción personalizadas proporcionadas por el investigador para adaptar el estilo
    custom_prompt_instructions: Optional[str] = Field(
        default=None,
        description="Reglas o guías de redacción adicionales especificadas manualmente por el usuario",
    )

    # Bandera booleana que indica si el investigador revisó y aprobó la versión final de la sección
    is_confirmed: bool = Field(
        default=False,
        description="Indica si la sección fue revisada y confirmada manualmente por el investigador",
    )

    # Fecha y hora de creación del registro en UTC
    created_at: datetime = Field(default_factory=utc_now, nullable=False)

    # Fecha y hora de última modificación del registro en UTC
    updated_at: datetime = Field(default_factory=utc_now, sa_column_kwargs={"onupdate": utc_now}, nullable=False)

    # Relación de SQLModel con el proyecto RSL
    project: Optional["RSLProject"] = Relationship()
