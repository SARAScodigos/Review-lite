"""
Módulo de Construcción y Formateo de Documentos Word (.docx) para el Manuscrito RSL.
Cumple estrictamente las especificaciones académicas:
- Hoja A4 con márgenes de 2.5 cm en todos los lados.
- Tipografía Times New Roman de 10 pt con interlineado sencillo (1.0).
- Cero colores (estilo blanco y negro monocromático estricto).
- Numeración de página en el pie central inferior.
- Orden de secciones: Abstract (vacío) -> Introducción -> Marco Teórico -> Metodología -> Resultados (Tablas + Interpretación) -> Discusión -> Conclusiones -> Referencias (vacío).
"""
import os
import re
from typing import Any, Dict, List
import docx
from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn
from docx.shared import Cm, Pt, RGBColor

from app.api.models.rsl_project_model import RSLProject
from app.api.models.synthesis_model import RSLSynthesisSection, SynthesisSectionType


def set_cell_border(cell, **kwargs):
    """Establece bordes finos monocromáticos gris/negro en las celdas de las tablas Word sin colores vistosos."""
    tcPr = cell._tc.get_or_add_tcPr()
    tcBorders = OxmlElement('w:tcBorders')
    for edge in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        edge_data = kwargs.get(edge)
        if edge_data:
            border = OxmlElement(f'w:{edge}')
            border.set(qn('w:val'), edge_data.get('val', 'single'))
            border.set(qn('w:sz'), str(edge_data.get('sz', 4)))
            border.set(qn('w:space'), '0')
            border.set(qn('w:color'), edge_data.get('color', 'CCCCCC'))
            tcBorders.append(border)
    tcPr.append(tcBorders)


def add_page_number_to_footer(section):
    """Añade la numeración de página dinámica en la parte central inferior del pie de página."""
    footer = section.footer
    paragraph = footer.paragraphs[0]
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    pPr = paragraph._p.get_or_add_pPr()
    
    # Campo XML de numeración de página PAGE
    run = paragraph.add_run()
    run.font.name = "Times New Roman"
    run.font.size = Pt(10)
    run.font.color.rgb = RGBColor(0, 0, 0)

    fldSimple = OxmlElement('w:fldSimple')
    fldSimple.set(qn('w:instr'), 'PAGE')
    paragraph._p.append(fldSimple)


def render_markdown_text_to_docx(doc: Document, markdown_text: str):
    """Convierte un texto en formato Markdown a párrafos y títulos estilizados en Word."""
    if not markdown_text:
        return

    lines = markdown_text.splitlines()
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        if stripped.startswith("# "):
            p = doc.add_heading(level=1)
            run = p.add_run(stripped[2:].strip())
            run.font.name = "Times New Roman"
            run.font.size = Pt(14)
            run.font.bold = True
            run.font.color.rgb = RGBColor(0, 0, 0)
            p.paragraph_format.space_before = Pt(12)
            p.paragraph_format.space_after = Pt(6)

        elif stripped.startswith("## "):
            p = doc.add_heading(level=2)
            run = p.add_run(stripped[3:].strip())
            run.font.name = "Times New Roman"
            run.font.size = Pt(12)
            run.font.bold = True
            run.font.color.rgb = RGBColor(0, 0, 0)
            p.paragraph_format.space_before = Pt(10)
            p.paragraph_format.space_after = Pt(4)

        elif stripped.startswith("### "):
            p = doc.add_heading(level=3)
            run = p.add_run(stripped[4:].strip())
            run.font.name = "Times New Roman"
            run.font.size = Pt(11)
            run.font.bold = True
            run.font.color.rgb = RGBColor(0, 0, 0)
            p.paragraph_format.space_before = Pt(8)
            p.paragraph_format.space_after = Pt(2)

        elif stripped.startswith("- ") or stripped.startswith("* "):
            p = doc.add_paragraph(style='List Bullet')
            run = p.add_run(stripped[2:].strip())
            run.font.name = "Times New Roman"
            run.font.size = Pt(10)
            run.font.color.rgb = RGBColor(0, 0, 0)
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.line_spacing = 1.0

        else:
            p = doc.add_paragraph()
            p.paragraph_format.line_spacing = 1.0
            p.paragraph_format.space_after = Pt(4)

            # Sombra de negrita simple **texto**
            parts = re.split(r'(\*\*.*?\*\*)', stripped)
            for part in parts:
                if part.startswith("**") and part.endswith("**"):
                    run = p.add_run(part[2:-2])
                    run.font.bold = True
                else:
                    run = p.add_run(part)
                run.font.name = "Times New Roman"
                run.font.size = Pt(10)
                run.font.color.rgb = RGBColor(0, 0, 0)


