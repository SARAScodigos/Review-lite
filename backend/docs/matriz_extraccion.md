# Documentación del Módulo de Matriz de Extracción Dinámica JSONB y Cribado a Texto Completo (Hito 4) - A-Review Backend

Este documento describe la arquitectura de almacenamiento JSONB desacoplado, extractor de texto PDF con `pypdf`, optimización masiva de tokens de IA, importador Excel/CSV y confirmación humana (*Human-in-the-Loop*) del **Hito 4** en **A-Review Backend**.

---

## 1. Visión General y Desacoplamiento

El Hito 4 administra la extracción analítica profunda del texto completo de los artículos en PDF y consolida la **Matriz de Extracción RSL**.

### 🏛️ Arquitectura Desacoplada (`ExtractedMatrixRow`)
* **Filas Generadas por el Flujo RSL (`source_type = AI_GENERATED`)**: Tienen `record_id` apuntando al artículo del sistema y se extraen dinámicamente desde el PDF descargado.
* **Filas Importadas Directamente por el Investigador (`source_type = USER_IMPORTED`)**: Poseen `record_id = NULL`. Conectan **directamente al proyecto RSL**, permitiendo al investigador cargar matrices previas o externas desde archivos Excel (.xlsx) o CSV.

---

## 2. Las 18 Columnas Estándar + Columnas Personalizadas

1. **`ID`** *(Generado de BD: 5 letras de título + 4 de autor, ej. `DEEP_PINT`)*
2. **`Año de publicación`** *(Tomado directo de BD)*
3. **`Título`** *(Tomado directo de BD)*
4. **`DOI`** *(Tomado directo de BD)*
5. **`Autor(es)`** *(Tomado directo de BD)*
6. **`Abstract`** *(Tomado directo de BD)*
7. **`Tipo de artículo`** *(Extraído por IA / Importado)*
8. **`Objetivos generales`** *(Extraído por IA / Importado)*
9. **`Palabras clave`** *(Extraído por IA / Importado)*
10. **`Introducción`** *(Extraído por IA / Importado)*
11. **`Fundamentación Teórica`** *(Extraído por IA / Importado)*
12. **`Metodología`** *(Extraído por IA / Importado)*
13. **`Diseño`** *(Extraído por IA / Importado)*
14. **`Población Muestra y Muestreo`** *(Extraído por IA / Importado)*
15. **`Resultados`** *(Extraído por IA / Importado)*
16. **`Discusión`** *(Extraído por IA / Importado)*
17. **`Conclusiones`** *(Extraído por IA / Importado)*
18. **`Relación con el título de investigación`** *(Evaluado por IA / Importado)*

> 💡 **Ahorro Masivo de Tokens**: Los campos 1 al 6 se obtienen directamente de PostgreSQL sin enviárselos al LLM. La IA únicamente analiza el PDF para extraer los campos 7 al 18 y las columnas personalizadas configuradas para esta matriz. `RSLProject.variables` sigue siendo metadato y contexto del proyecto; no crea columnas de matriz.

---

## 3. Human-in-the-Loop y PRISMA 2020

* Al extraer la matriz, la IA genera un veredicto borrador (`review_status = DRAFT`).
* La IA asigna su recomendación a `ScreeningDecision.fulltext_status` (`INCLUDED` o `EXCLUDED`) y conserva la justificación en `fulltext_reason`.
* El artículo permanece pendiente de validación humana mientras `final_decision = PENDING` y la fila de matriz está en `review_status = DRAFT`.
* Al confirmar (`POST /confirm-fulltext`), `final_decision` se actualiza y se recalcula el conteo final del **Diagrama PRISMA 2020**.

---

## 4. Endpoints HTTP Expuestos (`/api/v1/projects/{project_id}/matrix`)

### 4.1. Extracción Masiva con IA en Segundo Plano (Celery)
* **`POST /extract-all`**:
  * Ejecuta `run_matrix_extraction_task` en Celery procesando en paralelo **5 hilos simultáneos** (`ThreadPoolExecutor`) por worker.
  * Solo procesa filas aún no extraídas o en `DRAFT`; una fila `CONFIRMED` no se sobrescribe en el lote.

### 4.2. Extracción Individual a Demanda
* **`POST /records/{record_id}/extract`**:
  * Encola en Celery la extracción de matriz por IA para un único artículo específico y devuelve inmediatamente `task_id`.
* **`GET /tasks/{task_id}/status`**:
  * Consulta el estado de una extracción individual o masiva. Estados usuales: `PENDING`, `STARTED`, `SUCCESS`, `FAILURE`.

Respuesta de `POST /records/{record_id}/extract`:

```json
{
  "task_id": "b92f8329-a2d5-4a48-8c21-18d841997105",
  "project_id": "566b6729-a57b-4e88-8744-b21a72e174a8",
  "status": "QUEUED",
  "message": "Extracción individual de matriz encolada exitosamente con IA (deepseek / deepseek-v4-flash)."
}
```

El frontend no debe esperar una fila de matriz en esta respuesta. Debe guardar `task_id`, consultar `GET /tasks/{task_id}/status` y volver a cargar `GET /workbench` o `GET /rows` cuando el estado sea `SUCCESS`.

