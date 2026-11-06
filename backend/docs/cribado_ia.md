# Documentación del Módulo de Cribado por Título y Abstract impulsado por IA (Hito 2) - A-Review Backend

Este documento describe la arquitectura, flujo de trabajo, prompts automáticos y controladores HTTP del **Módulo de Cribado Asistido por Inteligencia Artificial (Hito 2)** en **A-Review Backend**.

---

## 1. Visión General

El Hito 2 evalúa los artículos únicos que superaron la desduplicación del Hito 1 mediante un embudo de 2 fases:

1. **Fase 1: Cribado por Título**: Evaluación rápida de la relevancia del título frente al contexto del proyecto RSL.
2. **Fase 2: Cribado por Abstract**: Evaluación profunda de la metodología y contenido del resumen sobre los artículos aprobados o dudosos en título (`INCLUDED` o `MAYBE`).

Ambas fases funcionan de forma **asíncrona en Celery**, soportan **cualquier proveedor de IA** (`google`, `openai`, `anthropic`, `deepseek`) y permiten al investigador **sobrescribir manualmente** cualquier decisión tomada por el modelo.

Cuando no se envían `provider` ni `model`, ambas fases usan `deepseek/deepseek-v4-flash` (**DeepSeek V4 Flash**), la opción económica predeterminada para cribado. El usuario puede enviar cualquier combinación válida del catálogo para sustituirla.

---

## 2. Gatekeepers, Concurrencia e Integridad de Datos

* **Procesamiento por Lotes (Batching)**: Evalúa 15 títulos o 10 resúmenes por petición a la IA en lugar de hacer peticiones individuales. Reduce hasta **85%-90% los tokens de entrada** y abarata el costo.
* **Concurrencia Multihilo (ThreadPoolExecutor)**: Ejecuta hasta 5 lotes simultáneos en paralelo (`max_workers=5`).
* **Reserva Atómica `EVALUATING` ("Revisando en IA")**: Antes de enviar cada lote al proveedor de IA, marca atómicamente los artículos con `title_status = EVALUATING` (o `abstract_status = EVALUATING`) para prevenir condiciones de carrera y proteger el lote.
* **Control de Fallos y Límite de 3 Reintentos**: Si una petición a la IA falla, reintenta hasta 3 veces. De persistir el fallo, resetea automáticamente el lote de `EVALUATING` a `PENDING` para reintentarse sin perder ningún artículo.
* **Gatekeepers de Integridad**:
  * *Para Título*: Exige que la desduplicación (Hito 1) esté 100% resuelta sin clusters pendientes.
  * *Para Abstract*: Exige que la fase de cribado por título se haya ejecutado previamente.

---

## 3. Prompts Científicos Automáticos

