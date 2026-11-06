# Documentación del Módulo de Extracción de Resultados de Búsqueda y Procesamiento Asíncrono

Este documento describe la arquitectura, modelos de datos, funcionamiento de la minifábrica de parsers y el flujo asíncrono con **Celery** y **Redis** para la subida y procesamiento masivo de archivos de búsqueda (`.csv`, `.xls`, `.xlsx`).

---

## 1. 📐 Modelos de Datos

### A. Archivos de Búsqueda (`search_result_files`)
Representa cada reporte o exportación física descargada desde bases de datos científicas (Scopus, Web of Science, PubMed, IEEE, etc.).

| Campo | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | `UUID` (PK) | Identificador único v4 del archivo. |
| `project_id` | `UUID` (FK) | Relación obligatoria con `rsl_projects.id` (`CASCADE`). |
| `nombre` | `VARCHAR` | Nombre referencial del archivo. |
| `file_path` | `VARCHAR` | Ruta física en disco dentro de `app/data/search_results/`. |
| `database_source` | `VARCHAR` | Base de datos de origen (Scopus, WOS, PubMed, etc.). |
| `search_equation` | `VARCHAR` | Ecuación de búsqueda ejecutada para generar la exportación. |
| `notes` | `VARCHAR` | Observaciones opcionales sobre la búsqueda. |
| `total_records` | `INT` | Total de artículos reportados/extraídos. |
| `file_type` | `VARCHAR` | Extensión/formato (`csv`, `xls`, `xlsx`). |
| `created_at` / `updated_at` | `TIMESTAMP` | Timestamps de registro y actualización. |

---

### B. Registros Extraídos (`extracted_records`)
Almacena cada artículo/fila contenida dentro del archivo exportado.

| Campo | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | `UUID` (PK) | Identificador único v4 del registro. |
| `file_id` | `UUID` (FK) | Relación obligatoria con `search_result_files.id` (`CASCADE`). |
| `title` | `VARCHAR` (Index) | Título estandarizado de la publicación. |
| `authors` | `VARCHAR` | Cadena con los nombres de los autores. |
| `publication_year` | `INT` (Index) | Año de publicación. |
| `doi` | `VARCHAR` (Index) | Identificador digital de la publicación (DOI). |
| `source_title` | `VARCHAR` | Nombre de la revista, libro o conferencia fuente. |
| `abstract` | `VARCHAR` | Resumen / Abstract del artículo. |
| `raw_data` | `JSONB` | **Almacenamiento del 100% de las columnas originales** de la fila en formato clave-valor sin pérdida de metadatos. |
| `created_at` / `updated_at` | `TIMESTAMP` | Timestamps de creación e inserción. |

> **Nota de Cascada**: Al eliminar un registro en `search_result_files`, PostgreSQL elimina automáticamente todas sus filas hijas asociadas en `extracted_records` mediante la regla `ON DELETE CASCADE`.

---

## 🏭 2. Minifábrica de Parsers (`app/api/services/parsers/`)

Diseñada bajo el patrón de diseño **Factory** para procesar dinámicamente diferentes tipos de archivos tabulares:

```text
app/api/services/parsers/
├── base_parser.py        # Clase base abstracta BaseFileParser
├── csv_parser.py         # Lector CSV multi-encoding (utf-8, latin-1, cp1252)
├── excel_parser.py       # Lector Excel (.xlsx, .xls) con Pandas y openpyxl/xlrd
├── column_normalizer.py  # Mapeador de columnas heterogéneas
└── parser_factory.py     # FileParserFactory.get_parser(file_type)
```

### Normalización Inteligente de Columnas
El módulo `column_normalizer.py` analiza los encabezados de diferentes fuentes (Scopus, WOS, PubMed) y extrae los atributos principales para indexación rápida en PostgreSQL, mientras preserva todo el diccionario de campos dentro de `raw_data` (`JSONB`).

---

## ⚡ 3. Procesamiento Asíncrono (FastAPI + Redis + Celery)

