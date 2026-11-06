"""
Generador de Plantillas Excel (.xlsx) para la Matriz de Extracción RSL.
Permite exportar una plantilla limpia pre-formateada con las 18 columnas estándar
más las columnas personalizadas de la matriz, lista para llenado e importación manual por el usuario.
"""
from io import BytesIO
from typing import Any, Dict, List, Optional
import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

# Lista ordenada de las 18 columnas predeterminadas de la Matriz RSL
PREDEFINED_MATRIX_COLUMNS = [
    "ID",
    "Año de publicación",
    "Título",
    "DOI",
    "Autor(es)",
    "Abstract",
    "Tipo de artículo",
    "Objetivos generales",
    "Palabras clave",
    "Introducción",
    "Fundamentación Teórica",
    "Metodología",
    "Diseño",
    "Población Muestra y Muestreo",
    "Resultados",
    "Discusión",
    "Conclusiones",
    "Relación con el título de investigación",
]


def generate_matrix_excel_template(project_title: str, custom_columns: Optional[List[str]] = None) -> BytesIO:
    """
    Genera un archivo Excel (.xlsx) en memoria con la estructura completa de encabezados
    de la Matriz RSL (18 columnas estándar + columnas personalizadas) estilizado elegantemente.
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Matriz RSL"

    # Construir lista completa de columnas
    columns = list(PREDEFINED_MATRIX_COLUMNS)
    if custom_columns:
        for var in custom_columns:
            var_clean = var.strip()
            if var_clean and var_clean not in columns:
                columns.append(var_clean)

    # Estilos visuales elegantes
    header_fill = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    thin_border = Border(
        left=Side(style="thin", color="CCCCCC"),
        right=Side(style="thin", color="CCCCCC"),
        top=Side(style="thin", color="CCCCCC"),
        bottom=Side(style="thin", color="CCCCCC"),
    )
    align_center = Alignment(horizontal="center", vertical="center", wrap_text=True)

    # Escribir encabezados en la Fila 1
    ws.row_dimensions[1].height = 28
    for col_idx, col_name in enumerate(columns, 1):
        cell = ws.cell(row=1, column=col_idx, value=col_name)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = align_center
        cell.border = thin_border
        
        # Ajustar ancho estimado de columna
        column_letter = get_column_letter(col_idx)
        max_len = max(len(str(col_name)) + 4, 15)
        ws.column_dimensions[column_letter].width = min(max_len, 40)

    # Fila de ejemplo con instrucciones para el usuario en la Fila 2
    ws.row_dimensions[2].height = 22
    sample_row = [
        "EJEMP_AUTH",  # ID
        2024,          # Año
        "Título del Artículo de Ejemplo",
        "10.1000/182",  # DOI
        "García M, Pérez J",
        "Resumen del estudio...",
        "Empírico",    # Tipo
        "Analizar la eficacia...",
        "IA, RSL, Aprendizaje",
        "Introducción...",
        "Marco Teórico...",
        "Cuantitativa",
        "Experimental",
        "Población de 200 estudiantes",
        "Aumento del 35%...",
        "Discusión...",
        "Se concluye...",
        "Relevancia directa con el título...",
    ]

    # Añadir valores vacíos para columnas personalizadas en la fila de muestra
    while len(sample_row) < len(columns):
        sample_row.append("Dato personalizado...")

    for col_idx, value in enumerate(sample_row, 1):
        cell = ws.cell(row=2, column=col_idx, value=value)
        cell.font = Font(name="Calibri", size=10, italic=True, color="7F7F7F")
        cell.alignment = align_center
        cell.border = thin_border

    output = BytesIO()
    wb.save(output)
    output.seek(0)

    return output


def generate_matrix_excel_export(
    columns: List[str],
    rows: List[Dict[str, Any]],
) -> BytesIO:
    """Genera un Excel con las filas reales de una matriz de extracción."""
    workbook = openpyxl.Workbook()
    worksheet = workbook.active
    worksheet.title = "Matriz RSL"
    worksheet.freeze_panes = "A2"
    worksheet.auto_filter.ref = f"A1:{get_column_letter(len(columns))}1"

    header_fill = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    thin_border = Border(
        left=Side(style="thin", color="CCCCCC"),
        right=Side(style="thin", color="CCCCCC"),
        top=Side(style="thin", color="CCCCCC"),
        bottom=Side(style="thin", color="CCCCCC"),
    )
    header_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    cell_alignment = Alignment(vertical="top", wrap_text=True)

    worksheet.row_dimensions[1].height = 28
    for column_index, column_name in enumerate(columns, 1):
        cell = worksheet.cell(row=1, column=column_index, value=column_name)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = header_alignment
        cell.border = thin_border
        worksheet.column_dimensions[get_column_letter(column_index)].width = min(
            max(len(column_name) + 4, 15),
            40,
        )

    for row_index, row_data in enumerate(rows, 2):
        for column_index, column_name in enumerate(columns, 1):
            value = row_data.get(column_name)
            if isinstance(value, (dict, list)):
                value = str(value)
            if isinstance(value, str) and value.startswith(("=", "+", "-", "@")):
                value = f"'{value}"
            cell = worksheet.cell(row=row_index, column=column_index, value=value)
            cell.alignment = cell_alignment
            cell.border = thin_border

    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    return output
