"""Generación de diagramas PRISMA 2020 a partir de las métricas persistidas y trazabilidad de PDFs."""
from io import BytesIO
from xml.sax.saxutils import escape
import uuid
from typing import Dict

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.api.models.article_pdf_model import ArticlePDF, PDFDownloadStatus
from app.api.models.extracted_record_model import ExtractedRecord
from app.api.models.rsl_project_model import RSLProject
from app.api.models.search_result_file_model import SearchResultFile
from app.api.models.screening_model import ScreeningDecision, ScreeningDecisionEnum, ScreeningSession


def _get_prisma_context(db: Session, project_id: uuid.UUID) -> tuple[RSLProject, ScreeningSession]:
    project = db.get(RSLProject, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="El proyecto RSL no existe.")

    screening = db.exec(
        select(ScreeningSession).where(ScreeningSession.project_id == project_id)
    ).first()
    if not screening:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El proyecto todavía no tiene una sesión de cribado para construir el diagrama PRISMA.",
        )
    return project, screening


def get_prisma_metrics(db: Session, project_id: uuid.UUID) -> Dict[str, int]:
    """Recuentos actuales por registro; no depende de contadores agregados antiguos."""
    _, screening = _get_prisma_context(db, project_id)
    records = db.exec(
        select(ExtractedRecord).join(SearchResultFile)
        .where(SearchResultFile.project_id == project_id)
    ).all()
    decisions = db.exec(
        select(ScreeningDecision)
        .join(ExtractedRecord, ScreeningDecision.record_id == ExtractedRecord.id)
        .join(SearchResultFile, ExtractedRecord.file_id == SearchResultFile.id)
        .where(SearchResultFile.project_id == project_id)
        .where(ScreeningDecision.screening_session_id == screening.id)
    ).all()
    pdfs = db.exec(select(ArticlePDF).where(ArticlePDF.project_id == project_id)).all()
    pdf_map = {pdf.record_id: pdf for pdf in pdfs}
    unique = {d.record_id: d for d in decisions if not d.is_duplicate}
    included = ScreeningDecisionEnum.INCLUDED
    excluded = ScreeningDecisionEnum.EXCLUDED
    pending = (ScreeningDecisionEnum.PENDING, ScreeningDecisionEnum.EVALUATING)
    passed_title = (included, ScreeningDecisionEnum.MAYBE)
    metrics = {
        "total_initial_records": len(records),
        "duplicate_records_count": len({d.record_id for d in decisions if d.is_duplicate}),
        "title_included_count": 0, "title_excluded_count": 0,
        "abstract_included_count": 0, "abstract_excluded_count": 0,
        "fulltext_sought_count": 0, "fulltext_retrieved_count": 0,
        "fulltext_not_retrieved_count": 0, "fulltext_pending_count": 0,
        "fulltext_included_count": 0, "fulltext_excluded_count": 0,
    }
    metrics["unique_records_count"] = len(records) - metrics["duplicate_records_count"]
    for record_id, decision in unique.items():
        pdf = pdf_map.get(record_id)
        retrieved = bool(pdf and pdf.file_path and pdf.download_status in (
            PDFDownloadStatus.DOWNLOADED, PDFDownloadStatus.MANUALLY_UPLOADED,
        ))
        # El avance documentado prevalece sobre un estado previo pendiente.
        advanced = decision.abstract_status not in pending or decision.fulltext_status not in pending or decision.final_decision not in pending
        title_pass = decision.title_status in passed_title or (decision.title_status in pending and advanced)
        metrics["title_included_count"] += int(title_pass)
        metrics["title_excluded_count"] += int(decision.title_status == excluded)
        metrics["abstract_included_count"] += int(decision.abstract_status == included)
        metrics["abstract_excluded_count"] += int(decision.abstract_status == excluded)
        # No incluye abstracts pendientes por el mero hecho de pasar el título.
        sought = decision.abstract_status == included or decision.fulltext_status not in pending or decision.final_decision not in pending or (title_pass and retrieved and decision.abstract_status != excluded)
        if not sought:
            continue
        metrics["fulltext_sought_count"] += 1
        metrics["fulltext_retrieved_count"] += int(retrieved)
        metrics["fulltext_not_retrieved_count"] += int(not retrieved)
        metrics["fulltext_included_count"] += int(decision.final_decision == included)
        metrics["fulltext_excluded_count"] += int(decision.final_decision == excluded)
        metrics["fulltext_pending_count"] += int(retrieved and decision.final_decision not in (included, excluded))
    return metrics


def get_prisma_fulltext_retrieval_metrics(db: Session, project_id: uuid.UUID) -> Dict[str, int]:
    """Recuperación registrada de informes que avanzaron a texto completo."""
    metrics = get_prisma_metrics(db, project_id)
    return {
        "sought": metrics["fulltext_sought_count"],
        "retrieved": metrics["fulltext_retrieved_count"],
        "not_retrieved": metrics["fulltext_not_retrieved_count"],
    }


