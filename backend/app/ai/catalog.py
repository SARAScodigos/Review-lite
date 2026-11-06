"""
Catálogo oficial y registro de validación de Proveedores y Modelos de Inteligencia Artificial.
Define los modelos soportados por compañía y valida la correspondencia estricta entre proveedor y modelo.
"""
from typing import Any, Dict, List
from fastapi import HTTPException, status

from app.config import settings

# Opción de menor costo para el cribado masivo. El identificador se mantiene
# separado del nombre comercial para usar el nombre aceptado por la API.
DEFAULT_SCREENING_PROVIDER = "deepseek"
DEFAULT_SCREENING_MODEL = "deepseek-v4-pro"

# Diccionario de Proveedores y sus Modelos Oficiales Soportados
AI_CATALOG: Dict[str, Dict[str, Any]] = {
    "openai": {
        "display_name": "OpenAI",
        "env_key": "OPENAI_API_KEY",
        "models": [
            {
                "id": "gpt-5.6-luna",
                "name": "GPT-5.6 Luna",
                "description": "Modelo económico para cargas de alto volumen y sensibilidad al costo.",
                "pricing_per_million_tokens": {
                    "input_usd": 0.10,
                    "output_usd": 0.60,
                    "total_usd": 0.70,
                },
            },
            {
                "id": "gpt-5.6-terra",
                "name": "GPT-5.6 Terra",
                "description": "Modelo equilibrado entre capacidad de razonamiento y costo.",
                "pricing_per_million_tokens": {
                    "input_usd": 1.00,
                    "output_usd": 6.00,
                    "total_usd": 7.00,
                },
            },
            {
                "id": "gpt-5.6-sol",
                "name": "GPT-5.6 Sol",
                "description": "Modelo insignia para razonamiento complejo y trabajo profesional exigente.",
                "pricing_per_million_tokens": {
                    "input_usd": 2.50,
                    "output_usd": 15.00,
                    "total_usd": 17.50,
                },
            },
        ],
    },
    "google": {
        "display_name": "Google Gemini",
        "env_key": "GEMINI_API_KEY",
        "models": [
            {
                "id": "gemini-3.1-flash-lite",
                "name": "Gemini 3.1 Flash-Lite",
                "description": "Modelo ligero y económico para automatización y procesamiento de alto volumen.",
                "pricing_per_million_tokens": {
                    "input_usd": 0.25,
                    "output_usd": 1.50,
                    "total_usd": 1.75,
                },
            },
            {
                "id": "gemini-3.5-flash-lite",
                "name": "Gemini 3.5 Flash-Lite",
                "description": "Modelo de baja latencia y alto rendimiento para ejecución masiva.",
                "pricing_per_million_tokens": {
                    "input_usd": 0.30,
                    "output_usd": 2.50,
                    "total_usd": 2.80,
                },
            },
            {
                "id": "gemini-3.6-flash",
                "name": "Gemini 3.6 Flash",
                "description": "Modelo rápido con mayor capacidad para tareas complejas y multimodales.",
                "pricing_per_million_tokens": {
                    "input_usd": 1.50,
                    "output_usd": 7.50,
                    "total_usd": 9.00,
                },
            },
        ],
    },
    "anthropic": {
        "display_name": "Anthropic Claude",
        "env_key": "CLAUDE_API_KEY",
        "fallback_env_key": "ANTHROPIC_API_KEY",
        "models": [
            {
                "id": "claude-haiku-4-5",
                "name": "Claude Haiku 4.5",
                "description": "Modelo más rápido de Claude, adecuado para respuestas de baja latencia.",
                "pricing_per_million_tokens": {
                    "input_usd": 1.00,
                    "output_usd": 5.00,
                    "total_usd": 6.00,
                },
            },
            {
                "id": "claude-sonnet-5",
                "name": "Claude Sonnet 5",
                "description": "Modelo equilibrado de velocidad e inteligencia para análisis exigente.",
                "pricing_per_million_tokens": {
                    "input_usd": 2.00,
                    "output_usd": 10.00,
                    "total_usd": 12.00,
                },
            },
            {
                "id": "claude-opus-5",
                "name": "Claude Opus 5",
                "description": "Modelo de alta capacidad para agentes y análisis complejos de larga duración.",
                "pricing_per_million_tokens": {
                    "input_usd": 5.00,
                    "output_usd": 25.00,
                    "total_usd": 30.00,
                },
            },
            {
                "id": "claude-fable-5",
                "name": "Claude Fable 5",
                "description": "Modelo de máxima capacidad para trabajo de conocimiento y agentes de larga ejecución.",
                "pricing_per_million_tokens": {
                    "input_usd": 10.00,
                    "output_usd": 50.00,
                    "total_usd": 60.00,
                },
            },
        ],
    },
    "deepseek": {
        "display_name": "DeepSeek AI",
        "env_key": "DEEPSEEK_API_KEY",
        "models": [
            {
                "id": "deepseek-v4-flash",
                "name": "DeepSeek V4 Flash",
                "description": "Opción económica recomendada para el cribado masivo por título y abstract.",
                "pricing_per_million_tokens": {
                    "input_usd": 0.14,
                    "output_usd": 0.28,
                    "total_usd": 0.42,
                },
                "recommended_for": ["title_screening", "abstract_screening"],
                "is_default_for_screening": True,
            },
            {
    "id": "deepseek-v4-pro",
    "name": "DeepSeek V4 Pro",
    "description": "Opción de mayor capacidad recomendada para cribado complejo, revisión de casos dudosos y análisis con criterios de inclusión y exclusión más exigentes.",
    "pricing_per_million_tokens": {
        "input_usd": 0.435,
        "output_usd": 0.87,
        "total_usd": 1.305,
    },
    "recommended_for": [
        "title_screening",
        "abstract_screening",
        "conflict_resolution",
        "complex_screening",
    ],
    "is_default_for_screening": False,
},
        ],
    },
}


