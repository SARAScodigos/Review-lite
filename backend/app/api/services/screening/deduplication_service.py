import difflib
from io import BytesIO
import re
from typing import Dict, List, Optional, Set, Tuple
import uuid

from fastapi import HTTPException, status
import pandas as pd
from sqlalchemy import func
from sqlmodel import Session, select

from app.api.models.extracted_record_model import ExtractedRecord
from app.api.models.rsl_project_model import RSLProject
from app.api.models.search_result_file_model import SearchResultFile
from app.api.models.screening_model import (
    DuplicateReviewStatus,
    ProcessStatus,
    ScreeningDecision,
    ScreeningSession,
)
from app.api.schemas.screening_schema import (
    DuplicateClusterRead,
    DuplicateRecordDetail,
    RecordSourceFileSchema,
)
from app.api.schemas.screening.deduplication_schema import (
    DeduplicationSourceBreakdown,
    DeduplicationSummaryResponse,
    PaginatedUniqueRecordsResponse,
    UniqueRecordRead,
)


def normalize_doi(doi: Optional[str]) -> Optional[str]:
    """Normaliza un DOI para comparación exacta."""
    if not doi:
        return None
    clean = doi.strip().lower()
    clean = re.sub(r"^https?://(dx\.)?doi\.org/", "", clean)
    clean = re.sub(r"^doi:", "", clean)
    return clean.strip() or None


def normalize_title(title: Optional[str]) -> str:
    """Normaliza un título eliminando puntuación, espacios extra y convirtiendo a minúsculas."""
    if not title:
        return ""
    clean = title.strip().lower()
    clean = re.sub(r"[^\w\s]", "", clean)
    clean = re.sub(r"\s+", " ", clean)
    return clean.strip()


def calculate_similarity(t1: str, t2: str) -> float:
    """Calcula el porcentaje de similitud entre dos títulos usando SequenceMatcher."""
    if not t1 or not t2:
        return 0.0
    if t1 == t2:
        return 1.0
    return difflib.SequenceMatcher(None, t1, t2).ratio()


def get_or_create_screening_session(db: Session, project_id: uuid.UUID) -> ScreeningSession:
    """Obtiene la sesión de cribado de un proyecto RSL, o la crea si aún no existe."""
    project = db.get(RSLProject, project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"El proyecto RSL con ID '{project_id}' no existe.",
        )

    statement = select(ScreeningSession).where(ScreeningSession.project_id == project_id)
    screening_session = db.exec(statement).first()

    # Contar total de registros iniciales extraídos
    records_statement = (
        select(ExtractedRecord)
        .join(SearchResultFile)
        .where(SearchResultFile.project_id == project_id)
    )
    total_records = len(db.exec(records_statement).all())

    if not screening_session:
        screening_session = ScreeningSession(
            project_id=project_id,
            status=ProcessStatus.IDLE,
            total_initial_records=total_records,
            unique_records_count=total_records,
        )
        db.add(screening_session)
        db.commit()
        db.refresh(screening_session)
    else:
        # Mantener actualizado total_initial_records
        screening_session.total_initial_records = total_records
        db.add(screening_session)
        db.commit()
        db.refresh(screening_session)

    return screening_session


class UnionFind:
    """Estructura de datos Disjoint-Set para agrupar elementos en clusters por componentes conexas."""

    def __init__(self, elements: List[uuid.UUID]):
        self.parent: Dict[uuid.UUID, uuid.UUID] = {e: e for e in elements}

    def find(self, i: uuid.UUID) -> uuid.UUID:
        if self.parent[i] == i:
            return i
        self.parent[i] = self.find(self.parent[i])
        return self.parent[i]

    def union(self, i: uuid.UUID, j: uuid.UUID):
        root_i = self.find(i)
        root_j = self.find(j)
        if root_i != root_j:
            self.parent[root_i] = root_j


