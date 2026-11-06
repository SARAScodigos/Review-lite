from typing import Any, Dict, List
import pandas as pd

from app.api.services.parsers.base_parser import BaseFileParser


class ExcelParser(BaseFileParser):
    """Parser para archivos de hojas de cálculo en formato Excel (.xlsx, .xls)."""

    def parse(self, file_path: str) -> List[Dict[str, Any]]:
        try:
            df = pd.read_excel(file_path)
            df = df.dropna(how="all")
            return df.to_dict(orient="records")
        except Exception as e:
            raise ValueError(f"Error al procesar el archivo Excel {file_path}: {str(e)}")