El sistema construye automáticamente el contexto para el LLM combinando:
* Las variables de estudio y ámbito geográfico definidas en [`RSLProject`](file:///home/sarah/Proyectos-2025/areview/backend/app/api/models/rsl_project_model.py#L36-L76).
* Los metadatos del artículo (`title`, `authors`, `source_title`, `publication_year`, `abstract`).
* Salida estructurada Pydantic estricta (`INCLUDED`, `EXCLUDED`, `MAYBE` + justificación en español por cada ítem del lote).

---

## 4. Endpoints HTTP Expuestos (`/api/v1/projects/{project_id}/screening`)

### 4.1. Cribado por Título
* **`POST /title/run`**: Dispara la tarea asíncrona en Celery.
  ```json
  {
    "provider": "deepseek",
    "model": "deepseek-v4-flash",
    "temperature": 0.2
  }
  ```
* **`GET /title/records?skip=0&limit=100`**: Mesa de trabajo paginada de todos los registros únicos disponibles para la fase de título tras la desduplicación. Sirve para ver e intervenir el proceso en sus distintos momentos: estado inicial (`PENDING`), reserva/procesamiento por IA (`EVALUATING`), decisión de IA (`INCLUDED`, `EXCLUDED`, `MAYBE`) y decisión confirmada/sobrescrita por el investigador mediante `POST /override-decision`.
  * No incluye el campo `abstract`.
  * Incluye metadatos bibliográficos (`record_id`, `file_id`, `database_source`, `id_article`, `title`, `authors`, `publication_year`, `doi`, `source_title`).
  * Incluye trazabilidad de duplicados (`is_duplicate`, `duplicate_review_status`), casilla de filtro (`passes_title_filter`), decisión de título (`title_status`, `title_reason`) y marca de intervención manual (`title_overridden`).
  * Respuesta paginada:
    ```json
    {
      "items": [
        {
          "record_id": "uuid-del-articulo",
          "file_id": "uuid-del-archivo",
          "database_source": "Scopus",
          "id_article": "ARTICSMIT",
          "title": "Título del artículo",
          "authors": "Smith et al.",
          "publication_year": 2024,
          "doi": "10.0000/example",
          "source_title": "Journal Name",
          "is_duplicate": false,
          "duplicate_review_status": "NOT_APPLICABLE",
          "passes_title_filter": null,
          "title_status": "PENDING",
          "title_reason": null,
          "title_overridden": false
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
* **`GET /title/results`**: Consulta la lista de títulos evaluados con el estado (`INCLUDED`, `EXCLUDED`, `MAYBE`) y las razones dadas por la IA.
* **`GET /title/metrics`**: Devuelve los contadores actuales, calculados sobre los registros únicos, para los indicadores del frontend. `included_title` no incluye los registros `MAYBE`.
  ```json
  {
    "total_unique": 185,
    "included_title": 45,
    "excluded_title": 140,
    "maybe_title": 0,
    "by_database_source": [
      {
        "database_source": "Scopus",
        "total_unique": 100,
        "included_title": 30,
        "excluded_title": 70,
        "maybe_title": 0
      },
      {
        "database_source": "Web of Science",
        "total_unique": 85,
        "included_title": 15,
        "excluded_title": 70,
        "maybe_title": 0
      }
    ]
  }
  ```

### 4.2. Cribado por Abstract
* **`POST /abstract/run`**: Dispara la tarea asíncrona en Celery para resúmenes.
  ```json
  {
    "provider": "deepseek",
    "model": "deepseek-v4-flash",
    "temperature": 0.2
  }
  ```
* **`GET /abstract/records?skip=0&limit=100`**: Mesa de trabajo paginada de todos los registros disponibles para cribado por abstract. Solo lista artículos únicos que pasaron o quedaron dudosos en título (`title_status` igual a `INCLUDED` o `MAYBE`), y permite revisar el estado antes/durante/después de la IA y tras la corrección manual.
  * Incluye el campo `abstract`.
  * Incluye metadatos bibliográficos (`record_id`, `file_id`, `database_source`, `id_article`, `title`, `abstract`, `authors`, `publication_year`, `doi`, `source_title`).
  * Incluye decisión previa de título (`title_status`, `title_reason`, `title_overridden`), casilla de filtro por abstract (`passes_abstract_filter`) y decisión de abstract (`abstract_status`, `abstract_reason`, `abstract_overridden`).
  * Respuesta paginada:
    ```json
    {
      "items": [
        {
          "record_id": "uuid-del-articulo",
          "file_id": "uuid-del-archivo",
          "database_source": "Web of Science",
          "id_article": "ARTICSMIT",
          "title": "Título del artículo",
          "abstract": "Resumen del artículo...",
          "authors": "Smith et al.",
          "publication_year": 2024,
          "doi": "10.0000/example",
          "source_title": "Journal Name",
          "title_status": "INCLUDED",
          "title_reason": "[deepseek-v4-flash] Justificación...",
          "title_overridden": false,
          "passes_abstract_filter": null,
          "abstract_status": "PENDING",
          "abstract_reason": null,
          "abstract_overridden": false
        }
      ],
      "total": 120,
      "skip": 0,
      "limit": 100,
      "returned": 100,
      "has_next": true,
      "has_previous": false
    }
    ```
* **`GET /abstract/results`**: Consulta los resúmenes evaluados con la fundamentación detallada de la IA.
* **`GET /abstract/metrics`**: Devuelve los contadores actuales de los registros únicos que alcanzaron la fase de abstract, con desglose por `database_source`.
  ```json
  {
    "total_unique": 45,
    "included_abstract": 20,
    "excluded_abstract": 25,
    "maybe_abstract": 0,
    "by_database_source": [
      {
        "database_source": "Scopus",
        "total_unique": 30,
        "included_abstract": 12,
        "excluded_abstract": 18,
        "maybe_abstract": 0
      }
    ]
  }
  ```

### 4.3. Corrección Manual por el Investigador (Override)
* **`POST /override-decision`**:
  ```json
  {
    "record_id": "uuid-del-articulo",
    "stage": "title",
    "new_status": "INCLUDED",
    "override_reason": "El título es metafórico pero el abstract se enfoca exactamente en el problema de estudio."
  }
  ```
* Recalcula automáticamente el número de artículos incluidos/excluidos y actualiza el **Diagrama PRISMA 2020**.

### 4.4. Cancelación Manual del Proceso
* **`POST /cancel`**:
* Revoca la tarea activa de Celery (`celery_task_id`), resetea cualquier registro en estado `EVALUATING` de vuelta a `PENDING` y restablece la sesión a `IDLE`. de la sesión.
