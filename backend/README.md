# A-Review Backend (FastAPI + SQLModel)

Backend modular desarrollado en Python con **FastAPI**, **SQLModel** y **PostgreSQL** para la gestión de Revisiones Sistemáticas de la Literatura (RSL).

---

## 🛠️ Stack Tecnológico

- **Framework Web**: [FastAPI](https://fastapi.tiangolo.com/) (Python 3.11)
- **ORM / Validaciones**: [SQLModel](https://sqlmodel.tiangolo.com/) (SQLAlchemy 2.0 + Pydantic v2)
- **Migraciones DB**: [Alembic](https://alembic.sqlalchemy.org/)
- **Base de Datos**: PostgreSQL 16 con soporte `pgvector`
- **Tareas Asíncronas**: Celery + Redis 7
- **Entorno de Ejecución**: Docker Compose

---

## 🐳 Funcionamiento de Contenedores en el Servidor

La aplicación se ejecuta mediante 5 servicios orquestados en `docker-compose.yaml`:

1. **`areview_back` (API FastAPI)**:
   - **Comando**: `uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`
   - **Puerto expuesto**: `8003` (Host) -> `8000` (Contenedor).
   - **Función**: Servidor web principal que atiende las peticiones HTTP RESTful.

2. **`areview_db` (Base de Datos)**:
   - **Imagen**: `pgvector/pgvector:pg16`
   - **Puerto expuesto**: `5432:5432`
   - **Función**: Almacenamiento relacional y vectorial. Guarda los datos en el volumen persistente `postgres_data`.

3. **`areview_migrations` (Migraciones Automáticas)**:
   - **Comando**: `alembic upgrade head`
   - **Función**: Contenedor efímero que espera a que la BD esté saludable (`service_healthy`), aplica los scripts pendientes en `migrations/versions/` y finaliza automáticamente.

4. **`areview_redis` (Broker de Mensajes)**:
   - **Imagen**: `redis:7-alpine`
   - **Puerto expuesto**: `6379:6379`
   - **Función**: Canal de comunicación en memoria para encolar tareas asíncronas de Celery.

5. **`areview_celery` (Worker de Tareas)**:
   - **Comando**: `celery -A app.workers.celery_app worker --loglevel=info`
   - **Función**: Proceso en segundo plano que consume y ejecuta tareas pesadas enviadas desde la API.

---

## 🔄 Ciclo de Vida de una Petición HTTP

```text
Cliente (Browser / Frontend / Curl)
       │
       │  (HTTP POST/GET en puerto 8003)
       ▼
Uvicorn (Servidor ASGI en app.main:app)
       │
       ▼
FastAPI Routes (app/api/routes/)
  ├── Valida la estructura del JSON con Pydantic Schemas (app/api/schemas/)
  └── Obtiene la sesión de BD inyectada por Depends(get_session)
       │
       ▼
Service Layer (app/api/services/)
  └── Ejecuta la lógica de negocio y operaciones relacionales
       │
       ▼
SQLModel Engine (app/db/session.py)
  └── Traduce los objetos Python a consultas SQL nativas
       │
       ▼
PostgreSQL (Contenedor areview_db)
```

---

## 📂 Estructura de Código en el Proyecto

```text
backend/
├── app/
│   ├── main.py                   # Registro de rutas /api/v1 y middleware FastAPI
│   ├── config.py                 # Lectura y validación de variables de entorno (.env)
│   ├── db/
│   │   └── session.py            # Creación del engine SQLAlchemy/SQLModel y get_session()
│   ├── api/
│   │   ├── models/               # Tablas físicas de PostgreSQL (RSLProject, Author, Link)
│   │   ├── schemas/              # DTOs de Pydantic para validar entradas y formatear salidas JSON
│   │   ├── services/             # Lógica de operaciones CRUD y consultas SQL
│   │   └── routes/               # Endpoints HTTP expuestos (/projects, /authors)
│   └── workers/                  # Tareas en segundo plano de Celery
├── migrations/                   # Control de versiones DDL con Alembic
│   ├── versions/                 # Archivos de migración generados
│   └── env.py                    # Script de conexión de Alembic a SQLModel
├── docker-compose.yaml           # Orquestación de servicios en el servidor
├── Dockerfile                    # Construcción de la imagen Python de la app
└── req.txt                       # Librerías de Python instaladas
```

---

#### 🏭 Estructura Sugerida para la Minifábrica de Parser (parsers/):                                                                       
                                                                                                                                              
    app/api/services/parsers/                                                                                                                 
    ├── base_parser.py           # Clase abstracta BaseFileParser (definir método parse)                                                      
    ├── csv_parser.py            # Parser con Pandas/csv (soporte encodings utf-8, latin-1, etc.)                                             
    ├── excel_parser.py          # Parser con Pandas + openpyxl/xlrd (.xlsx, .xls)
    ├── column_normalizer.py     # Mapeador de columnas ("Document Title", "Article Title" -> title)
    └── parser_factory.py        # FileParserFactory.get_parser(file_type)

## 🚀 Comandos Rápidos de Uso

- **Iniciar todo el sistema en segundo plano**:
  ```bash
  docker compose up -d --build
  ```

- **Ver registros de la API FastAPI**:
  ```bash
  docker compose logs -f areview_back
  ```

- **Generar una nueva migración cuando modifiques un modelo**:
  ```bash
  docker compose exec -T areview_back alembic revision --autogenerate -m "descripcion"
  ```

- **Aplicar la migración a PostgreSQL**:
  ```bash
  docker compose exec -T areview_back alembic upgrade head
  ```

- **Documentación Interactiva (Swagger UI)**:
  - `http://localhost:8003/docs`
