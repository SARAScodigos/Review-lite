"""
Adaptador del proveedor Anthropic (Claude 3.5 Sonnet, 3.5 Haiku, 3 Opus).
"""
import json
from typing import Optional, Type, TypeVar
from fastapi import HTTPException, status
import httpx
from pydantic import BaseModel

from app.ai.base import AbstractAIProvider

T = TypeVar("T", bound=BaseModel)


class AnthropicProvider(AbstractAIProvider):
    """Implementación de AbstractAIProvider para la API de Anthropic Claude."""

    BASE_URL = "https://api.anthropic.com/v1/messages"

    @staticmethod
    def _extract_text_content(data: dict) -> str:
        """Obtiene el bloque textual aunque Claude devuelva bloques de razonamiento antes."""
        content_blocks = data.get("content", [])
        for block in content_blocks:
            if block.get("type") == "text" and isinstance(block.get("text"), str):
                return block["text"].strip()

        block_types = [block.get("type", "unknown") for block in content_blocks]
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                "Anthropic API no devolvió un bloque de texto utilizable. "
                f"Tipos recibidos: {block_types}."
            ),
        )

    def generate_text(
        self,
        prompt: str,
        system_instruction: Optional[str] = None,
        temperature: float = 0.2,
    ) -> str:
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }

        payload = {
            "model": self.model_name,
            "max_tokens": 4096,
            "temperature": temperature,
            "messages": [{"role": "user", "content": prompt}],
        }

        if system_instruction:
            payload["system"] = system_instruction

        try:
            with httpx.Client(timeout=60.0) as client:
                response = client.post(self.BASE_URL, headers=headers, json=payload)

            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Error en Anthropic API ({response.status_code}): {response.text}",
                )

            data = response.json()
            return self._extract_text_content(data)
        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Fallo de conexión con Anthropic API: {str(e)}",
            )

    def generate_structured(
        self,
        prompt: str,
        schema: Type[T],
        system_instruction: Optional[str] = None,
        temperature: float = 0.1,
    ) -> T:
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }

        json_instruction = (
            f"Debes responder ÚNICAMENTE con un objeto JSON estructurado válido según el esquema Pydantic: "
            f"{json.dumps(schema.model_json_schema())}. Tu respuesta debe comenzar con {{ y terminar con }}. "
            f"Sin bloques de código markdown ni texto aclaratorio previo o posterior."
        )

        full_system = f"{system_instruction}\n\n{json_instruction}" if system_instruction else json_instruction

        payload = {
            "model": self.model_name,
            "max_tokens": 4096,
            "temperature": temperature,
            "system": full_system,
            "messages": [{"role": "user", "content": prompt}],
        }

        try:
            with httpx.Client(timeout=60.0) as client:
                response = client.post(self.BASE_URL, headers=headers, json=payload)

            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Error en Anthropic API ({response.status_code}): {response.text}",
                )

            data = response.json()
            text_content = self._extract_text_content(data)
            if text_content.startswith("```json"):
                text_content = text_content[7:]
            if text_content.startswith("```"):
                text_content = text_content[3:]
            if text_content.endswith("```"):
                text_content = text_content[:-3]

            return schema.model_validate_json(text_content.strip())
        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Error al validar respuesta estructurada de Anthropic: {str(e)}",
            )
