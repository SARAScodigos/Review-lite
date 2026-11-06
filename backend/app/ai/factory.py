"""
Fábrica (Factory Pattern) para la instanciación dinámica y validada de Proveedores de IA.
Garantiza que el modelo corresponda al proveedor y que la clave de API esté presente.
"""
from app.ai.base import AbstractAIProvider
from app.ai.catalog import validate_provider_and_model
from app.ai.providers import (
    AnthropicProvider,
    DeepSeekProvider,
    GeminiProvider,
    OpenAIProvider,
)


class AIEngineFactory:
    """Fábrica para instanciar adaptadores polimórficos de proveedores de IA."""

    @staticmethod
    def get_provider(provider: str, model: str) -> AbstractAIProvider:
        """
        Valida las credenciales y la correspondencia Proveedor <-> Modelo,
        y retorna la instancia concreta de AbstractAIProvider.
        """
        api_key = validate_provider_and_model(provider=provider, model=model)
        prov_clean = provider.strip().lower()

        if prov_clean == "openai":
            return OpenAIProvider(model_name=model, api_key=api_key)
        elif prov_clean == "google":
            return GeminiProvider(model_name=model, api_key=api_key)
        elif prov_clean == "anthropic":
            return AnthropicProvider(model_name=model, api_key=api_key)
        elif prov_clean == "deepseek":
            return DeepSeekProvider(model_name=model, api_key=api_key)
        else:
            raise ValueError(f"Proveedor no soportado: {provider}")
