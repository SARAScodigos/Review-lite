"""
Adaptador del proveedor Google Gemini (Gemini 2.0 Flash, 1.5 Flash, 1.5 Pro).
"""
import json
from typing import Optional, Type, TypeVar
from fastapi import HTTPException, status
import httpx
from pydantic import BaseModel

from app.ai.base import AbstractAIProvider

T = TypeVar("T", bound=BaseModel)


class GeminiProvider(AbstractAIProvider):
    """Implementación de AbstractAIProvider para la API REST de Google Gemini."""

    def _get_url() -> str:
        return f"https://generativelanguage.googleapis.com/v1beta/models/{self.model_name}:generateContent?key={self.api_key}"

    def generate_text(
        self,
        prompt: str,
        system_instruction: Optional[str] = None,
        temperature: float = 0.2,
    ) -> str:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model_name}:generateContent?key={self.api_key}"
        headers = {"Content-Type": "application/json"}

        contents = [{"parts": [{"text": prompt}]}]
        payload = {
            "contents": contents,
            "generationConfig": {"temperature": temperature},
        }

        if system_instruction:
            payload["systemInstruction"] = {"parts": [{"text": system_instruction}]}

        try:
            with httpx.Client(timeout=60.0) as client:
                response = client.post(url, headers=headers, json=payload)

            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Error en Gemini API ({response.status_code}): {response.text}",
                )

            data = response.json()
            candidates = data.get("candidates", [])
            if not candidates:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Gemini API no devolvió candidatos válidos.",
                )

            parts = candidates[0].get("content", {}).get("parts", [])
            if not parts:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Respuesta vacía de Gemini API.",
                )

            return parts[0]["text"].strip()
        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Fallo de conexión con Gemini API: {str(e)}",
            )

    def generate_structured(
        self,
        prompt: str,
        schema: Type[T],
        system_instruction: Optional[str] = None,
        temperature: float = 0.1,
    ) -> T:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model_name}:generateContent?key={self.api_key}"
        headers = {"Content-Type": "application/json"}

        json_instruction = (
            f"Debes responder ÚNICAMENTE con un objeto JSON estructurado válido según el esquema: "
            f"{json.dumps(schema.model_json_schema())}. Sin bloques ```json ni texto adicional."
        )

        full_system = f"{system_instruction}\n\n{json_instruction}" if system_instruction else json_instruction

        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "systemInstruction": {"parts": [{"text": full_system}]},
            "generationConfig": {
                "temperature": temperature,
                "responseMimeType": "application/json",
            },
        }

        try:
            with httpx.Client(timeout=60.0) as client:
                response = client.post(url, headers=headers, json=payload)

            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Error en Gemini API ({response.status_code}): {response.text}",
                )

            data = response.json()
            candidates = data.get("candidates", [])
            if not candidates:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Gemini API no devolvió candidatos válidos.",
                )

            parts = candidates[0].get("content", {}).get("parts", [])
            if not parts:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Respuesta estructurada vacía de Gemini API.",
                )

            text_content = parts[0]["text"].strip()
            # Limpiar bloques ```json si los incluyera por error
            if text_content.startswith("```json"):
                text_content = text_content[7:]
            if text_content.endswith("```"):
                text_content = text_content[:-3]

            return schema.model_validate_json(text_content.strip())
        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Error al validar respuesta estructurada de Gemini: {str(e)}",
            )