def run_deduplication_pipeline(db: Session, project_id: uuid.UUID, force_rerun: bool = False) -> ScreeningSession:
    """
    Ejecuta el pipeline de desduplicación por clusters (DOI exacto, Título exacto y Similitud difusa).
    Actualiza la base de datos de manera persistente.
    """
    screening_session = get_or_create_screening_session(db, project_id)

    # 1. Obtener todos los registros extraídos del proyecto
    records_statement = (
        select(ExtractedRecord)
        .join(SearchResultFile)
        .where(SearchResultFile.project_id == project_id)
    )
    records = db.exec(records_statement).all()

    if not records:
        screening_session.status = ProcessStatus.COMPLETED
        screening_session.duplicate_records_count = 0
        screening_session.unique_records_count = 0
        db.add(screening_session)
        db.commit()
        db.refresh(screening_session)
        return screening_session

    screening_session.status = ProcessStatus.PROCESSING_DUPLICATES
    screening_session.error_message = None
    db.add(screening_session)
    db.commit()

    # Mapa de decisiones existentes por record_id
    decisions_statement = select(ScreeningDecision).where(
        ScreeningDecision.screening_session_id == screening_session.id
    )
    existing_decisions = {d.record_id: d for d in db.exec(decisions_statement).all()}

    # Si ya se ejecutó desduplicación previa y no es force_rerun
    if existing_decisions and not force_rerun:
        pending = [d for d in existing_decisions.values() if d.duplicate_review_status == DuplicateReviewStatus.PENDING_HUMAN_REVIEW]
        if pending:
            screening_session.status = ProcessStatus.AWAITING_DUPLICATE_REVIEW
            db.add(screening_session)
            db.commit()
            db.refresh(screening_session)
            return screening_session

    # 2. Inicializar UnionFind
    record_ids = [r.id for r in records]
    uf = UnionFind(record_ids)

    match_metadata: Dict[Tuple[uuid.UUID, uuid.UUID], Tuple[float, str]] = {}

    # Nivel 1: Agrupar por DOI exacto
    doi_map: Dict[str, List[ExtractedRecord]] = {}
    for r in records:
        norm_doi = normalize_doi(r.doi)
        if norm_doi:
            doi_map.setdefault(norm_doi, []).append(r)

    for doi, group in doi_map.items():
        if len(group) > 1:
            first = group[0]
            for other in group[1:]:
                uf.union(first.id, other.id)
                match_metadata[(first.id, other.id)] = (1.0, "EXACT_DOI")

    # Nivel 2: Agrupar por Título exacto normalizado
    title_map: Dict[str, List[ExtractedRecord]] = {}
    for r in records:
        norm_t = normalize_title(r.title)
        if norm_t and len(norm_t) > 5:
            title_map.setdefault(norm_t, []).append(r)

    for t, group in title_map.items():
        if len(group) > 1:
            first = group[0]
            for other in group[1:]:
                uf.union(first.id, other.id)
                if (first.id, other.id) not in match_metadata:
                    match_metadata[(first.id, other.id)] = (1.0, "EXACT_TITLE")

    # Nivel 3: Comparación Difusa de Títulos
    prefix_map: Dict[str, List[ExtractedRecord]] = {}
    for r in records:
        norm_t = normalize_title(r.title)
        if norm_t:
            prefix = norm_t[:10]
            prefix_map.setdefault(prefix, []).append(r)

    for prefix, candidates in prefix_map.items():
        if len(candidates) > 1:
            for i in range(len(candidates)):
                for j in range(i + 1, len(candidates)):
                    r1 = candidates[i]
                    r2 = candidates[j]
                    if uf.find(r1.id) == uf.find(r2.id):
                        continue
                    t1 = normalize_title(r1.title)
                    t2 = normalize_title(r2.title)
                    sim = calculate_similarity(t1, t2)
                    if sim >= 0.75:
                        uf.union(r1.id, r2.id)
                        match_metadata[(r1.id, r2.id)] = (sim, "FUZZY_TITLE_MATCH")

    # 3. Construir Clusters finales
    clusters_dict: Dict[uuid.UUID, List[ExtractedRecord]] = {}
    for r in records:
        root = uf.find(r.id)
        clusters_dict.setdefault(root, []).append(r)

    # 4. Procesar y guardar decisiones por cluster
    has_pending_human_review = False

    for root_id, cluster_records in clusters_dict.items():
        if len(cluster_records) == 1:
            # Registro Único sin duplicados
            r = cluster_records[0]
            decision = existing_decisions.get(r.id)
            if not decision:
                decision = ScreeningDecision(
                    screening_session_id=screening_session.id,
                    record_id=r.id,
                )
            decision.is_duplicate = False
            decision.duplicate_of_id = None
            decision.duplicate_cluster_id = None
            decision.similarity_score = None
            decision.match_reason = None
            decision.duplicate_review_status = DuplicateReviewStatus.NOT_APPLICABLE
            db.add(decision)
        else:
            # Cluster de 2 o más registros duplicados/sospechosos
            cluster_id = f"cluster-{uuid.uuid4()}"
            
            max_score = 1.0
            reason = "EXACT_MATCH"
            for i in range(len(cluster_records)):
                for j in range(i + 1, len(cluster_records)):
                    p1, p2 = cluster_records[i].id, cluster_records[j].id
                    meta = match_metadata.get((p1, p2)) or match_metadata.get((p2, p1))
                    if meta:
                        max_score = max(max_score, meta[0])
                        reason = meta[1]

            sorted_records = sorted(
                cluster_records,
                key=lambda rec: (
                    bool(rec.abstract),
                    bool(rec.doi),
                    bool(rec.publication_year),
                ),
                reverse=True,
            )
            candidate_master = sorted_records[0]

            if max_score >= 0.95:
                for r in cluster_records:
                    decision = existing_decisions.get(r.id)
                    if not decision:
                        decision = ScreeningDecision(
                            screening_session_id=screening_session.id,
                            record_id=r.id,
                        )
                    decision.duplicate_cluster_id = cluster_id
                    decision.similarity_score = max_score
                    decision.match_reason = reason
                    
                    if r.id == candidate_master.id:
                        decision.is_duplicate = False
                        decision.duplicate_of_id = None
                        decision.duplicate_review_status = DuplicateReviewStatus.AUTO_CONFIRMED
                    else:
                        decision.is_duplicate = True
                        decision.duplicate_of_id = candidate_master.id
                        decision.duplicate_review_status = DuplicateReviewStatus.AUTO_CONFIRMED
                    db.add(decision)
            else:
                has_pending_human_review = True
                for r in cluster_records:
                    decision = existing_decisions.get(r.id)
                    if not decision:
                        decision = ScreeningDecision(
                            screening_session_id=screening_session.id,
                            record_id=r.id,
                        )
                    decision.duplicate_cluster_id = cluster_id
                    decision.similarity_score = max_score
                    decision.match_reason = reason
                    decision.is_duplicate = False
                    decision.duplicate_of_id = None
                    decision.duplicate_review_status = DuplicateReviewStatus.PENDING_HUMAN_REVIEW
                    db.add(decision)

    db.commit()

    total_duplicates = len(
        db.exec(
            select(ScreeningDecision)
            .where(ScreeningDecision.screening_session_id == screening_session.id)
            .where(ScreeningDecision.is_duplicate == True)
        ).all()
    )
    screening_session.duplicate_records_count = total_duplicates
    screening_session.unique_records_count = screening_session.total_initial_records - total_duplicates

    if has_pending_human_review:
        screening_session.status = ProcessStatus.AWAITING_DUPLICATE_REVIEW
    else:
        screening_session.status = ProcessStatus.IDLE

    db.add(screening_session)
    db.commit()
    db.refresh(screening_session)

    return screening_session