def _prisma_steps(db: Session, project_id: uuid.UUID, screening: ScreeningSession) -> list[tuple[str, list[str]]]:
    metrics = get_prisma_metrics(db, project_id)
    return [
        ("Identificación", [f"Registros identificados: {metrics['total_initial_records']}"]),
        (
            "Desduplicación",
            [
                f"Duplicados eliminados: {metrics['duplicate_records_count']}",
                f"Registros únicos: {metrics['unique_records_count']}",
            ],
        ),
        (
            "Cribado por título",
            [
                f"Excluidos: {metrics['title_excluded_count']}",
                f"Avanzan a abstract: {metrics['title_included_count']}",
            ],
        ),
        (
            "Cribado por abstract",
            [
                f"Excluidos: {metrics['abstract_excluded_count']}",
                f"Avanzan a texto completo: {metrics['abstract_included_count']}",
            ],
        ),
        (
            "Recuperación de texto completo (PDF)",
            [
                f"Buscados para texto completo: {metrics['fulltext_sought_count']}",
                f"Informes NO recuperados (Sin PDF): {metrics['fulltext_not_retrieved_count']}",
                f"Informes recuperados con éxito: {metrics['fulltext_retrieved_count']}",
            ],
        ),
        (
            "Elegibilidad y matriz",
            [
                f"Excluidos a texto completo: {metrics['fulltext_excluded_count']}",
                f"Estudios incluidos en síntesis: {metrics['fulltext_included_count']}",
                f"Pendientes de decisión final: {metrics['fulltext_pending_count']}",
            ],
        ),
    ]


def build_prisma_svg(db: Session, project_id: uuid.UUID) -> str:
    """Construye un SVG vectorial, listo para imprimir o incluir en un manuscrito."""
    project, screening = _get_prisma_context(db, project_id)
    steps = _prisma_steps(db, project_id, screening)
    width, height = 1100, 1020
    box_width, box_height = 580, 115
    x = (width - box_width) // 2
    start_y, gap = 90, 148

    boxes: list[str] = []
    for index, (heading, lines) in enumerate(steps):
        y = start_y + index * gap
        line_markup = "".join(
            f'<text x="{width / 2}" y="{y + 58 + line_index * 22}" class="body">{escape(line)}</text>'
            for line_index, line in enumerate(lines)
        )
        boxes.append(
            f'<rect x="{x}" y="{y}" width="{box_width}" height="{box_height}" rx="8" class="box"/>'
            f'<text x="{width / 2}" y="{y + 32}" class="heading">{escape(heading)}</text>'
            f'{line_markup}'
        )
        if index < len(steps) - 1:
            arrow_y = y + box_height + 6
            boxes.append(
                f'<path d="M {width / 2} {arrow_y} V {arrow_y + 20}" class="arrow"/>'
                f'<path d="M {width / 2 - 6} {arrow_y + 14} L {width / 2} {arrow_y + 20} L {width / 2 + 6} {arrow_y + 14}" class="arrow"/>'
            )

    return f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title description">
  <title id="title">Diagrama de flujo PRISMA 2020</title>
  <desc id="description">Diagrama PRISMA del proyecto {escape(project.title)}</desc>
  <style>
    .bg {{ fill: #ffffff; }} .box {{ fill: #f8fafc; stroke: #0f766e; stroke-width: 2; }}
    .heading {{ font: 700 19px Arial, sans-serif; text-anchor: middle; fill: #134e4a; }}
    .body {{ font: 15px Arial, sans-serif; text-anchor: middle; fill: #1e293b; }}
    .title {{ font: 700 25px Arial, sans-serif; text-anchor: middle; fill: #0f172a; }}
    .subtitle {{ font: 14px Arial, sans-serif; text-anchor: middle; fill: #475569; }}
    .arrow {{ fill: none; stroke: #0f766e; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }}
  </style>
  <rect width="100%" height="100%" class="bg"/>
  <text x="{width / 2}" y="38" class="title">Diagrama de flujo PRISMA 2020</text>
  <text x="{width / 2}" y="63" class="subtitle">{escape(project.title)}</text>
  {''.join(boxes)}
</svg>'''


def _pdf_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def build_prisma_pdf(db: Session, project_id: uuid.UUID) -> bytes:
    """Crea un PDF A4 vectorial sin depender de herramientas externas de conversión SVG."""
    project, screening = _get_prisma_context(db, project_id)
    steps = _prisma_steps(db, project_id, screening)
    commands = [
        "0.06 0.09 0.16 rg",
        "BT /F2 18 Tf 180 805 Td (Diagrama de flujo PRISMA 2020) Tj ET",
        f"BT /F1 9 Tf 180 790 Td ({_pdf_escape(project.title[:70])}) Tj ET",
    ]
    y = 690
    for index, (heading, lines) in enumerate(steps):
        commands.extend([
            "0.04 0.46 0.43 RG 1.2 w",
            f"65 {y} 465 72 re S",
            "0.08 0.31 0.29 rg",
            f"BT /F2 11 Tf 80 {y + 52} Td ({_pdf_escape(heading)}) Tj ET",
        ])
        for line_index, line in enumerate(lines):
            commands.append(f"BT /F1 9 Tf 80 {y + 34 - line_index * 13} Td ({_pdf_escape(line)}) Tj ET")
        if index < len(steps) - 1:
            commands.append(f"0.04 0.46 0.43 RG 1.5 w 297 {y - 2} m 297 {y - 18} l S")
        y -= 95

    content = "\n".join(commands).encode("cp1252", "replace")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    ]
    output = BytesIO()
    output.write(b"%PDF-1.4\n")
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(output.tell())
        output.write(f"{index} 0 obj\n".encode())
        output.write(obj)
        output.write(b"\nendobj\n")
    xref = output.tell()
    output.write(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        output.write(f"{offset:010d} 00000 n \n".encode())
    output.write(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode())
    return output.getvalue()

