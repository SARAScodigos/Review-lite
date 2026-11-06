from typing import Generator
from sqlmodel import create_engine, Session
from app.config import settings

# Engine de SQLModel / SQLAlchemy
engine = create_engine(
    settings.DATABASE_URL,
    echo=True,
    pool_pre_ping=True,
)


def get_session() -> Generator[Session, None, None]:
    """
    Inyector de dependencias de FastAPI para obtener una sesión de base de datos.
    Asegura que la sesión se cierre automáticamente al terminar la solicitud.
    """
    with Session(engine) as session:
        yield session
