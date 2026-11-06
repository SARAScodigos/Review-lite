# Documentación del Motor de Inteligencia Artificial (AI Engine) - A-Review Backend

Este documento describe la arquitectura de software Orientada a Objetos (POO), los patrones de diseño, las clases, los adaptadores de proveedores y los endpoints de la API REST del **Motor de Inteligencia Artificial** ubicado en [`app/ai/`](file:///home/sarah/Proyectos-2025/areview/backend/app/ai/).

---

## 1. Visión General del Motor de IA

El backend de **A-Review** cuenta con un motor agnóstico de IA diseñado bajo el **Patrón Factory + Strategy**. Permite alternar dinámicamente entre diferentes proveedores de modelos de lenguaje (LLM) y evaluar la eficiencia, costo, latencia y precisión de cada modelo durante las distintas etapas de la Revisión Sistemática de la Literatura (Cribado de Título, Abstract, Parseo de PDFs y Matriz de Extracción).

---

## 2. Estructura de Archivos y Responsabilidades

```text
app/
├── config.py                  # Lectura de claves API (OPENAI_API_KEY, GEMINI_API_KEY, etc.)
└── ai/
    ├── __init__.py            # Exportaciones públicas del paquete ai
    ├── catalog.py             # Registro de modelos por proveedor y reglas de seguridad
    ├── base.py                # Clase Abstracta Base (AbstractAIProvider)
    ├── factory.py             # Fábrica de instanciación polimórfica (AIEngineFactory)
    └── providers/
        ├── __init__.py        # Re-exportación de adaptadores concretos
        ├── openai_provider.py # Adaptador REST para OpenAI API
        ├── gemini_provider.py # Adaptador REST para Google Gemini API
        ├── anthropic_provider.py # Adaptador REST para Anthropic Claude API
        └── deepseek_provider.py  # Adaptador REST para DeepSeek AI API
```

---

## 3. Catálogo de Proveedores y Modelos Soportados

El motor incluye un registro oficial (`AI_CATALOG`) con los modelos habilitados por compañía y sus costos de referencia por millón de tokens:

| Proveedor (`provider`) | Nombre Comercial | Variable `.env` | Modelos Soportados (`model`) |
| :--- | :--- | :--- | :--- |
| **`openai`** | OpenAI | `OPENAI_API_KEY` | `gpt-5.6-luna`, `gpt-5.6-terra`, `gpt-5.6-sol` |
| **`google`** | Google Gemini | `GEMINI_API_KEY` | `gemini-3.1-flash-lite`, `gemini-3.5-flash-lite`, `gemini-3.6-flash` |
| **`anthropic`** | Anthropic Claude | `CLAUDE_API_KEY` / `ANTHROPIC_API_KEY` | `claude-haiku-4-5`, `claude-sonnet-5`, `claude-opus-5`, `claude-fable-5` |
| **`deepseek`** | DeepSeek AI | `DEEPSEEK_API_KEY` | `deepseek-v4-flash` (predeterminado para cribado) |

---

## 4. Diseño Orientado a Objetos (POO)

### 4.1. Clase Abstracta Base: [`AbstractAIProvider`](file:///home/sarah/Proyectos-2025/areview/backend/app/ai/base.py)
Define la interfaz uniforme y polimórfica para todos los adaptadores:

```python
class AbstractAIProvider(ABC):
    def __init__(self, model_name: str, api_key: str):
        self.model_name = model_name
        self.api_key = api_key

    @abstractmethod
    def generate_text(self, prompt: str, system_instruction: Optional[str] = None, temperature: float = 0.2) -> str:
        """Genera una respuesta en texto plano."""
        pass

    @abstractmethod
    def generate_structured(self, prompt: str, schema: Type[T], system_instruction: Optional[str] = None, temperature: float = 0.1) -> T:
        """Genera una respuesta estructurada validada contra un modelo Pydantic."""
        pass
```

### 4.2. Fábrica: [`AIEngineFactory`](file:///home/sarah/Proyectos-2025/areview/backend/app/ai/factory.py)
Encapsula la lógica de instanciación y aplica las reglas de seguridad antes de devolver el proveedor:

```python
provider_instance = AIEngineFactory.get_provider(provider="deepseek", model="deepseek-v4-flash")
```

---

## 5. Validaciones y Reglas de Seguridad

1. **Match Estricto Proveedor $\leftrightarrow$ Modelo**:
   * Si una petición solicita `provider="openai"` y `model="deepseek-v4-flash"`, `AIEngineFactory` lanza una excepción HTTP 400 impidiendo la ejecución cruzada errónea.
2. **Verificación de API Key**:
   * Valida automáticamente que la clave de API configurada en `.env` no esté vacía. De estar ausente, notifica exactamente qué variable configurar.

---

## 6. Endpoints de la API REST (`/api/v1/ai`)

### 6.1. Obtener Catálogo de Modelos y Estado de Configuración
* **`GET /api/v1/ai/models`**
* **Respuesta**:
```json
[
  {
    "provider": "deepseek",
    "display_name": "DeepSeek AI",
    "is_configured": true,
    "models": [
      {
        "id": "deepseek-v4-flash",
        "name": "DeepSeek V4 Flash",
        "pricing_per_million_tokens": {"input_usd": 0.14, "output_usd": 0.28, "total_usd": 0.42},
        "is_default_for_screening": true
      }
    ]
  }
]
```

* **`GET /api/v1/ai/models/screening-default`**: consulta el proveedor y modelo que se aplican cuando los endpoints de título o abstract no reciben estos campos.
```json
{
  "provider": "deepseek",
  "model": "deepseek-v4-flash"
}
```

### 6.2. Probar Completado de IA (Test Endpoint)
* **`POST /api/v1/ai/test`**
* **Payload de petición**:
```json
{
  "provider": "deepseek",
  "model": "deepseek-v4-flash",
  "prompt": "Explica en 2 oraciones qué es el cribado de literatura científica.",
  "temperature": 0.2
}
```
* **Respuesta**:
```json
{
  "provider": "deepseek",
  "model": "deepseek-v4-flash",
  "response_text": "El cribado de literatura científica es el proceso de selección..."
}
```

---

## 7. Ejemplo de Uso en Servicios Internos (Para Desarrolladores)

Para usar cualquier modelo en los servicios de cribado por Título, Abstract o Extracción:

```python
from pydantic import BaseModel
from app.ai import AIEngineFactory

class TitleScreeningResult(BaseModel):
    decision: str  # INCLUDED, EXCLUDED
    reasoning: str

# Instanciar proveedor elegido por el usuario en la petición
ai_provider = AIEngineFactory.get_provider(provider="anthropic", model="claude-sonnet-5")

# Invocación estructurada polimórfica
result: TitleScreeningResult = ai_provider.generate_structured(
    prompt="Título: Deep Learning for Systematic Reviews...",
    schema=TitleScreeningResult,
    system_instruction="Eres un evaluador científico experto..."
)

print(result.decision)   # "INCLUDED"
print(result.reasoning)  # "El artículo propone un algoritmo directamente relacionado..."
```