def get_pending_duplicate_clusters(db: Session, project_id: uuid.UUID) -> List[DuplicateClusterRead]:
    """Obtiene todos los clusters de duplicados que están en espera de revisión humana para la UI."""
    screening_session = get_or_create_screening_session(db, project_id)

    statement = (
        select(ScreeningDecision)
        .where(ScreeningDecision.screening_session_id == screening_session.id)
        .where(ScreeningDecision.duplicate_review_status == DuplicateReviewStatus.PENDING_HUMAN_REVIEW)
    )
    pending_decisions = db.exec(statement).all()

    if not pending_decisions:
        return []

    clusters_map: Dict[str, List[ScreeningDecision]] = {}
    for d in pending_decisions:
        if d.duplicate_cluster_id:
            clusters_map.setdefault(d.duplicate_cluster_id, []).append(d)

    result: List[DuplicateClusterRead] = []

    for cluster_id, decisions in clusters_map.items():
        records_detail: List[DuplicateRecordDetail] = []
        score = decisions[0].similarity_score or 0.0
        reason = decisions[0].match_reason or "FUZZY_MATCH"

        for d in decisions:
            rec = d.record
            if not rec:
                rec = db.get(ExtractedRecord, d.record_id)
            if not rec:
                continue

            file_info = db.get(SearchResultFile, rec.file_id)
            source_schema = RecordSourceFileSchema(
                file_id=rec.file_id,
                file_name=file_info.nombre if file_info else "Archivo desconocido",
                database_source=file_info.database_source if file_info else None,
            )

            detail = DuplicateRecordDetail(
                record_id=rec.id,
                title=rec.title,
                doi=rec.doi,
                authors=rec.authors,
                publication_year=rec.publication_year,
                source_title=rec.source_title,
                abstract=rec.abstract,
                has_abstract=bool(rec.abstract and len(rec.abstract.strip()) > 0),
                source_file=source_schema,
            )
            records_detail.append(detail)

        records_detail.sort(key=lambda r: (r.has_abstract, bool(r.doi)), reverse=True)
        suggested_master_id = records_detail[0].record_id if records_detail else decisions[0].record_id

        result.append(
            DuplicateClusterRead(
                cluster_id=cluster_id,
                similarity_score=score,
                match_reason=reason,
                suggested_master_id=suggested_master_id,
                records=records_detail,
            )
        )

    return result