def render_json_table_to_docx(doc: Document, table_data: Dict[str, Any]):
    """Convierte la estructura JSONB generated_table a una tabla Word elegante en monocromo (sin colores)."""
    if not table_data or "columns" not in table_data or "rows" not in table_data:
        return

    cols = table_data.get("columns", [])
    rows = table_data.get("rows", [])

    if not cols or not rows:
        return

    # Título opcional de la tabla
    if "title" in table_data and table_data["title"]:
        p = doc.add_paragraph()
        r = p.add_run(f"Tabla: {table_data['title']}")
        r.font.name = "Times New Roman"
        r.font.size = Pt(10)
        r.font.bold = True
        r.font.color.rgb = RGBColor(0, 0, 0)
        p.paragraph_format.space_before = Pt(8)
        p.paragraph_format.space_after = Pt(2)

    table = doc.add_table(rows=len(rows) + 1, cols=len(cols))
    table.alignment = docx.enum.table.WD_TABLE_ALIGNMENT.CENTER

    # Encabezado de la tabla (Fila 1)
    hdr_cells = table.rows[0].cells
    for idx, header in enumerate(cols):
        cell_text = header.get("label") if isinstance(header, dict) else str(header)
        cell = hdr_cells[idx]
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.line_spacing = 1.0
        r = p.add_run(cell_text)
        r.font.name = "Times New Roman"
        r.font.size = Pt(10)
        r.font.bold = True
        r.font.color.rgb = RGBColor(0, 0, 0)
        set_cell_border(cell, top={"val": "single", "sz": 6, "color": "000000"}, bottom={"val": "single", "sz": 6, "color": "000000"})

    # Filas de datos
    for row_idx, row_data in enumerate(rows):
        row_cells = table.rows[row_idx + 1].cells
        for col_idx, header in enumerate(cols):
            key = header.get("key") if isinstance(header, dict) else str(header)
            cell_val = str(row_data.get(key, ""))
            cell = row_cells[col_idx]
            p = cell.paragraphs[0]
            p.paragraph_format.line_spacing = 1.0
            r = p.add_run(cell_val)
            r.font.name = "Times New Roman"
            r.font.size = Pt(10)
            r.font.color.rgb = RGBColor(0, 0, 0)
            set_cell_border(cell, bottom={"val": "single", "sz": 4, "color": "CCCCCC"})

    # Párrafo de separación
    p_sep = doc.add_paragraph()
    p_sep.paragraph_format.space_after = Pt(8)


