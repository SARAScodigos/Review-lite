"""
Adaptador del proveedor DeepSeek AI (DeepSeek V3, DeepSeek R1).
"""
import json
from typing import Optional, Type, TypeVar
from fastapi import HTTPException, status
import httpx
from pydantic import BaseModel

from app.ai.base import AbstractAIProvider

T = TypeVar("T", bound=BaseModel)


class DeepSeekProvider(AbstractAIProvider):
    """Implementación de AbstractAIProvider para la API compatible de DeepSeek."""

    BASE_URL = "https://api.deepseek.com/chat/completions"

    def generate_text(
        self,
        prompt: str,
        system_instruction: Optional[str] = None,
        temperature: float = 0.2,
    ) -> str:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": self.model_name,
            "messages": messages,
            "temperature": temperature,
        }

        try:
            with httpx.Client(timeout=90.0) as client:
                response = client.post(self.BASE_URL, headers=headers, json=payload)

            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Error en DeepSeek API ({response.status_code}): {response.text}",
                )

            data = response.json()
            return data["choices"][0]["message"]["content"].strip()
        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Fallo de conexión con DeepSeek API: {str(e)}",
            )

    def generate_structured(
        self,
        prompt: str,
        schema: Type[T],
        system_instruction: Optional[str] = None,
        temperature: float = 0.1,
    ) -> T:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        json_instruction = (
            f"Debes responder ÚNICAMENTE con un objeto JSON válido según este esquema Pydantic: "
            f"{json.dumps(schema.model_json_schema())}. Sin texto ni explicaciones adicionales."
        )

        full_system = f"{system_instruction}\n\n{json_instruction}" if system_instruction else json_instruction

        messages = [
            {"role": "system", "content": full_system},
            {"role": "user", "content": prompt},
        ]

        payload = {
            "model": self.model_name,
            "messages": messages,
            "temperature": temperature,
            "response_format": {"type": "json_object"},
        }

        try:
            with httpx.Client(timeout=90.0) as client:
                response = client.post(self.BASE_URL, headers=headers, json=payload)

            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Error en DeepSeek API ({response.status_code}): {response.text}",
                )

            data = response.json()
            content = data["choices"][0]["message"]["content"].strip()
            return schema.model_validate_json(content)
        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Error al validar respuesta estructurada de DeepSeek: {str(e)}",
            )