def get_deduplication_summary(db: Session, project_id: uuid.UUID) -> DeduplicationSummaryResponse:
    """Obtiene conteos globales y por fuente de los resultados actuales de desduplicación."""
    screening_session = get_or_create_screening_session(db, project_id)

    records_statement = (
        select(ExtractedRecord, SearchResultFile)
        .join(SearchResultFile, ExtractedRecord.file_id == SearchResultFile.id)
        .where(SearchResultFile.project_id == project_id)
    )
    record_rows = db.exec(records_statement).all()

    decisions_statement = select(ScreeningDecision).where(
        ScreeningDecision.screening_session_id == screening_session.id
    )
    decisions_by_record_id = {
        decision.record_id: decision for decision in db.exec(decisions_statement).all()
    }

    totals_by_source: Dict[str, Dict[str, int]] = {}
    total_records = 0
    duplicate_records = 0
    pending_review_records = 0

    for record, source_file in record_rows:
        source = (source_file.database_source or "Sin fuente").strip() or "Sin fuente"
        totals = totals_by_source.setdefault(
            source,
            {
                "total_records": 0,
                "unique_records": 0,
                "duplicate_records": 0,
                "pending_review_records": 0,
            },
        )

        decision = decisions_by_record_id.get(record.id)
        is_duplicate = bool(decision and decision.is_duplicate)
        is_pending = bool(
            decision
            and decision.duplicate_review_status == DuplicateReviewStatus.PENDING_HUMAN_REVIEW
        )

        total_records += 1
        totals["total_records"] += 1

        if is_duplicate:
            duplicate_records += 1
            totals["duplicate_records"] += 1
        else:
            totals["unique_records"] += 1

        if is_pending:
            pending_review_records += 1
            totals["pending_review_records"] += 1

    by_database_source = [
        DeduplicationSourceBreakdown(
            database_source=source,
            total_records=counts["total_records"],
            unique_records=counts["unique_records"],
            duplicate_records=counts["duplicate_records"],
            pending_review_records=counts["pending_review_records"],
        )
        for source, counts in sorted(totals_by_source.items(), key=lambda item: item[0].lower())
    ]

    return DeduplicationSummaryResponse(
        project_id=project_id,
        session_status=screening_session.status.value,
        total_records=total_records,
        unique_records=total_records - duplicate_records,
        duplicate_records=duplicate_records,
        pending_review_records=pending_review_records,
        by_database_source=by_database_source,
    )