### 4.3. Consulta de Filas de la Matriz
* **`GET /rows`**:
  * Retorna la lista de todas las filas en JSONB (generadas por IA e importadas de Excel).
* **`GET /rows/paginated?skip=0&limit=100`**:
  * Alternativa paginada para matrices de gran volumen.

### 4.4. Configuración de Columnas de la Matriz
* **`GET /columns`**: Lista las 18 columnas base y las adicionales del proyecto, en su orden visible y con su configuración de IA.
* **`POST /columns`**: Crea una columna adicional. Se añade con valor `null` a todas las filas existentes y se solicita a la IA en futuras extracciones.
* **`PATCH /columns/ai-inclusion`**: Activa o desactiva la inclusión de una columna extraíble en el prompt de IA.
* **`PATCH /columns/{column_id}`**: Renombra o reordena una columna adicional. Un renombre se propaga a todas las filas existentes sin perder sus valores.
* **`DELETE /columns/{column_id}`**: Retira una columna adicional y elimina esa clave de todas las filas del proyecto.
* La matriz conserva exactamente las 18 columnas estándar y las columnas personalizadas activas. Las claves JSONB heredadas se registran como columnas personalizadas para no perder datos y todas las filas se normalizan con el mismo esquema.

#### Contrato frontend: columnas de matriz

Base común para todas las rutas de esta sección:

```text
/api/v1/projects/{project_id}/matrix
```

`GET /columns` devuelve la lista completa que debe usar el frontend como fuente de verdad para construir la tabla. Las 18 columnas estándar siempre existen y no pueden renombrarse ni eliminarse. Las seis primeras se completan desde base de datos y no se envían a IA; las 12 analíticas y las columnas adicionales sí pueden activarse o desactivarse para IA.

##### Listar todas las columnas y su configuración

```http
GET /api/v1/projects/{project_id}/matrix/columns
```

Respuesta `200`:

```json
[
  {
    "id": null,
    "project_id": "566b6729-a57b-4e88-8744-b21a72e174a8",
    "name": "ID",
    "position": 0,
    "is_predefined": true,
    "is_ai_extractable": false,
    "include_in_ai": false
  },
  {
    "id": "f6b0a4e9-9152-4bb1-9726-d5f48ad609d3",
    "project_id": "566b6729-a57b-4e88-8744-b21a72e174a8",
    "name": "Tipo de organización sanitaria",
    "position": 18,
    "is_predefined": false,
    "is_ai_extractable": true,
    "include_in_ai": true
  }
]
```

Campos: `id` es `null` para una columna base y UUID para una adicional; `is_predefined` indica si se puede renombrar/eliminar; `is_ai_extractable` habilita el control de IA; `include_in_ai` es el estado del interruptor. La primera llamada también normaliza matrices anteriores: conserva claves JSONB no registradas como nuevas columnas adicionales y rellena en todas las filas las claves faltantes con `null`.

##### Crear columna adicional

```http
POST /api/v1/projects/{project_id}/matrix/columns
Content-Type: application/json
```

```json
{
  "name": "Tipo de organización sanitaria"
}
```

Respuesta `201`: objeto de columna con `id`, `project_id`, `name` y `position`.

Reglas:

* `name` es obligatorio, se recorta y admite entre 1 y 120 caracteres.
* No puede duplicar una columna estándar ni otra columna adicional del mismo proyecto.
* Todas las filas existentes reciben la clave con valor `null` inmediatamente.
* Las extracciones IA posteriores reciben el nombre de la columna y devuelven un valor o `null`. Una fila en proceso al momento de crearla también se guarda con esa clave en `null` si la IA no la recibió.

Errores: `400` para nombre inválido o estándar; `409` para nombre repetido; `404` si el proyecto no existe.

##### Activar u omitir una columna en IA

```http
PATCH /api/v1/projects/{project_id}/matrix/columns/ai-inclusion
Content-Type: application/json
```

```json
{
  "name": "Discusión",
  "include_in_ai": false
}
```

Respuesta `200`: objeto de columna actualizado. Cuando `include_in_ai` es `false`, esa columna no se solicita en el prompt de IA y las filas extraídas quedan con `null` en dicha clave. Reactivarla afecta solo extracciones futuras; no rellena retroactivamente las filas existentes.

Las columnas `ID`, `Año de publicación`, `Título`, `DOI`, `Autor(es)` y `Abstract` no se pueden activar ni desactivar porque provienen directamente de la base de datos y no consumen tokens de IA. Errores: `400` si la columna no es extraíble con IA; `404` si no existe; `422` si el cuerpo es inválido.

##### Renombrar o reordenar columna

```http
PATCH /api/v1/projects/{project_id}/matrix/columns/{column_id}
Content-Type: application/json
```

Renombrar:

```json
{
  "name": "Nivel asistencial"
}
```

Reordenar:

```json
{
  "position": 0
}
```