def build_rsl_manuscript_docx(
    project: RSLProject,
    sections: List[RSLSynthesisSection],
    destination_path: str,
):
    """
    Construye el archivo .docx completo respetando la plantilla A4, Times New Roman 10pt,
    márgenes de 2.5cm, numeración central inferior y orden de secciones.
    """
    os.makedirs(os.path.dirname(destination_path), exist_ok=True)
    doc = Document()

    # 1. Configurar Hoja A4 y Márgenes de 2.5 cm en todos los lados
    sec = doc.sections[0]
    sec.page_width = Cm(21.0)
    sec.page_height = Cm(29.7)
    sec.top_margin = Cm(2.5)
    sec.bottom_margin = Cm(2.5)
    sec.left_margin = Cm(2.5)
    sec.right_margin = Cm(2.5)

    # 2. Numeración central inferior en pie de página
    add_page_number_to_footer(sec)

    # 3. Título del Proyecto RSL
    p_title = doc.add_paragraph()
    p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_title = p_title.add_run(project.title.upper())
    r_title.font.name = "Times New Roman"
    r_title.font.size = Pt(16)
    r_title.font.bold = True
    r_title.font.color.rgb = RGBColor(0, 0, 0)
    p_title.paragraph_format.space_before = Pt(0)
    p_title.paragraph_format.space_after = Pt(18)

    # Subtítulo RSL
    p_sub = doc.add_paragraph()
    p_sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_sub = p_sub.add_run("REVISIÓN SISTEMÁTICA DE LA LITERATURA (PRISMA 2020)")
    r_sub.font.name = "Times New Roman"
    r_sub.font.size = Pt(11)
    r_sub.font.bold = True
    r_sub.font.color.rgb = RGBColor(0, 0, 0)
    p_sub.paragraph_format.space_after = Pt(24)

    # Organizar secciones por tipo
    sections_by_type: Dict[SynthesisSectionType, List[RSLSynthesisSection]] = {}
    for s in sections:
        sections_by_type.setdefault(s.section_type, []).append(s)

    # SEC 1: RESUMEN / ABSTRACT (Placeholder Vacío)
    p_h = doc.add_paragraph()
    r = p_h.add_run("RESUMEN / ABSTRACT")
    r.font.name = "Times New Roman"; r.font.size = Pt(12); r.font.bold = True; r.font.color.rgb = RGBColor(0, 0, 0)
    p_h.paragraph_format.space_before = Pt(12); p_h.paragraph_format.space_after = Pt(4)
    p_txt = doc.add_paragraph()
    r_t = p_txt.add_run("[Pendiente de redacción final de resumen]")
    r_t.font.name = "Times New Roman"; r_t.font.size = Pt(10); r_t.font.italic = True; r_t.font.color.rgb = RGBColor(0, 0, 0)
    p_txt.paragraph_format.space_after = Pt(14); p_txt.paragraph_format.line_spacing = 1.0

    # SEC 2: INTRODUCCIÓN
    intro_sec = sections_by_type.get(SynthesisSectionType.INTRODUCTION)
    if intro_sec and intro_sec[0].generated_draft:
        render_markdown_text_to_docx(doc, "# 1. INTRODUCCIÓN Y ANTECEDENTES\n\n" + intro_sec[0].generated_draft)

    # SEC 3: MARCO TEÓRICO
    theo_sec = sections_by_type.get(SynthesisSectionType.THEORETICAL_FRAMEWORK)
    if theo_sec and theo_sec[0].generated_draft:
        render_markdown_text_to_docx(doc, "# 2. MARCO TEÓRICO Y FUNDAMENTACIÓN\n\n" + theo_sec[0].generated_draft)

    # SEC 4: METODOLOGÍA PRISMA 2020
    meth_sec = sections_by_type.get(SynthesisSectionType.METHODOLOGY_PRISMA)
    if meth_sec and meth_sec[0].generated_draft:
        render_markdown_text_to_docx(doc, "# 3. METODOLOGÍA Y ESTRATEGIA DE BÚSQUEDA (PRISMA 2020)\n\n" + meth_sec[0].generated_draft)

    # SEC 5: RESULTADOS POR OBJETIVO
    res_secs = sections_by_type.get(SynthesisSectionType.RESULTS_OBJECTIVE, [])
    if res_secs:
        render_markdown_text_to_docx(doc, "# 4. RESULTADOS Y ANÁLISIS DE LA EVIDENCIA")
        for idx, obj_sec in enumerate(sorted(res_secs, key=lambda x: x.order_index), 1):
            obj_title = obj_sec.objective_title or f"Objetivo {idx}"
            render_markdown_text_to_docx(doc, f"## 4.{idx}. {obj_title}")

            # Renderizar Tabla Sintética de Resultados si existe
            if obj_sec.generated_table:
                render_json_table_to_docx(doc, obj_sec.generated_table)

            # Renderizar Interpretación Narrativa
            if obj_sec.generated_draft:
                render_markdown_text_to_docx(doc, obj_sec.generated_draft)

    # SEC 6: DISCUSIÓN
    disc_sec = sections_by_type.get(SynthesisSectionType.DISCUSSION)
    if disc_sec and disc_sec[0].generated_draft:
        render_markdown_text_to_docx(doc, "# 5. DISCUSIÓN Y SÍNTESIS CONCEPTUAL EMERGENTE\n\n" + disc_sec[0].generated_draft)

    # SEC 7: CONCLUSIONES
    conc_sec = sections_by_type.get(SynthesisSectionType.CONCLUSIONS)
    if conc_sec and conc_sec[0].generated_draft:
        render_markdown_text_to_docx(doc, "# 6. CONCLUSIONES Y TRABAJOS FUTUROS\n\n" + conc_sec[0].generated_draft)

    # SEC 8: REFERENCIAS BIBLIOGRÁFICAS (Placeholder Vacío)
    p_h_ref = doc.add_paragraph()
    r_ref = p_h_ref.add_run("7. REFERENCIAS BIBLIOGRÁFICAS")
    r_ref.font.name = "Times New Roman"; r_ref.font.size = Pt(12); r_ref.font.bold = True; r_ref.font.color.rgb = RGBColor(0, 0, 0)
    p_h_ref.paragraph_format.space_before = Pt(12); p_h_ref.paragraph_format.space_after = Pt(4)
    p_txt_ref = doc.add_paragraph()
    r_t_ref = p_txt_ref.add_run("[Listado de referencias bibliográficas correspondientes a los IDs citados en el texto]")
    r_t_ref.font.name = "Times New Roman"; r_t_ref.font.size = Pt(10); r_t_ref.font.italic = True; r_t_ref.font.color.rgb = RGBColor(0, 0, 0)
    p_txt_ref.paragraph_format.space_after = Pt(14); p_txt_ref.paragraph_format.line_spacing = 1.0

    doc.save(destination_path)
    return destination_path