def resolve_duplicate_cluster(
    db: Session,
    project_id: uuid.UUID,
    cluster_id: str,
    selected_master_record_id: uuid.UUID,
    action: str = "CONFIRM_DUPLICATES",
) -> ScreeningSession:
    """Aplica la decisión manual del usuario sobre un cluster de duplicados en la UI."""
    screening_session = get_or_create_screening_session(db, project_id)

    statement = (
        select(ScreeningDecision)
        .where(ScreeningDecision.screening_session_id == screening_session.id)
        .where(ScreeningDecision.duplicate_cluster_id == cluster_id)
    )
    cluster_decisions = db.exec(statement).all()

    if not cluster_decisions:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"El cluster de duplicados '{cluster_id}' no existe o ya fue resuelto.",
        )

    cluster_record_ids = {d.record_id for d in cluster_decisions}
    if selected_master_record_id not in cluster_record_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El artículo seleccionado como maestro no pertenece a este cluster de duplicados.",
        )

    if action == "MARK_ALL_AS_UNIQUE":
        for d in cluster_decisions:
            d.is_duplicate = False
            d.duplicate_of_id = None
            d.duplicate_review_status = DuplicateReviewStatus.HUMAN_RESOLVED_UNIQUE
            db.add(d)
    else:  # CONFIRM_DUPLICATES
        for d in cluster_decisions:
            if d.record_id == selected_master_record_id:
                d.is_duplicate = False
                d.duplicate_of_id = None
                d.duplicate_review_status = DuplicateReviewStatus.HUMAN_RESOLVED_UNIQUE
            else:
                d.is_duplicate = True
                d.duplicate_of_id = selected_master_record_id
                d.duplicate_review_status = DuplicateReviewStatus.HUMAN_RESOLVED_DUPLICATE
            db.add(d)

    db.commit()

    total_duplicates = len(
        db.exec(
            select(ScreeningDecision)
            .where(ScreeningDecision.screening_session_id == screening_session.id)
            .where(ScreeningDecision.is_duplicate == True)
        ).all()
    )
    screening_session.duplicate_records_count = total_duplicates
    screening_session.unique_records_count = screening_session.total_initial_records - total_duplicates

    remaining_pending = db.exec(
        select(ScreeningDecision)
        .where(ScreeningDecision.screening_session_id == screening_session.id)
        .where(ScreeningDecision.duplicate_review_status == DuplicateReviewStatus.PENDING_HUMAN_REVIEW)
    ).all()

    if not remaining_pending:
        screening_session.status = ProcessStatus.IDLE

    db.add(screening_session)
    db.commit()
    db.refresh(screening_session)

    return screening_session


def generate_article_id(title: Optional[str], authors: Optional[str]) -> str:
    """Genera un ID compuesto de 5 letras del título + 4 de los autores."""
    clean_t = re.sub(r"[^\w]", "", title or "").upper()
    clean_a = re.sub(r"[^\w]", "", authors or "").upper()
    part_t = clean_t[:5].ljust(5, "X")
    part_a = clean_a[:4].ljust(4, "X")
    return f"{part_t}{part_a}"


