"""
Paquete de controladores de rutas HTTP para el módulo de Screening y PRISMA.
Agrupa los sub-routers de Sesión/PRISMA, Desduplicación, Título, Abstract y Corrección Manual.
"""
from fastapi import APIRouter

from app.api.routes.screening.abstract_screening_routes import router as abstract_screening_router
from app.api.routes.screening.deduplication_routes import router as deduplication_router
from app.api.routes.screening.override_routes import router as override_router
from app.api.routes.screening.session_routes import router as session_router
from app.api.routes.screening.title_screening_routes import router as title_screening_router

router = APIRouter(
    prefix="/projects/{project_id}/screening",
    tags=["Screening & PRISMA"],
)

router.include_router(session_router)
router.include_router(deduplication_router)
router.include_router(title_screening_router)
router.include_router(abstract_screening_router)
router.include_router(override_router)

__all__ = ["router"]
