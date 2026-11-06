# Arquitectura de Datos y Secuencia del Proceso en A-Review Backend

Este documento describe detalladamente la arquitectura de modelos de datos en **A-Review Backend**, la justificación de la existencia de cada entidad y la secuencia del ciclo de vida de la información desde la importación inicial hasta la redacción asistida por Inteligencia Artificial.

---

## 1. Propósito del Sistema

El backend de **A-Review** está construido para orquestar la gestión automatizada y asistida por Inteligencia Artificial de **Revisiones Sistemáticas de la Literatura (RSL)** siguiendo el estándar **PRISMA 2020**.

---

## Documentación Relacionada
* [Documentación del Motor de Inteligencia Artificial (AI Engine)](file:///home/sarah/Proyectos-2025/areview/backend/docs/motor_ia.md)
* [Documentación del Módulo de Desduplicación por Clusters (Hito 1)](file:///home/sarah/Proyectos-2025/areview/backend/docs/deduplicacion.md)
* [Documentación del Módulo de Cribado por Título y Abstract con IA (Hito 2)](file:///home/sarah/Proyectos-2025/areview/backend/docs/cribado_ia.md)
* [Documentación del Módulo de Gestión y Descarga de PDFs (Hito 3)](file:///home/sarah/Proyectos-2025/areview/backend/docs/gestion_pdfs.md)
* [Documentación de la Matriz de Extracción y Texto Completo (Hito 4)](file:///home/sarah/Proyectos-2025/areview/backend/docs/matriz_extraccion.md)
* [Documentación del Módulo de Síntesis y Redacción Científica (Hito 5)](file:///home/sarah/Proyectos-2025/areview/backend/docs/sintesis_redaccion.md)
* [Documentación del Módulo de Exportación e Historial de Versiones Word (.docx)](file:///home/sarah/Proyectos-2025/areview/backend/docs/exportacion_word.md)

---

## 2. Descripción de Modelos de Base de Datos y su Justificación

### 2.1. `RSLProject` (Proyecto de Revisión Sistemática)
* **Ubicación**: [`app/api/models/rsl_project_model.py`](file:///home/sarah/Proyectos-2025/areview/backend/app/api/models/rsl_project_model.py)
* **Por qué existe**: Es la entidad principal que representa un estudio RSL. Almacena el título del estudio, las preguntas de investigación, variables analizadas, ámbito geográfico y metadatos flexibles en formato `JSONB`.
* **Conexiones de Datos**:
  * Relación `Muchos a Muchos` con `Author` (a través de `RSLProjectAuthorLink`).
  * Relación `Uno a Muchos` con `SearchResultFile` (archivos de búsqueda importados).
  * Relación `Uno a Uno` con `ScreeningSession` (sesión global de cribado y métricas PRISMA).

### 2.2. `Author` y `RSLProjectAuthorLink` (Autores del Proyecto RSL)
* **Ubicación**: [`app/api/models/author_model.py`](file:///home/sarah/Proyectos-2025/areview/backend/app/api/models/author_model.py)
* **Por qué existe**: Registra a los investigadores/autores de la revisión sistemática que administran o participan en el proyecto RSL.

### 2.3. `SearchResultFile` (Archivos de Resultados de Búsqueda)
* **Ubicación**: [`app/api/models/search_result_file_model.py`](file:///home/sarah/Proyectos-2025/areview/backend/app/api/models/search_result_file_model.py)
* **Por qué existe**: Mantiene el registro de procedencia y trazabilidad de los archivos exportados (CSV, RIS, XLS, XLSX) descargados de bases de datos científicas (Scopus, Web of Science, IEEE Xplore, PubMed, etc.). Almacena el nombre del archivo, la base de datos de origen, la ecuación de búsqueda usada y la cantidad total de registros incluidos en dicho reporte.
* **Conexiones de Datos**:
  * Pertenece a un `RSLProject` (`project_id`).
  * Posee múltiples `ExtractedRecord` (`file_id`).

### 2.4. `ExtractedRecord` (Registros Extraídos de Artículos)
* **Ubicación**: [`app/api/models/extracted_record_model.py`](file:///home/sarah/Proyectos-2025/areview/backend/app/api/models/extracted_record_model.py)
* **Por qué existe**: Representa cada artículo individual reportado en los archivos exportados. Normaliza e indexa los campos clave más comunes para búsquedas y desduplicación (`title`, `doi`, `authors`, `abstract`, `publication_year`, `source_title`) y guarda la totalidad de las columnas originales sin pérdida de información en una columna `JSONB` (`raw_data`).
* **Conexiones de Datos**:
  * Pertenece a un `SearchResultFile` (`file_id`).
  * Es referenciado por `ScreeningDecision` (`record_id` y `duplicate_of_id`).

### 2.5. `ScreeningSession` (Sesión Global de Cribado - Métricas PRISMA 2020)
* **Ubicación**: [`app/api/models/screening_model.py`](file:///home/sarah/Proyectos-2025/areview/backend/app/api/models/screening_model.py)
* **Por qué existe**: Almacena el estado global de la ejecución del cribado (IDLE, PROCESSING, COMPLETED, ERROR) y los contadores acumulados para generar dinámicamente el **Diagrama de Flujo PRISMA 2020**:
  * `total_initial_records`: Total fijo de registros extraídos de los archivos subidos.
  * `duplicate_records_count`: Total de registros identificados como duplicados.
  * `unique_records_count`: Registros únicos restantes tras eliminar duplicados.
  * Métricas de inclusión/exclusión para Título, Abstract y Texto Completo.
* **Conexiones de Datos**:
  * Vinculado `Uno a Uno` con `RSLProject` (`project_id`).
  * Posee múltiples `ScreeningDecision`.

### 2.6. `ScreeningDecision` (Decisiones y Trazabilidad por Artículo)
* **Ubicación**: [`app/api/models/screening_model.py`](file:///home/sarah/Proyectos-2025/areview/backend/app/api/models/screening_model.py)
* **Por qué existe**: Es la tabla pivot de trazabilidad por cada artículo importado. Registra el estado individual del artículo a través de cada fase del embudo de cribado:
  * **Etapa 1 (Desduplicación)**: `is_duplicate`, `duplicate_of_id` (apunta al registro maestro), metadatos de similitud (`similarity_score`, `match_reason`, `duplicate_review_status`).
  * **Etapa 2 (Cribado por Título)**: `title_status` (`PENDING`, `INCLUDED`, `EXCLUDED`), `title_reason`.
  * **Etapa 3 (Cribado por Abstract)**: `abstract_status`, `abstract_reason`.
  * **Etapa 4 (Texto Completo)**: `fulltext_status`, `fulltext_reason`.
  * **Decisión Final**: `final_decision`.
* **Conexiones de Datos**:
  * Pertenece a una `ScreeningSession` (`screening_session_id`).
  * Referencia al `ExtractedRecord` evaluado (`record_id`).
  * Opcionalmente referencia a otro `ExtractedRecord` en caso de ser marcado como duplicado (`duplicate_of_id`).

### 2.7. `ArticlePDF` (Archivos PDF y Trazabilidad de Descarga)
* **Ubicación**: [`app/api/models/article_pdf_model.py`](file:///home/sarah/Proyectos-2025/areview/backend/app/api/models/article_pdf_model.py)
* **Por qué existe**: Administra el archivo PDF físico en disco para cada artículo victorioso que superó el cribado de título y abstract. Almacena la ruta física del archivo, el estado de descarga (`PENDING_AUTO_DOWNLOAD`, `DOWNLOADED`, `PENDING_MANUAL_UPLOAD`, `MANUALLY_UPLOADED`), el hash SHA-256 de integridad, la fuente de obtención y los errores en caso de fallo de acceso abierto.
* **Conexiones de Datos**:
  * Relación `Uno a Uno` con `ExtractedRecord` (`record_id`).
  * Pertenece a un `RSLProject` (`project_id`).

---

## 3. Modelos de Extracción y Síntesis (Hitos 4 y 5)

### 3.1. `ExtractedMatrixRow` (Matriz de Extracción Desacoplada JSONB)
* **Ubicación**: [`app/api/models/extracted_matrix_model.py`](file:///home/sarah/Proyectos-2025/areview/backend/app/api/models/extracted_matrix_model.py)
* **Por qué existe**: Almacena las 18 variables estándar más variables personalizadas extraídas de cada artículo en un objeto `JSONB` flexible (`extraction_data`). Soporta tanto la generación automática desde PDF con IA como la importación manual/directa de matrices preexistentes desde CSV/Excel (`record_id = NULL`).

### 3.2. `RSLSynthesisSection` (Secciones de Síntesis y Redacción RSL)
* **Ubicación**: [`app/api/models/synthesis_model.py`](file:///home/sarah/Proyectos-2025/areview/backend/app/api/models/synthesis_model.py)
* **Por qué existe**: Administra cada capítulo del manuscrito RSL (`INTRODUCTION`, `THEORETICAL_FRAMEWORK`, `RESULTS_OBJECTIVE`, `METHODOLOGY_PRISMA`, `DISCUSSION`, `CONCLUSIONS`). Registra los candidatos elegibles, las justificaciones del porqué, las tablas sintéticas comparativas JSONB y los borradores finales en Markdown citando por ID compuesto (`[AgentJulc]`).

---

## 4. Secuencia Completa del Ciclo de Vida de los Datos

```text
[ Archivos de Búsqueda Externa (Scopus / WOS / IEEE / PubMed) ]
                               │
                               ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 1. IMPORTACIÓN DE ARCHIVOS                                             │
│    - Se registra SearchResultFile con metadatos del archivo exportado. │
│    - Se extraen y normalizan filas en ExtractedRecord (con raw_data). │
│    - Se fija total_initial_records en ScreeningSession.                │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 2. DESDUPLICACIÓN POR CLUSTERS (Hito 1)                                │
│    - Celery agrupa sospechosos en Clusters por DOI / Similitud difusa. │
│    - Muestra al usuario el nombre del archivo de origen y base de datos│
│      de cada artículo del cluster.                                     │
│    - El usuario elige en la UI cuál es el "Registro Maestro".          │
│    - Se actualiza ScreeningDecision (is_duplicate, duplicate_of_id).   │
│    - Se actualiza duplicate_records_count y unique_records_count.      │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ (Solo Registros Únicos)
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 3. CRIBADO POR TÍTULO (Hito 2 - IA)                                    │
│    - IA evalúa título vs preguntas de investigación del RSLProject.    │
│    - Registra title_status (INCLUDED / EXCLUDED) y title_reason.       │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ (Solo Aprobados / Dudosos)
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 4. CRIBADO POR ABSTRACT (Hito 2 - IA)                                  │
│    - IA evalúa abstract vs criterios de inclusión/exclusión profundos. │
│    - Registra abstract_status y abstract_reason.                       │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ (Solo Artículos Victoriosos)
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 5. DESCARGA AUTOMATIZADA DE PDFS (Hito 3)                              │
│    - Consulta APIs abiertas (Unpaywall / CrossRef / OpenAccess).      │
│    - Almacena PDF en disco y registra estado en ArticlePDF.            │
│    - Permite subida manual si la descarga automatizada falla.          │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 6. MATRIZ DE EXTRACCIÓN DINÁMICA JSONB (Hito 4)                        │
│    - IA lee el PDF y extrae variables dinámicas del proyecto a JSONB.  │
│    - ¡DESACOPLADO!: Permite a los usuarios importar matrices hechas en │
│      Excel/CSV directamente a la tabla ExtractedMatrixRow.             │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 7. MÓDULO DE SÍNTESIS Y REDACCIÓN ASISTIDA POR IA (Hito 5)             │
│    - Usuario/IA selecciona artículos candidato por sección:            │
│      * Introducción / Antecedentes                                     │
│      * Marco Teórico                                                   │
│      * Metodología                                                     │
│      * Tablas de Resultados                                            │
│      * Discusión y Conclusiones                                        │
│    - Generación de borradores científicos con contexto acotado.        │
└────────────────────────────────────────────────────────────────────────┘
```