def _unique_records_query_parts(db: Session, project_id: uuid.UUID, screening_session: ScreeningSession):
    decisions_count_statement = (
        select(func.count())
        .select_from(ScreeningDecision)
        .where(ScreeningDecision.screening_session_id == screening_session.id)
    )
    has_decisions = int(db.exec(decisions_count_statement).one()) > 0

    if has_decisions:
        rows_statement = (
            select(ExtractedRecord, SearchResultFile)
            .join(SearchResultFile, ExtractedRecord.file_id == SearchResultFile.id)
            .join(ScreeningDecision, ScreeningDecision.record_id == ExtractedRecord.id)
            .where(SearchResultFile.project_id == project_id)
            .where(ScreeningDecision.screening_session_id == screening_session.id)
            .where(ScreeningDecision.is_duplicate == False)
            .order_by(ExtractedRecord.created_at, ExtractedRecord.id)
        )
        count_statement = (
            select(func.count())
            .select_from(ExtractedRecord)
            .join(SearchResultFile, ExtractedRecord.file_id == SearchResultFile.id)
            .join(ScreeningDecision, ScreeningDecision.record_id == ExtractedRecord.id)
            .where(SearchResultFile.project_id == project_id)
            .where(ScreeningDecision.screening_session_id == screening_session.id)
            .where(ScreeningDecision.is_duplicate == False)
        )
    else:
        rows_statement = (
            select(ExtractedRecord, SearchResultFile)
            .join(SearchResultFile, ExtractedRecord.file_id == SearchResultFile.id)
            .where(SearchResultFile.project_id == project_id)
            .order_by(ExtractedRecord.created_at, ExtractedRecord.id)
        )
        count_statement = (
            select(func.count())
            .select_from(ExtractedRecord)
            .join(SearchResultFile, ExtractedRecord.file_id == SearchResultFile.id)
            .where(SearchResultFile.project_id == project_id)
        )

    return rows_statement, count_statement


def _build_unique_record_read(record: ExtractedRecord, source_file: SearchResultFile) -> UniqueRecordRead:
    return UniqueRecordRead(
        record_id=record.id,
        file_id=record.file_id,
        database_source=(source_file.database_source or "Sin fuente").strip() or "Sin fuente",
        id_article=generate_article_id(record.title, record.authors),
        title=record.title,
        authors=record.authors,
        publication_year=record.publication_year,
        doi=record.doi,
        source_title=record.source_title,
        abstract=record.abstract,
    )


def get_unique_records_paginated(
    db: Session,
    project_id: uuid.UUID,
    skip: int = 0,
    limit: int = 100,
) -> PaginatedUniqueRecordsResponse:
    """Lista registros únicos actuales con fuente bibliográfica y metadatos de paginación."""
    project = db.get(RSLProject, project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"El proyecto RSL con ID '{project_id}' no existe.",
        )

    screening_session = get_or_create_screening_session(db, project_id)
    rows_statement, count_statement = _unique_records_query_parts(db, project_id, screening_session)

    total = int(db.exec(count_statement).one())
    record_rows = db.exec(rows_statement.offset(skip).limit(limit)).all()
    items = [_build_unique_record_read(record, source_file) for record, source_file in record_rows]

    return PaginatedUniqueRecordsResponse(
        items=items,
        total=total,
        skip=skip,
        limit=limit,
        returned=len(items),
        has_next=skip + len(items) < total,
        has_previous=skip > 0,
    )


def export_unique_records_excel(db: Session, project_id: uuid.UUID) -> Tuple[bytes, str]:
    """
    Genera un archivo Excel con pandas con el conjunto de registros únicos actuales del proyecto RSL.
    Campos exportados: id_article, base_datos, titulo, autores, año_publicacion, doi, journal.
    """
    project = db.get(RSLProject, project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"El proyecto RSL con ID '{project_id}' no existe.",
        )

    screening_session = get_or_create_screening_session(db, project_id)
    rows_statement, _ = _unique_records_query_parts(db, project_id, screening_session)
    record_rows = db.exec(rows_statement).all()

    rows = []
    for record, source_file in record_rows:
        rows.append({
            "id_article": generate_article_id(record.title, record.authors),
            "base_datos": (source_file.database_source or "Sin fuente").strip() or "Sin fuente",
            "titulo": record.title or "",
            "autores": record.authors or "",
            "año_publicacion": record.publication_year if record.publication_year else "",
            "doi": record.doi or "",
            "journal": record.source_title or "",
        })

    df = pd.DataFrame(rows)

    slug_title = re.sub(r"[^\w\s-]", "", project.title).strip().replace(" ", "_")[:30]
    filename = f"cribado_unicos_{slug_title}.xlsx"

    output = BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Registros Únicos")

    output.seek(0)
    return output.getvalue(), filename
