"""
Módulo alias para mantener compatibilidad hacia atrás.
Redirige al nuevo paquete modular app.api.routes.screening.
"""
from app.api.routes.screening import router

__all__ = ["router"]
