"""
Clase Abstracta Base (ABC) para Proveedores de Inteligencia Artificial.
Define la interfaz orientada a objetos (POO) y polimórfica que deben implementar todos los adaptadores.
"""
from abc import ABC, abstractmethod
from typing import Optional, Type, TypeVar
from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


class AbstractAIProvider(ABC):
    """Interfaz abstracta estándar para cualquier proveedor de modelos LLM."""

    def __init__(self, model_name: str, api_key: str):
        self.model_name = model_name
        self.api_key = api_key

    @abstractmethod
    def generate_text(
        self,
        prompt: str,
        system_instruction: Optional[str] = None,
        temperature: float = 0.2,
    ) -> str:
        """Genera una respuesta en texto plano desde el modelo LLM."""
        pass

    @abstractmethod
    def generate_structured(
        self,
        prompt: str,
        schema: Type[T],
        system_instruction: Optional[str] = None,
        temperature: float = 0.1,
    ) -> T:
        """Genera una respuesta estructurada validada con un esquema Pydantic."""
        pass
