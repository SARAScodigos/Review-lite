# Documentación del Proceso de Desduplicación (Hito 1) - A-Review Backend

Este documento detalla la arquitectura, algoritmo, flujo de datos y endpoints del **Módulo de Desduplicación por Clusters y Human-in-the-Loop** implementado en **A-Review Backend**.

---

## 1. Visión General y Objetivos

La desduplicación es la primera fase del proceso de cribado en Revisiones Sistemáticas de la Literatura (RSL). Dado que un mismo proyecto de investigación importa múltiples archivos exportados (Scopus, Web of Science, IEEE Xplore, PubMed), un artículo científico puede aparecer repetido varias veces con ligeras variaciones en sus metadatos.

### Objetivos Principales:
1. **Agrupamiento por Clusters**: Agrupar $N$ registros sospechosos en un único cluster (`duplicate_cluster_id`), en lugar de tratar únicamente pares aislados.
2. **Selección del Registro Maestro por el Usuario**: Permitir al investigador elegir explícitamente qué registro conservar como versión principal ("Ganador").
3. **Persistencia Directa en PostgreSQL**: Todos los clusters y scores de similitud se persisten en la tabla `screening_decisions` para evitar pérdida de estado.
4. **Exportación de Registros Únicos**: Endpoint especializado para descargar un reporte Excel (`.xlsx`) filtrado con los artículos únicos resultantes.

---

## 2. Niveles de Coincidencia del Algoritmo

La desduplicación se ejecuta asíncronamente en segundo plano a través de **Celery** (`run_deduplication_task`) procesando 3 niveles concéntricos:

```text
[ Registros Extraídos del Proyecto ]
                 │
                 ├──► Nivel 1: Coincidencia Exacta por DOI (Normalizado)
                 │      - Ignora prefijos ("https://doi.org/"), mayúsculas/minúsculas.
                 │      - Coincidencia = 100% (EXACT_DOI).
                 │
                 ├──► Nivel 2: Coincidencia Exacta por Título Normalizado
                 │      - Remueve puntuación, acentos y espacios extra.
                 │      - Coincidencia = 100% (EXACT_TITLE).
                 │
                 └──► Nivel 3: Comparación Difusa (Fuzzy Matching)
                        - Utiliza SequenceMatcher en títulos normalizados.
                        - Umbral mínimo de agrupación: Similitud >= 75%.
```

### Reglas de Clasificación Automática vs Human-in-the-Loop:

| Porcentaje de Similitud | Estado asignado (`duplicate_review_status`) | Acción en el Sistema |
| :--- | :--- | :--- |
| **$\ge$ 95%** | `AUTO_CONFIRMED` | Se marca automáticamente el registro maestro y los duplicados en BD. |
| **75% a 94%** | `PENDING_HUMAN_REVIEW` | El cluster se envía a la cola de revisión humana para ser resuelto en la UI. |
| **< 75%** | `NOT_APPLICABLE` | Se considera un artículo único. |

---

## 3. Estado de los Registros tras la Resolución

Para un cluster de $N$ artículos en conflicto:

* **1 Registro Ganador (Maestro)**:
  * `is_duplicate` = `False`
  * `duplicate_of_id` = `None`
  * `duplicate_review_status` = `HUMAN_RESOLVED_UNIQUE` (o `AUTO_CONFIRMED`)
  * `duplicate_cluster_id` = `"cluster-uuid-xyz"` (Mantiene trazabilidad)
* **$N - 1$ Registros Perdedores (Duplicados)**:
  * `is_duplicate` = `True`
  * `duplicate_of_id` = `UUID_DEL_REGISTRO_GANADOR`
  * `duplicate_review_status` = `HUMAN_RESOLVED_DUPLICATE` (o `AUTO_CONFIRMED`)
  * `duplicate_cluster_id` = `"cluster-uuid-xyz"`

---

## 4. Endpoints HTTP Expuestos (`/api/v1/projects/{project_id}/screening`)

### 4.1. Consultar Estado de la Sesión PRISMA
* **`GET /session`**
* Devuelve el estado global (`IDLE`, `PROCESSING_DUPLICATES`, `AWAITING_DUPLICATE_REVIEW`) y contadores actualizados del Diagrama PRISMA 2020 (`total_initial_records`, `duplicate_records_count`, `unique_records_count`).

### 4.2. Iniciar Desduplicación Asíncrona
* **`POST /deduplicate`**
* Encola la tarea en Celery. Acepta el body opcional `{"force_rerun": true}` para reiniciar las decisiones y re-ejecutar el algoritmo desde cero.

