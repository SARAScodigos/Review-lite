"""
Rutas de API para la gestión del Motor de Inteligencia Artificial (AI Engine).
Expone el catálogo de modelos por proveedor y permite probar completions.
"""
from typing import Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.ai.catalog import (
    DEFAULT_SCREENING_MODEL,
    DEFAULT_SCREENING_PROVIDER,
    get_supported_catalog_summary,
)
from app.ai.factory import AIEngineFactory

router = APIRouter(
    prefix="/ai",
    tags=["Motor de Inteligencia Artificial (AI Engine)"],
)


class AITestRequest(BaseModel):
    """Payload para probar la generación de un modelo de IA específico."""

    provider: str = Field(..., example=DEFAULT_SCREENING_PROVIDER, description="Proveedor: openai, google, anthropic, deepseek")
    model: str = Field(..., example=DEFAULT_SCREENING_MODEL, description="Modelo soportado según el catálogo")
    prompt: str = Field(..., example="Explica en 2 oraciones qué es una Revisión Sistemática de la Literatura.")
    system_instruction: Optional[str] = Field(default=None, description="Instrucción de sistema opcional")
    temperature: float = Field(default=0.2, ge=0.0, le=1.0)


class AITestResponse(BaseModel):
    """Respuesta de prueba devuelta por el proveedor de IA."""

    provider: str
    model: str
    response_text: str


@router.get("/models")
def get_ai_models_catalog_endpoint():
    """
    Retorna el catálogo público de proveedores, incluyendo el flag 'is_configured'
    si la clave está presente y las marcas de recomendación para cribado.
    """
    return get_supported_catalog_summary()


@router.get("/models/screening-default")
def get_default_screening_model_endpoint():
    """Retorna el proveedor y modelo aplicados al cribado cuando el cliente no los indica."""
    return {
        "provider": DEFAULT_SCREENING_PROVIDER,
        "model": DEFAULT_SCREENING_MODEL,
    }


@router.post("/test", response_model=AITestResponse)
def test_ai_model_completion_endpoint(payload: AITestRequest):
    """
    Prueba la generación de texto utilizando el proveedor y modelo seleccionados.
    Valida la correspondencia del modelo con el proveedor y la presencia de la API Key.
    """
    provider_instance = AIEngineFactory.get_provider(
        provider=payload.provider,
        model=payload.model,
    )

    text_output = provider_instance.generate_text(
        prompt=payload.prompt,
        system_instruction=payload.system_instruction,
        temperature=payload.temperature,
    )

    return AITestResponse(
        provider=payload.provider,
        model=payload.model,
        response_text=text_output,
    )
