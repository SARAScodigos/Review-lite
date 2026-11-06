from fastapi import APIRouter
from app.api.routes import (
    ai_routes,
    author_routes,
    export_routes,
    extracted_record_routes,
    matrix_routes,
    pdf_routes,
    rsl_project_routes,
    search_result_file_routes,
    screening,
    screening_routes,
    synthesis_routes,
)

api_router = APIRouter()

# Registrar todos los controladores de la aplicación
api_router.include_router(author_routes.router)
api_router.include_router(rsl_project_routes.router)
api_router.include_router(search_result_file_routes.router)
api_router.include_router(extracted_record_routes.router)
api_router.include_router(screening.router)
api_router.include_router(pdf_routes.router)
api_router.include_router(matrix_routes.router)
api_router.include_router(synthesis_routes.router)
api_router.include_router(export_routes.router)
api_router.include_router(ai_routes.router)
