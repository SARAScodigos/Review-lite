from typing import Any, Dict, List
import os
import pandas as pd

from app.api.services.parsers.base_parser import BaseFileParser


class CSVParser(BaseFileParser):
    """Parser para archivos tabulares en formato CSV."""

    def parse(self, file_path: str) -> List[Dict[str, Any]]:
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"No existe el archivo CSV en {file_path}")

        encodings = ["utf-8", "utf-8-sig", "latin-1", "cp1252"]

        for encoding in encodings:
            try:
                df = pd.read_csv(file_path, encoding=encoding, on_bad_lines="skip")
                df = df.dropna(how="all")
                return df.to_dict(orient="records")
            except (UnicodeDecodeError, pd.errors.ParserError):
                continue

        raise ValueError(f"No se pudo decodificar ni leer el archivo CSV en {file_path}")