def get_api_key_for_provider(provider_key: str) -> str:
    """Obtiene la clave de API configurada para un proveedor desde settings/.env."""
    provider_info = AI_CATALOG.get(provider_key.lower())
    if not provider_info:
        return ""

    primary_key_name = provider_info["env_key"]
    api_key = getattr(settings, primary_key_name, None) or ""

    if not api_key and "fallback_env_key" in provider_info:
        fallback_key_name = provider_info["fallback_env_key"]
        api_key = getattr(settings, fallback_key_name, None) or ""

    return api_key.strip()


def validate_provider_and_model(provider: str, model: str) -> str:
    """
    Valida estrictamente que el proveedor exista y que el modelo pertenezca a dicho proveedor.
    Evita combinaciones erróneas (ej. pedir Gemini con proveedor OpenAI).
    """
    prov_clean = provider.strip().lower()
    mod_clean = model.strip()

    if prov_clean not in AI_CATALOG:
        allowed_providers = ", ".join(AI_CATALOG.keys())
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"El proveedor de IA '{provider}' no es soportado. Proveedores disponibles: {allowed_providers}",
        )

    valid_models = [m["id"] for m in AI_CATALOG[prov_clean]["models"]]
    if mod_clean not in valid_models:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Seguridad / Incompatibilidad: El modelo '{model}' no pertenece al proveedor '{provider}'. "
                f"Modelos válidos para {AI_CATALOG[prov_clean]['display_name']}: {', '.join(valid_models)}"
            ),
        )

    api_key = get_api_key_for_provider(prov_clean)
    if not api_key:
        env_var_name = AI_CATALOG[prov_clean]["env_key"]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"La clave de API para {AI_CATALOG[prov_clean]['display_name']} no está configurada ({env_var_name} en archivo .env).",
        )

    return api_key


def get_supported_catalog_summary() -> List[Dict[str, Any]]:
    """Devuelve proveedores, modelos, costos de referencia y estado de sus API keys."""
    summary = []
    for prov_key, info in AI_CATALOG.items():
        key_value = get_api_key_for_provider(prov_key)
        is_configured = bool(key_value and len(key_value) > 2)

        summary.append({
            "provider": prov_key,
            "display_name": info["display_name"],
            "is_configured": is_configured,
            "models": info["models"],
        })
    return summary
