# Documentación Oficial del Módulo de Síntesis y Redacción Científica Asistida por IA (Hito 5) - A-Review Backend

Este documento constituye la especificación oficial y actualizada del **Hito 5** en **A-Review Backend**, administrando el flujo de síntesis, evaluación de elegibilidad acotada, ahorro masivo de tokens, citación por ID compuesto (`[AgentJulc]`) y generación del manuscrito RSL.

---

## 1. Modelo de Datos y Estados de Redacción

### 🏛️ Tabla PostgreSQL (`rsl_synthesis_sections`)
Ubicación del modelo: [`app/api/models/synthesis_model.py`](file:///home/sarah/Proyectos-2025/areview/backend/app/api/models/synthesis_model.py)

```python
class StatusWriting(str, Enum):
    PENDING = "PENDING"               # Estado inicial sin comenzar
    SELECTING_IDS = "SELECTING_IDS"   # Filtrado de artículos elegibles e identificación del porqué
    TRIMER_COLUMNS = "TRIMER_COLUMNS" # Recorte optimizado de columnas de la matriz
    WRITING_BY_AI = "WRITING_BY_AI"   # Redacción profunda por la IA potente
    COMPLETED = "COMPLETED"           # Borrador y tabla finalizados con éxito
    ERROR = "ERROR"                   # Error registrado durante la ejecución
```

```python
class SynthesisSectionType(str, Enum):
    INTRODUCTION = "INTRODUCTION"                     # Introducción y Antecedentes
    THEORETICAL_FRAMEWORK = "THEORETICAL_FRAMEWORK"   # Marco Teórico
    RESULTS_OBJECTIVE = "RESULTS_OBJECTIVE"           # Resultados por Objetivo (OB1, OB2, OB3...)
    METHODOLOGY_PRISMA = "METHODOLOGY_PRISMA"         # Metodología RSL / PRISMA 2020
    DISCUSSION = "DISCUSSION"                         # Discusión de Hallazgos y Brechas
    CONCLUSIONS = "CONCLUSIONS"                       # Conclusiones y Trabajos Futuros
```

---

## 2. Flujos de Redacción Especializados por Tipo de Sección

### 2.1. Introducción y Marco Teórico (Redacción por Retribución)
* **Módulo**: [`section_drafting_service.py`](file:///home/sarah/Proyectos-2025/areview/backend/app/api/services/synthesis/section_drafting_service.py)
* **Lógica**:
  * Recorta las columnas de la matriz únicamente a las requeridas:
    * *Introducción*: `[ID, Título, Introducción, Discusión]`
    * *Marco Teórico*: `[ID, Título, Introducción, Fundamentación Teórica]`
    * *Columnas Personalizadas*: El usuario puede enviar explícitamente `selected_custom_columns` si desea incluir variables de su propia matriz.
  * **Citación Obligatoria por ID**: La IA redacta en Markdown citando con el ID compuesto exacto entre corchetes o paréntesis, ej. `[AgentJulc]` o `(AgentJulc)`. Cero formatos APA o IEEE.

---

### 2.2. Resultados por Objetivo (`OB1`, `OB2`, `OB3`...) (Flujo Editable)
* **Módulo**: [`results_objective_service.py`](file:///home/sarah/Proyectos-2025/areview/backend/app/api/services/synthesis/results_objective_service.py)
* **Lógica**:
  1. **Registrar o seleccionar objetivo**: `POST /sections` con `section_type = RESULTS_OBJECTIVE`, `objective_title` y `objective_description`. Si el objetivo es nuevo se añade a `RSLProject.extra_metadata.objectives`; si existe se reutiliza.
  2. **Recomendar columnas**: `POST /sections/{section_id}/evaluate-eligibility` encola la IA y guarda la propuesta en `trimmed_columns_used`. En resultados esta ruta no selecciona IDs.
  3. **Confirmar columnas**: El investigador modifica `trimmed_columns_used` mediante `PUT /sections/{section_id}`.
  4. **Identificar IDs**: `POST /sections/{section_id}/identify-ids` usa solo las columnas confirmadas y guarda `candidate_article_ids` y `selection_justifications`.
  5. **Confirmar IDs y tabla**: El investigador ajusta IDs, justificaciones o `generated_table` mediante `PUT`.
  6. **Generar tabla y narrativa**: `POST /generate-table` construye la tabla visible; después `POST /generate-draft` redacta usando la tabla y los IDs confirmados, con citas `[ID]`. Si `generated_table` ya tiene contenido, la ruta devuelve `409`; el usuario puede editarla o regenerarla de forma explícita con `{ "force": true }`.

---

### 2.3. Metodología PRISMA 2020 (Basada en Tablas del Sistema)
* **Módulo**: [`prisma_methodology_service.py`](file:///home/sarah/Proyectos-2025/areview/backend/app/api/services/synthesis/prisma_methodology_service.py)
* **Lógica**:
  * Extrae de forma 100% trazable:
    1. Métricas cuantitativas del diagrama de flujo desde `ScreeningSession`.
    2. Fuentes, bases de datos y ecuaciones de búsqueda por archivo desde `SearchResultFile`.
    3. Criterios de inclusión y exclusión desde `RSLProject.extra_metadata['eligibility_criteria']`.
  * Redacta una metodología transparente y replicable en Markdown siguiendo estándares PRISMA 2020.

---

### 2.4. Discusión de Hallazgos
* **Módulo**: [`discussion_conclusions_service.py`](file:///home/sarah/Proyectos-2025/areview/backend/app/api/services/synthesis/discussion_conclusions_service.py)
* **Lógica**:
  * Puede generarse cuando exista al menos un resultado por objetivo redactado; no exige completar todos los objetivos configurados.
  * La evidencia se construye con la unión de los IDs candidatos de esos resultados y los IDs extra que el investigador agregue a la sección de Discusión.
  * Integra los borradores y tablas de todos los objetivos de investigación (`OB1`, `OB2`...) del proyecto + la matriz recortada de soporte.
  * **Regla Obligatoria del Párrafo Final**: Finaliza la Discusión con un párrafo culminante de alto impacto que propone un **Marco Teórico Emergente**, un modelo conceptual integrador o una taxonomía sistémica según lo reportado.
  * Cita evidencias mediante IDs compuestos `[ID]`.

---

### 2.5. Conclusiones (Con Validación Estricta)
* **Módulo**: [`discussion_conclusions_service.py`](file:///home/sarah/Proyectos-2025/areview/backend/app/api/services/synthesis/discussion_conclusions_service.py)
* **Validación Estricta**:
  * Si no existen borradores previos de Resultados u Objetivos, o no se ha redactado la Discusión, devuelve `HTTP 400 Bad Request`:
    > *"No se pueden generar las Conclusiones. Es obligatorio haber redactado primero los Resultados y la Discusión del proyecto RSL."*
* **Insumos Exclusivos**:
  * Consume **ÚNICAMENTE**: Título RSL, Objetivos del proyecto, Borradores de Resultados y Borrador de la Discusión (+ instrucciones del usuario). **Cero matriz cruda redundante**.

---

## 3. Endpoints HTTP REST Expuestos (`/api/v1/projects/{project_id}/synthesis`)

* **`POST /sections`**: Crea o sobrescribe una sección. Para `RESULTS_OBJECTIVE`, la clave es `section_type + objective_title`; para los demás tipos existe una única sección por proyecto y tipo.
* **`GET /sections`**: Lista las secciones ordenadas por `order_index`.
* **`GET /sections/{section_id}`**: Obtiene los detalles de una sección.
* **`PUT /sections/{section_id}`**: Permite confirmar y ajustar manualmente `candidate_article_ids`, `selection_justifications`, `trimmed_columns_used`, `generated_table` y `generated_draft` antes de la siguiente fase.
* **`POST /sections/{section_id}/evaluate-eligibility`**: Encola la propuesta de columnas para resultados, o la selección de IDs para introducción y marco.
* **`POST /sections/{section_id}/identify-ids`**: Solo para `RESULTS_OBJECTIVE`; selecciona IDs usando `trimmed_columns_used` ya confirmado por el usuario.
* **`POST /sections/{section_id}/generate-table`**: Solo para `RESULTS_OBJECTIVE`; encola la tabla JSONB visible y editable antes de redactar.
* **`POST /sections/{section_id}/generate-draft`**: Encola la redacción en Markdown con citas `[ID]`. Para resultados requiere una tabla previa.
* **`GET /tasks/{task_id}/status`**: Consulta el estado Celery de selección, tabla o redacción.
* **`DELETE /sections/{section_id}`**: Elimina una sección.

Las respuestas de creación, lectura y actualización incluyen `candidate_articles`, además de `candidate_article_ids`, para que el frontend muestre la evidencia seleccionada sin resolver IDs manualmente:

```json
{
  "candidate_article_ids": ["ACONCWOOD"],
  "candidate_articles": [
    {
      "article_id": "ACONCWOOD",
      "title": "A conceptual framework to describe and evaluate a socially accountable learning health system"
    }
  ]
}
```

### Flujo operativo para frontend

1. La matriz, incluida una importada, debe tener `ID` por fila. El backend conserva ese valor como `article_custom_id`; la IA lo usa al seleccionar y citar evidencia.
2. Crear o sobrescribir la sección con `POST /sections`.
3. Para introducción y marco: ejecutar `POST /evaluate-eligibility`, confirmar IDs con `PUT` y enviar `POST /generate-draft`.
4. Para resultados: recomendar columnas, actualizar `trimmed_columns_used`, ejecutar `POST /identify-ids`, confirmar IDs, generar/editar tabla y finalmente redactar.
5. Para metodología, discusión o conclusiones: enviar `POST /generate-draft` y consultar el `task_id`.
7. Discusión y conclusiones solo se generan cuando existen resultados redactados para los objetivos declarados en `project.extra_metadata.objectives`.

Los cuerpos de `evaluate-eligibility`, `generate-table` y `generate-draft` aceptan `custom_prompt`. Ese texto se entrega únicamente a la tarea actual de IA; no se guarda en la sección.
