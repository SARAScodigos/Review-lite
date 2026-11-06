from fastapi import Depends, FastAPI

from app.api.routes.auth_routes import router as auth_router
from app.api.routes.api_router import api_router
from app.config import settings
from app.security import require_authenticated_user

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
)

# El login es público; el resto de la API requiere un token válido.
app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(
    api_router,
    prefix=settings.API_V1_STR,
    dependencies=[Depends(require_authenticated_user)],
)


@app.get("/", tags=["Health Check"])
def root():
    """Endpoint raíz para verificación de estado del servicio."""
    return {
        "message": f"Bienvenido a la API de {settings.PROJECT_NAME}",
        "docs": "/docs",
        "version": "1.0.0",
    }
