"""
Paquete principal de Inteligencia Artificial (AI Engine Package).
Proporciona acceso a la fábrica de proveedores, catálogo de modelos y validadores de seguridad.
"""
from app.ai.base import AbstractAIProvider
from app.ai.catalog import (
    AI_CATALOG,
    DEFAULT_SCREENING_MODEL,
    DEFAULT_SCREENING_PROVIDER,
    get_api_key_for_provider,
    get_supported_catalog_summary,
    validate_provider_and_model,
)
from app.ai.factory import AIEngineFactory

__all__ = [
    "AbstractAIProvider",
    "AIEngineFactory",
    "AI_CATALOG",
    "DEFAULT_SCREENING_PROVIDER",
    "DEFAULT_SCREENING_MODEL",
    "get_supported_catalog_summary",
    "validate_provider_and_model",
    "get_api_key_for_provider",
]
