from abc import ABC, abstractmethod
from typing import Any, Dict, List


class BaseFileParser(ABC):
    """Clase base abstracta para todos los parsers de archivos de búsqueda (CSV, Excel, etc.)."""

    @abstractmethod
    def parse(self, file_path: str) -> List[Dict[str, Any]]:
        """
        Lee el archivo de la ruta especificada y retorna una lista de diccionarios,
        donde cada diccionario representa una fila/artículo con sus columnas originales.
        """
        pass
