import os
from pathlib import Path
from typing import Optional
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


# Rutas físicas ancladas al paquete `app`, no al directorio desde el que se inició
# uvicorn o Celery. En Docker equivale a /app/app/data y en local a backend/app/data.
APP_DIRECTORY = Path(__file__).resolve().parent
DATA_DIRECTORY = APP_DIRECTORY / "data"


class Settings(BaseSettings):
    PROJECT_NAME: str = "A-Review Backend"
    API_V1_STR: str = "/api/v1"

    # PostgreSQL Database (Required from environment / .env)
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str
    POSTGRES_HOST: str
    POSTGRES_PORT: int
    DATABASE_URL: str

    # Redis & Celery
    REDIS_HOST: str
    REDIS_PORT: int
    CELERY_BROKER_URL: str
    CELERY_RESULT_BACKEND: str

    # Authentication (single user configured through .env)
    AUTH_USERNAME: str
    AUTH_PASSWORD_HASH: str
    AUTH_SECRET_KEY: str
    AUTH_TOKEN_EXPIRE_MINUTES: int = 480

    # Storage Paths
    SEARCH_RESULTS_DIR: str = str(DATA_DIRECTORY / "search_results")
    PDF_STORAGE_DIR: str = str(DATA_DIRECTORY / "pdfs")
    EXPORTS_STORAGE_DIR: str = str(DATA_DIRECTORY / "exports")
    SIGNATURES_STORAGE_DIR: str = str(DATA_DIRECTORY / "signatures")

    # APIs de Descarga de PDFs (Acceso Abierto)
    UNPAYWALL_API_BASE_URL: str = "https://api.unpaywall.org/v2"
    UNPAYWALL_EMAIL: str = "wjulcamore@gmail.com"
    SEMANTIC_SCHOLAR_API_BASE_URL: str = "https://api.semanticscholar.org/graph/v1/paper/DOI:"
    CROSSREF_API_BASE_URL: str = "https://api.crossref.org/works"

    # Claves de API de IA (Opcionales desde el archivo .env)
    OPENAI_API_KEY: Optional[str] = None
    GEMINI_API_KEY: Optional[str] = None
    CLAUDE_API_KEY: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None
    DEEPSEEK_API_KEY: Optional[str] = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
