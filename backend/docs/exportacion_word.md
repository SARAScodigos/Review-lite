# Documentación Oficial del Módulo de Exportación e Historial de Versiones - A-Review Backend

Este documento describe los entregables finales de una RSL: manuscrito consolidado versionado, diagrama PRISMA 2020 y matriz de extracción Excel.

---

## 1. Especificaciones de Formato del Documento Word (.docx)

* **Tamaño de Hoja**: A4 (`210 mm x 297 mm`).
* **Márgenes**: `2.5 cm` en todos los lados (Superior, Inferior, Izquierdo, Derecho).
* **Tipografía Normal**: `Times New Roman`, Tamaño `10 pt`.
* **Interlineado**: Sencillo (`1.0`) con espacio posterior de párrafo de `4 pt`.
* **Estilo Monocromático Estricto (Sin Colores)**: Encabezados en texto negro en negrita, tablas en bordes grises/negros simples sin rellenos de color.
* **Pie de Página**: Numeración de página dinámica en la parte central inferior (`PAGE`).

---

## 2. Secuencia de Secciones en el Documento

1. **Título Principal y Subtítulo RSL**
2. **Resumen / Abstract** *(Placeholder: `[Pendiente de redacción final de resumen]`)*
3. **1. Introducción y Antecedentes** *(Borrador redactado de `INTRODUCTION`)*
4. **2. Marco Teórico y Fundamentación** *(Borrador redactado de `THEORETICAL_FRAMEWORK`)*
5. **3. Metodología y Estrategia de Búsqueda (PRISMA 2020)** *(Borrador redactado de `METHODOLOGY_PRISMA`)*
6. **4. Resultados y Análisis de la Evidencia** *(Para cada `RESULTS_OBJECTIVE`: rinde la tabla sintética JSONB + el borrador narrativo)*
7. **5. Discusión y Síntesis Conceptual Emergente** *(Borrador redactado de `DISCUSSION`)*
8. **6. Conclusiones y Trabajos Futuros** *(Borrador redactado de `CONCLUSIONS`)*
9. **7. Referencias Bibliográficas** *(Placeholder: `[Listado de referencias bibliográficas correspondientes a los IDs citados en el texto]`)*

---

## 3. Modelo de Versiones (`RSLExportVersion`) y Almacenamiento

### 🏛️ Tabla PostgreSQL (`rsl_export_versions`)
Ubicación del modelo: [`app/api/models/rsl_export_model.py`](file:///home/sarah/Proyectos-2025/areview/backend/app/api/models/rsl_export_model.py)

* **Control de Versiones Incremental**: Asigna números correlativos `version_number` (1, 2, 3...) y etiquetas `version_label` ("V1", "V2", "V3"...).
* **Almacenamiento Físico**: Se guardan en el servidor bajo la ruta:
  `app/data/exports/{project_id}/Manuscrito_RSL_{titulo}_V1.docx`
* **Auditoría e Integridad**: Registra `file_size_bytes`, `sha256_checksum`, `export_status` (`PENDING`, `GENERATING`, `COMPLETED`, `ERROR`) y mensaje de error.

---

## 4. Endpoints HTTP REST Expuestos (`/api/v1/projects/{project_id}/exports`)

* **`POST /generate`**: Encola en Celery la tarea asíncrona (`run_export_docx_task`) para construir el archivo .docx en segundo plano y registra la versión incremental `V1`, `V2`...
* **`GET /`**: Retorna el historial completo de versiones exportadas del proyecto.
* **`GET /tasks/{task_id}/status`**: Consulta el estado de la tarea Celery de una generación. Estados esperados: `PENDING`, `STARTED`, `SUCCESS` o `FAILURE`.
* **`GET /{version_id}/download`**: Transmite la descarga del archivo binario .docx de la versión especificada.
* **`DELETE /{version_id}`**: Elimina físicamente el archivo .docx del servidor y remueve el registro del historial en la base de datos.
* **`GET /prisma.svg`**: Descarga el diagrama PRISMA 2020 actual como SVG vectorial.
* **`GET /prisma.pdf`**: Descarga el mismo diagrama como PDF imprimible.

El SVG y PDF no se versionan: siempre reflejan la sesión de cribado actual. Cada ejecución de `POST /generate` sí conserva una fotografía versionada del manuscrito, incluidos los borradores y tablas de resultados existentes en ese momento.

## 5. Matriz en Excel

La matriz no duplica su implementación bajo `/exports`. El frontend debe usar:

* **`GET /api/v1/projects/{project_id}/matrix/export/excel`**: descarga el libro `.xlsx` con el esquema actual de columnas y todas las filas de la matriz.

## 6. Integración Frontend

La pestaña de exportaciones debe:

1. Mostrar enlaces directos a `prisma.pdf`, `prisma.svg` y `matrix/export/excel`.
2. Ejecutar `POST /exports/generate` para crear el manuscrito y guardar el `task_id` recibido.
3. Consultar `GET /exports/tasks/{task_id}/status` mientras la tarea esté activa y actualizar `GET /exports` al finalizar.
4. Habilitar la descarga solo cuando `export_status` sea `COMPLETED`; mostrar `error_message` cuando sea `ERROR`.
5. Permitir eliminar versiones mediante `DELETE /exports/{version_id}`.

El manuscrito DOCX reúne los drafts disponibles en este orden: introducción, marco teórico, metodología PRISMA, resultados por objetivo con sus tablas, discusión y conclusiones.