Para evitar bloquear el servidor web cuando se suben archivos pesados con miles de registros:

```text
1. Cliente HTTP ──(POST /search-files/{id}/extract/)──> 2. FastAPI
                                                            │
                                                            ▼ (Encola tarea)
4. Cliente HTTP <──(HTTP 202 Accepted: task_id)──────── 3. Redis (Broker)
                                                            │
                                                            ▼ (Escucha cola)
                                                       5. Celery Worker
                                                            │ (Lee disco & Bulk Insert)
                                                            ▼
                                                       6. PostgreSQL DB
```

---

## 🌐 4. Referencia de Endpoints HTTP (`/api/v1`)

### Subida y Gestión de Archivos

#### 1. Subir archivo de resultados
- **URL**: `POST /api/v1/projects/{project_id}/search-files/`
- **Content-Type**: `multipart/form-data`
- **Parámetros Form**:
  - `file`: Archivo binario (`.csv`, `.xls`, `.xlsx`) - **Obligatorio**
  - `nombre`: Nombre referencial (opcional)
  - `database_source`: Base de datos origen (ej. `Scopus`)
  - `search_equation`: Ecuación de búsqueda
  - `notes`: Notas
  - `total_records`: Entero
  - `file_type`: Formato (`csv`, `xlsx`)

#### 2. Listar archivos de un proyecto
- **URL**: `GET /api/v1/projects/{project_id}/search-files/`

#### 3. Eliminar archivo
- **URL**: `DELETE /api/v1/search-files/{file_id}`
- *Elimina el archivo del disco y los registros extraídos en cascada en la BD.*

---

### Extracción Asíncrona y Consulta de Registros

#### 4. Disparar extracción asíncrona
- **URL**: `POST /api/v1/search-files/{file_id}/extract/`
- **Respuesta (`202 Accepted`)**:
  ```json
  {
    "task_id": "7b974796-3973-4815-85eb-1806c712f7c5",
    "file_id": "5d27581c-4146-45e3-8a17-e13e1980fa37",
    "status": "PENDING",
    "message": "La tarea de extracción ha sido encolada en Redis y está siendo procesada en segundo plano por Celery."
  }
  ```

#### 5. Consultar estado de la tarea Celery
- **URL**: `GET /api/v1/tasks/{task_id}/status`
- **Respuesta**:
  ```json
  {
    "task_id": "7b974796-3973-4815-85eb-1806c712f7c5",
    "status": "SUCCESS",
    "result": {
      "status": "SUCCESS",
      "file_id": "5d27581c-4146-45e3-8a17-e13e1980fa37",
      "extracted_records_count": 250
    }
  }
  ```

#### 6. Consultar registros extraídos
- **URL**: `GET /api/v1/search-files/{file_id}/records/?skip=0&limit=100`
- **Parámetros Query**:
  - `skip`: cantidad de registros a omitir, por defecto `0`.
  - `limit`: cantidad máxima de registros devueltos, por defecto `100`, máximo `500`.
- **Respuesta**:
  ```json
  {
    "items": [
      {
        "id": "2d2b2d53-9331-4332-ac9e-7cf56ccc4467",
        "file_id": "5d27581c-4146-45e3-8a17-e13e1980fa37",
        "title": "Machine Learning in Healthcare",
        "authors": "Dr. Alice, Dr. Bob",
        "publication_year": 2026,
        "doi": "10.1000/async.1",
        "source_title": "Journal of Medical AI",
        "abstract": "Extracted by Celery worker via Redis.",
        "raw_data": {
          "DOI": "10.1000/async.1",
          "Year": 2026,
          "Title": "Machine Learning in Healthcare"
        },
        "created_at": "2026-08-08T04:40:07.028924",
        "updated_at": "2026-08-08T04:40:07.028924"
      }
    ],
    "total": 250,
    "skip": 0,
    "limit": 100,
    "returned": 100,
    "has_next": true,
    "has_previous": false
  }
  ```