Se pueden enviar ambos campos en la misma solicitud. La respuesta es `200` con el objeto actualizado. Al renombrar, la clave anterior se reemplaza en todas las filas sin perder su valor. `position` es índice base cero dentro de las columnas adicionales; el backend reordena las demás posiciones.

Errores: `400` para nombre inválido o estándar; `404` si la columna no pertenece al proyecto; `409` si el nombre ya existe; `422` si el cuerpo no cumple el esquema, por ejemplo `position < 0`.

##### Eliminar columna

```http
DELETE /api/v1/projects/{project_id}/matrix/columns/{column_id}
```

Respuesta `204` sin cuerpo. Solo es válido para columnas adicionales. La clave se elimina de cada `extraction_data` del proyecto y las posiciones restantes se compactan. El frontend debe quitarla de la tabla únicamente después de recibir `204` o recargar `GET /columns`.

##### Lectura y edición de filas

Cada fila de `GET /rows`, `GET /rows/paginated` y los retornos de `POST`, `PUT` y `PATCH /rows` tiene esta forma:

```json
{
  "id": "8cf86fca-ff3d-496a-b2e8-e4492a1a26e7",
  "project_id": "566b6729-a57b-4e88-8744-b21a72e174a8",
  "record_id": "018bf284-02c9-496f-8731-3f6629a4998d",
  "source_type": "AI_GENERATED",
  "article_custom_id": "MARTI_LOPE",
  "extraction_data": {
    "ID": "MARTI_LOPE",
    "Título": "Título del artículo",
    "Resultados": "Hallazgos del estudio",
    "Tipo de organización sanitaria": null,
    "Nivel asistencial": "Hospitalario"
  },
  "review_status": "DRAFT",
  "created_at": "2026-08-09T20:00:00",
  "updated_at": "2026-08-09T20:03:00"
}
```

`extraction_data` siempre contiene la misma lista de claves para todas las filas del proyecto: las 18 estándar y las adicionales activas. Para modificar una celda el frontend debe usar `PATCH /rows/{row_id}`; las claves que no pertenezcan al esquema activo se descartan.

### 4.5. Mesa de Control y Métricas
* **`GET /workbench?skip=0&limit=100`**:
  * Devuelve una tabla paginada de los artículos únicos aptos para la fase de texto completo. Cada fila incluye fuente, metadatos, decisiones de título/abstract/texto completo, estado y ruta del PDF, fila de matriz asociada, estado de revisión y `can_extract`.
  * Permite al frontend decidir si muestra acciones de cargar PDF, extraer con IA, editar la fila o confirmar el texto completo.
* **`GET /metrics`**:
  * Devuelve `total_candidates`, disponibilidad de PDF, filas extraídas en borrador/confirmadas y decisiones de texto completo incluidas, excluidas o pendientes.

### 4.6. Gestión Manual de Filas
* **`POST /rows`**:
  * Crea una fila manual desacoplada (`source_type = MANUAL_SCREENING`) sin requerir PDF ni registro extraído.
* **`PUT /rows/{row_id}`**:
  * Reemplaza el diccionario JSONB completo de la fila.
* **`PATCH /rows/{row_id}`**:
  * Modifica únicamente las claves enviadas en `extraction_data_patch`, sin perder el resto de las celdas.
* **`DELETE /rows/{row_id}`**:
  * Elimina explícitamente la fila de matriz; no modifica por sí sola la decisión de texto completo del artículo.

### 4.7. Descarga de Plantilla Excel (.xlsx)
* **`GET /template/excel`**:
  * Exporta una plantilla limpia pre-formateada con las 18 columnas estándar + las columnas personalizadas de la matriz.
* **`GET /export/excel`**:
  * Descarga la matriz disponible con las filas reales, incluidas las generadas por IA, importadas y creadas manualmente. Usa el orden de `GET /columns`, conserva las celdas vacías como vacías y no añade una fila de ejemplo.

### 4.8. Importación Masiva Desacoplada
* **`POST /import-excel`**:
  * Recibe un archivo Excel (.xlsx, .xls) o CSV y crea las filas desacopladas en la base de datos.

### 4.9. Confirmación Humana de Texto Completo
* **`POST /confirm-fulltext`**:
  * Actualiza la decisión final en `ScreeningDecision` (`INCLUDED` / `EXCLUDED`) y actualiza el contador de PRISMA.

---

## 5. Contratos para Intervención Manual

### Crear Columna Personalizada
```json
{
  "name": "Tipo de organización sanitaria"
}
```

### Renombrar o Reordenar Columna
```json
{
  "name": "Nivel asistencial",
  "position": 0
}
```

### Crear Fila Manual
```json
{
  "article_custom_id": "MANUAL_001",
  "extraction_data": {
    "ID": "MANUAL_001",
    "Título": "Estudio incorporado manualmente",
    "Resultados": "Hallazgos registrados por el investigador"
  },
  "review_status": "CONFIRMED"
}
```

### Editar Celdas sin Reemplazar la Fila
```json
{
  "extraction_data_patch": {
    "Resultados": "Resultado corregido por el investigador",
    "Conclusiones": "Conclusión revisada"
  },
  "review_status": "CONFIRMED"
}
```
