# 🔬 A-Review Frontend — Sistema RSL bajo PRISMA 2020

Este repositorio contiene la aplicación **Frontend** para **A-Review**, una plataforma web avanzada dedicada a la automatización, gestión y ejecución de **Revisiones Sistemáticas de la Literatura (RSL)** cumpliendo con el estándar internacional **PRISMA 2020**.

---

## 🚀 1. Stack Tecnológico y Justificación

| Tecnología | Versión | Propósito & Justificación |
| :--- | :--- | :--- |
| **React** | `^19.0.0` | Librería UI declarativa basada en componentes reutilizables y reactivos para gestionar interfaces de alta complejidad. |
| **TypeScript** | `^5.7.0` | Tipado estático estricto para garantizar contratos de datos seguros entre los modelos Pydantic del Backend y las vistas Frontend. |
| **Vite** | `^8.2.0` | Herramienta de compilación ultrarrápida con HMR (Hot Module Replacement) instantáneo y proxy integrado para desarrollo sin problemas de CORS. |
| **Tailwind CSS** | `^4.0.0` | Framework CSS utilitario configurado con `@tailwindcss/vite` para estilos modernos, diseño adaptativo y modo oscuro (*Dark Mode*). |
| **Axios** | `^1.7.0` | Cliente HTTP basado en promesas para consumir la API FastAPI, con interceptores para tokens de autenticación y manejo global de errores. |
| **React Router DOM**| `^7.0.0` | Enrutamiento SPA (Single Page Application) declarativo con soporte para rutas anidadas y guardias de navegación. |
| **Lucide React** | `^0.475.0` | Kit de iconografía vectorial ligera y moderna. |

---

## 📁 2. Arquitectura de Carpetas (`src/`)

El proyecto sigue una arquitectura modular escalable basada en la separación de responsabilidades:

```text
frontend/
├── public/                 # Archivos estáticos públicos (favicon, logos, assets)
├── src/
│   ├── assets/             # Imágenes, SVGs e ilustraciones de la aplicación
│   ├── components/         # Componentes UI reutilizables
│   │   ├── common/         # Modales, Botones, Tablas, Badges, Loaders, Toasts
│   │   ├── layout/         # Sidebar, Navbar, Footer, Contenedores de vista
│   │   ├── prisma/         # Diagrama de flujo PRISMA 2020, indicadores de estado
│   │   └── steps/          # Componentes específicos por fase RSL (Cribado, Matriz, etc.)
│   ├── context/            # Proveedores de estado global (Auth, RSL Project Context)
│   ├── hooks/              # Custom Hooks de React (ej. useProject, useScreening, useDeduplication)
│   ├── pages/              # Vistas principales asociadas a las rutas
│   │   ├── HomeView.tsx           # Dashboard principal
│   │   ├── BackendTestView.tsx    # Vista de verificación de Health Check (/test/backend/salduo)
│   │   ├── projects/              # Gestión de proyectos RSL
│   │   ├── screening/             # Fase de Cribado (Título/Abstract con IA)
│   │   ├── pdfs/                  # Fase de Gestión de PDFs y descarga abierta
│   │   ├── matrix/                # Matriz de Extracción de Datos
│   │   ├── synthesis/             # Síntesis y Redacción asistida por IA
│   │   └── export/                # Reporte PRISMA 2020 y Exportación a Word (.docx)
│   ├── services/           # Clientes HTTP y módulos de API (Axios)
│   │   ├── api.ts                 # Instancia base de Axios con URL base y proxy
│   │   ├── projectsService.ts     # CRUD de Proyectos RSL
│   │   ├── searchFilesService.ts  # Carga de archivos BibTeX/RIS/CSV
│   │   ├── deduplicationService.ts # Procesos de Deduplicación
│   │   ├── screeningService.ts    # Cribado por IA (Inclusión/Exclusión)
│   │   ├── pdfService.ts          # Gestión y descarga de PDFs (Unpaywall/Semantic Scholar)
│   │   ├── matrixService.ts       # Extracción de Datos y Campos de Matriz
│   │   ├── synthesisService.ts    # Generación de Síntesis por IA
│   │   └── exportService.ts       # Descarga de reportes en .docx
│   ├── types/              # Definiciones e interfaces de TypeScript
│   │   ├── project.ts             # Tipos de Proyecto, Preguntas de Investigación, Criterios
│   │   ├── paper.ts               # Estructura del artículo científico
│   │   ├── screening.ts           # Decisiones de cribado y sugerencias de IA
│   │   ├── matrix.ts              # Definición de columnas y valores extraídos
│   │   └── api.ts                 # Respuestas estándar de la API backend
│   ├── utils/              # Funciones auxiliares, formateadores y validadores
│   ├── App.tsx             # Componente raíz con React Router
│   ├── main.tsx            # Punto de entrada principal
│   └── index.css           # Estilos globales y directiva Tailwind CSS v4
├── index.html              # Plantilla HTML principal
├── package.json            # Dependencias y scripts del proyecto
├── tsconfig.json           # Configuración base de TypeScript
├── tsconfig.app.json       # Configuración de compilación para la app React
├── vite.config.ts          # Configuración de Vite, Aliases (@/) y Proxy al Backend
└── README.md               # Documentación del Frontend
```

---

## 🔗 3. Servicios e Integración con el Backend (FastAPI)

El frontend se comunica directamente con el servidor backend FastAPI a través del proxy inverso de Vite configurado en `vite.config.ts`.

### 🔀 Configuración del Proxy (Vite Dev Server)
* **API Endpoints (`/api/v1`)** $\rightarrow$ `http://127.0.0.1:8008/api/v1`
* **Health Check (`/health-check`)** $\rightarrow$ `http://127.0.0.1:8008/`

### 🗺️ Mapeo de Servicios a Endpoints FastAPI

| Módulo Frontend | Ruta Backend (`/api/v1`) | Descripción |
| :--- | :--- | :--- |
| **`api.ts` / Health** | `@app.get("/")` | Verificación de estado del servidor en la ruta `/test/backend/salduo`. |
| **`projectsService`** | `/projects` | Creación y administración del protocolo RSL, preguntas de investigación y criterios. |
| **`searchFilesService`** | `/search-files` | Importación de resultados de búsqueda desde fuentes bibliográficas (Scopus, IEEE Xplore, PubMed). |
| **`deduplicationService`**| `/screening/deduplicate` | Detección de duplicados mediante comparaciones exactas y algoritmos difusos. |
| **`screeningService`** | `/screening` | Cribado de títulos y resúmenes con sugerencias automáticas de motores IA (OpenAI, Gemini, Claude, DeepSeek). |
| **`pdfService`** | `/pdfs` | Gestión de archivos PDF y descarga en acceso abierto (Unpaywall, Semantic Scholar, CrossRef). |
| **`matrixService`** | `/matrix`, `/extracted-records` | Definición de plantilla de extracción de datos y matriz tabulada. |
| **`synthesisService`** | `/synthesis` | Síntesis narrativa, agrupamiento por temas y generación de secciones redactadas. |
| **`exportService`** | `/export` | Generación de reporte completo PRISMA 2020 y exportación a documento de Word (`.docx`). |

---

## 🛠️ 4. Comandos de Desarrollo

En la carpeta `frontend/`:

* **Instalar dependencias**:
  ```bash
  npm install
  ```
* **Iniciar servidor de desarrollo**:
  ```bash
  npm run dev
  ```
  *(La aplicación se abrirá en `http://localhost:3000`)*
* **Verificar tipos TypeScript**:
  ```bash
  npx tsc --noEmit
  ```
* **Compilar para producción**:
  ```bash
  npm run build
  ```
