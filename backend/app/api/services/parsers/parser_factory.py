from app.api.services.parsers.base_parser import BaseFileParser
from app.api.services.parsers.csv_parser import CSVParser
from app.api.services.parsers.excel_parser import ExcelParser


class FileParserFactory:
    """Fábrica de parsers para instanciar el procesador adecuado según la extensión del archivo."""

    @staticmethod
    def get_parser(file_type_or_extension: str) -> BaseFileParser:
        ext = file_type_or_extension.lower().lstrip(".")
        if ext == "csv":
            return CSVParser()
        elif ext in ["xls", "xlsx"]:
            return ExcelParser()
        else:
            raise ValueError(
                f"Formato no soportado: '{file_type_or_extension}'. Solo se admiten archivos CSV, XLS y XLSX."
            )