### 4.3. Obtener Clusters Pendientes por Revisar
* **`GET /duplicates/pending`**
* Retorna la lista de clusters que tienen estado `PENDING_HUMAN_REVIEW`. Incluye para cada registro del cluster:
  * ID del registro, Título, DOI, Autores, Año, Journal, Abstract disponible.
  * Metadatos del archivo de origen: `file_id`, `file_name` y `database_source` (ej. Scopus, Web of Science, IEEE).

### 4.4. Resumen de Desduplicación por Fuente
* **`GET /duplicates/summary`**
* Retorna los conteos actuales de desduplicación del proyecto, incluyendo totales globales y desglose por la fuente bibliográfica (`database_source`) registrada al importar cada CSV/Excel.
* Los registros con `is_duplicate == True` se cuentan como duplicados. Los demás se cuentan como únicos actuales, incluidos los registros aún pendientes de revisión humana.
* **Respuesta ejemplo**:
  ```json
  {
    "project_id": "39624e8b-ca9a-4e55-bf94-16a6a6513967",
    "session_status": "AWAITING_DUPLICATE_REVIEW",
    "total_records": 210,
    "unique_records": 185,
    "duplicate_records": 25,
    "pending_review_records": 8,
    "by_database_source": [
      {
        "database_source": "Scopus",
        "total_records": 123,
        "unique_records": 110,
        "duplicate_records": 13,
        "pending_review_records": 3
      },
      {
        "database_source": "WOS",
        "total_records": 87,
        "unique_records": 75,
        "duplicate_records": 12,
        "pending_review_records": 5
      }
    ]
  }
  ```

### 4.5. Resolver Cluster Manualmente
* **`POST /duplicates/resolve-cluster`**
* Payload:
  ```json
  {
    "cluster_id": "cluster-uuid-xyz",
    "selected_master_record_id": "record-uuid-elegido",
    "action": "CONFIRM_DUPLICATES"
  }
  ```
* Aplica la decisión del usuario en PostgreSQL y actualiza las métricas PRISMA.

### 4.6. Listar Registros Únicos Paginados
* **`GET /duplicates/unique-records?skip=0&limit=100`**
* Retorna los registros únicos actuales del proyecto con paginación y con la fuente bibliográfica (`database_source`) del archivo importado.
* Si aún no existe una ejecución de desduplicación con decisiones guardadas, todos los registros importados del proyecto se devuelven como únicos actuales.
* **Parámetros Query**:
  * `skip`: cantidad de registros únicos a omitir, por defecto `0`.
  * `limit`: cantidad máxima de registros devueltos, por defecto `100`, máximo `500`.
* **Respuesta ejemplo**:
  ```json
  {
    "items": [
      {
        "record_id": "2d2b2d53-9331-4332-ac9e-7cf56ccc4467",
        "file_id": "5d27581c-4146-45e3-8a17-e13e1980fa37",
        "database_source": "Scopus",
        "id_article": "MACHIDRAL",
        "title": "Machine Learning in Healthcare",
        "authors": "Dr. Alice, Dr. Bob",
        "publication_year": 2026,
        "doi": "10.1000/async.1",
        "source_title": "Journal of Medical AI",
        "abstract": "Resumen del artículo..."
      }
    ],
    "total": 185,
    "skip": 0,
    "limit": 100,
    "returned": 100,
    "has_next": true,
    "has_previous": false
  }
  ```

### 4.7. Exportación de Registros Únicos a Excel
* **`GET /export/unique-excel`**
* Genera dinámicamente un reporte Excel (`.xlsx`) utilizando `pandas` con los artículos únicos actuales (`is_duplicate == False`).
* **Nombre de Archivo Generado**: `cribado_unicos_<nombre_proyecto_rsl>.xlsx`
* **Columnas de la Hoja de Cálculo**:
  1. `id_article`: ID compuesto formado por 5 letras del título + 4 de los autores (ej. `ARTICPERE`).
  2. `base_datos`: Fuente bibliográfica registrada al importar el archivo (`database_source`, ej. Scopus, WOS, PubMed).
  3. `titulo`: Título del artículo.
  4. `autores`: Cadena de autores.
  5. `año_publicacion`: Año de publicación.
  6. `doi`: Identificador DOI.
  7. `journal`: Título de la revista o conferencia fuente (`source_title`).
