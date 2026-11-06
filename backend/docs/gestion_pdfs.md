# Documentación del Módulo de Descarga y Almacenamiento de PDFs (Hito 3) - A-Review Backend

Este documento describe la arquitectura POO, resolveres de acceso abierto, endpoints HTTP y flujo de subida manual del **Módulo de Gestión de PDFs (Hito 3)** en **A-Review Backend**.

---

## 1. Visión General

El Hito 3 permite obtener automáticamente los archivos PDF físicos en acceso abierto para los artículos que superaron las fases de cribado por Título y Abstract.

Se basa en una arquitectura **POO con el Patrón Chain of Responsibility** en [`app/articles/`](file:///home/sarah/Proyectos-2025/areview/backend/app/articles/):
1. **Unpaywall API**: Índice global primario de acceso abierto.
2. **Semantic Scholar API**: Índice de ciencia y tecnología del Allen Institute.
3. **CrossRef API**: Consulta de enlaces con MIME `application/pdf`.
4. **Direct URL / HTML Meta-Tags**: Extracción de `<meta name="citation_pdf_url" content="...">`.

---

## 2. Almacenamiento e Integridad

* **Ruta de Disco**: `app/data/pdfs/{project_id}/{record_id}.pdf`.
* **Ruta persistida en BD**: siempre relativa al backend y dentro de `app/`, por ejemplo `app/data/pdfs/{project_id}/{record_id}.pdf`; no se guarda una ruta absoluta del equipo.
* **Verificación de Seguridad**:
  * Cabecera mágica binaria `%PDF`.
  * Generación automática de Hash **SHA-256** para cada archivo.
  * Conteo de peso en bytes.

---

## 3. Subida Manual del Investigador (`PENDING_MANUAL_UPLOAD`)

Si las APIs de acceso abierto no encuentran el PDF (por ser de pago o privado), el estado del artículo cambia automáticamente a **`PENDING_MANUAL_UPLOAD`**. 

El investigador puede meter las manos y subir el PDF desde la interfaz mediante el endpoint multipart de subida manual.

---

## 4. Endpoints HTTP Expuestos

### 4.1. Descarga Masiva del Proyecto (Celery)
* **`POST /api/v1/projects/{project_id}/pdfs/download-all`**
  * Dispara la descarga asíncrona multihilo en Celery.

### 4.2. Lista de Trazabilidad de PDFs
* **`GET /api/v1/projects/{project_id}/pdfs`**
  * Retorna el listado completo de PDFs del proyecto con sus estados y checksums.

### 4.3. Mesa de Artículos Aptos para PDF
* **`GET /api/v1/projects/{project_id}/pdfs/eligible?skip=0&limit=100`**
  * Lista paginada de registros únicos que pasaron o quedaron en duda en título y cuyo abstract está pendiente o incluido.
  * Cada fila contiene posición, fuente/ID, título, autores y año, DOI, estado y razón de título, estado de abstract, estado de descarga, ruta relativa del PDF, fuente de descarga y error si existe.
  * Un registro sin fila en `article_pdfs` se presenta como `PENDING_AUTO_DOWNLOAD`, por lo que puede descargarse o recibir una carga manual.
  ```json
  {
    "items": [
      {
        "position": 1,
        "database_source": "Scopus",
        "id_article": "ARTICSMIT",
        "title": "Título del artículo",
        "authors": "Smith et al.",
        "publication_year": 2024,
        "title_status": "INCLUDED",
        "abstract_status": "PENDING",
        "pdf_download_status": "PENDING_AUTO_DOWNLOAD",
        "pdf_file_path": null
      }
    ],
    "total": 45,
    "skip": 0,
    "limit": 100,
    "returned": 1,
    "has_next": false,
    "has_previous": false
  }
  ```

### 4.4. Ejecución y Estado de Descargas
* **`POST /api/v1/projects/{project_id}/pdfs/download-all`**
  * Encola la descarga automática y devuelve `task_id`.
* **`GET /api/v1/projects/{project_id}/pdfs/download-status?task_id={task_id}`**
  * Consulta opcionalmente el estado de Celery de esa tarea y siempre devuelve los contadores actuales de PDFs aptos: pendientes, descargando, descargados, pendientes de carga manual, cargados manualmente y errores.
  ```json
  {
    "project_id": "uuid-del-proyecto",
    "task_id": "id-de-celery",
    "task_status": "STARTED",
    "total_eligible": 45,
    "pending_auto_download": 10,
    "downloading": 5,
    "downloaded": 20,
    "pending_manual_upload": 8,
    "manually_uploaded": 1,
    "errors": 1
  }
  ```

### 4.5. Subida Manual por el Investigador
* **`POST /api/v1/projects/{project_id}/records/{record_id}/pdf/upload`**
  * Recibe un archivo `multipart/form-data` en el campo `file`.

### 4.6. Reemplazo y Retiro por el Investigador
* **`PUT /api/v1/projects/{project_id}/records/{record_id}/pdf`**
  * Recibe `multipart/form-data` con el campo `file` y reemplaza el PDF existente. La respuesta es el objeto de trazabilidad actualizado.
* **`DELETE /api/v1/projects/{project_id}/records/{record_id}/pdf`**
  * Borra el archivo físico únicamente dentro de `app/`, limpia ruta, hash y tamaño, y deja el registro en `PENDING_MANUAL_UPLOAD` con el mensaje `PDF retirado por el usuario.`

### 4.7. Servidor del Binario PDF
* **`GET /api/v1/projects/{project_id}/records/{record_id}/pdf/file`**
  * Retorna la respuesta binaria `FileResponse` (mimetype `application/pdf`) para visualizar o descargar en el navegador.

### 4.8. Endpoint Directo de Prueba por DOI / URL (Prueba Rápida)
* **`POST /api/v1/pdfs/test-download`**
  ```json
  {
    "doi": "10.48550/arXiv.2303.08774",
    "url": null
  }
  ```
  * Ejecuta la descarga en vivo desde Swagger UI sin requerir crear proyectos ni registros en la base de datos, guardando el PDF de prueba en `app/data/pdfs/test_download.pdf`.
