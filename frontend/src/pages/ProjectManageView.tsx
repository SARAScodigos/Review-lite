import React, { useState, useEffect } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Upload,
  Filter,
  Download,
  Table,
  FileText,
  FileSpreadsheet,
  Calendar,
  RefreshCw,
  Users,
  AlertCircle,
} from 'lucide-react';
import { projectsService } from '../services/projectsService';
import type { RSLProject } from '../types/project';
import { ImportacionesTab } from '../components/project/ImportacionesTab';
import { ScreeningViewTab } from '../components/screening/ScreeningViewTab';
import { PdfManagementTab } from '../components/pdf/PdfManagementTab';
import { MatrixExtractionTab } from '../components/matrix/MatrixExtractionTab';
import { SynthesisDraftingTab } from '../components/synthesis/SynthesisDraftingTab';
import { ExportsTab } from '../components/project/ExportsTab';
import { InstructionsPanel } from '../components/common/InstructionsPanel';
import type { InstructionsPanelContent } from '../components/common/InstructionsPanel';

type TabType = 'importaciones' | 'cribado' | 'descargas' | 'matriz' | 'redaccion' | 'exportaciones';

const TAB_INSTRUCTIONS: Record<TabType, InstructionsPanelContent> = {
  "importaciones": {
    "title": "Importar fuentes",
    "description": "Reúne tus búsquedas y elimina los registros repetidos.",
    "steps": [
      {
        "title": "Sube los archivos",
        "description": "Carga cada archivo por separado e indica la base de datos y la ecuación de búsqueda."
      },
      {
        "title": "Revisa los registros",
        "description": "Extrae los metadatos y comprueba títulos, autores, DOI y resúmenes."
      },
      {
        "title": "Elimina duplicados",
        "description": "Cuando estén todas las fuentes, ejecuta la desduplicación y revisa los casos pendientes."
      },
      {
        "title": "Comprueba la lista final",
        "description": "Revisa los registros únicos. Puedes descargar un Excel antes de pasar al cribado."
      }
    ],
    "note": "Si eliminas un archivo, también se borran sus registros. Termina de importar antes del cribado."
  },
  "cribado": {
    "title": "Seleccionar estudios",
    "description": "Revisa primero los títulos y después los resúmenes.",
    "steps": [
      {
        "title": "Evalúa los títulos",
        "description": "Elige un modelo y ejecuta la Fase 1. Revisa las sugerencias y sus motivos."
      },
      {
        "title": "Ajusta las decisiones",
        "description": "Marca Incluir, Excluir o En duda según los criterios de tu protocolo."
      },
      {
        "title": "Revisa los resúmenes",
        "description": "En la Fase 2, evalúa los resúmenes de los estudios que avanzaron."
      },
      {
        "title": "Resuelve los pendientes",
        "description": "Comprueba los conteos y revisa los registros en duda antes de continuar."
      }
    ],
    "note": "Si la sugerencia no es clara, revisa el estudio manualmente. La IA apoya la revisión; no reemplaza el criterio del investigador."
  },
  "descargas": {
    "title": "Reunir los PDF",
    "description": "Busca los textos completos de los estudios seleccionados.",
    "steps": [
      {
        "title": "Revisa los candidatos",
        "description": "Comprueba que sean los estudios incluidos tras revisar títulos y resúmenes."
      },
      {
        "title": "Busca los PDF",
        "description": "Inicia la descarga masiva para localizar versiones de acceso abierto."
      },
      {
        "title": "Comprueba las descargas",
        "description": "Filtra por estado y abre los documentos para verificar título, autores y DOI."
      },
      {
        "title": "Sube los faltantes",
        "description": "Si no se encuentra un PDF, búscalo en la revista o en un repositorio y súbelo manualmente. Reemplaza los documentos incorrectos."
      }
    ],
    "note": "Que la descarga falle no significa que el artículo no exista. Comprueba el enlace o DOI y verifica el documento antes de usarlo."
  },
  "matriz": {
    "title": "Preparar la matriz",
    "description": "Extrae los datos y contrástalos con cada texto completo.",
    "steps": [
      {
        "title": "Elige las columnas",
        "description": "Añade las variables que necesitas y activa la extracción con IA en las columnas correspondientes."
      },
      {
        "title": "Extrae los datos",
        "description": "Elige un modelo y procesa todos los artículos o uno por uno."
      },
      {
        "title": "Revisa y guarda",
        "description": "Compara las celdas con el PDF, corrige los datos y guarda antes de confirmar la fila."
      },
      {
        "title": "Decide qué estudios incluir",
        "description": "Incluye o excluye cada texto completo con un motivo. Puedes exportar la matriz a Excel."
      }
    ],
    "note": "Si falta un dato o la extracción falla, revisa el PDF y completa la celda manualmente. Si el estudio no lo informa, indícalo; no lo supongas."
  },
  "redaccion": {
    "title": "Redactar la revisión",
    "description": "Trabaja cada apartado con la evidencia que ya revisaste.",
    "steps": [
      {
        "title": "Comprueba la matriz",
        "description": "Revisa los PDF, valida las filas y confirma las decisiones a texto completo."
      },
      {
        "title": "Elige un apartado",
        "description": "Avanza por Introducción, Marco teórico, Metodología, Resultados, Discusión y Conclusiones."
      },
      {
        "title": "Prepara el borrador",
        "description": "Los tres primeros apartados permiten generar con IA. Para los demás, sigue las guías y añade tus notas."
      },
      {
        "title": "Edita y guarda",
        "description": "Comprueba las citas y las afirmaciones. Guarda los cambios antes de pasar al siguiente apartado."
      }
    ],
    "note": "Verifica los borradores de IA con las fuentes. Resultados, Discusión y Conclusiones los redactas tú; la interpretación y las decisiones son del investigador."
  },
  "exportaciones": {
    "title": "Descargar el trabajo",
    "description": "Exporta el proyecto cuando hayas terminado de revisarlo.",
    "steps": [
      {
        "title": "Revisa el estado final",
        "description": "Comprueba el cribado, la matriz, las decisiones a texto completo y los borradores."
      },
      {
        "title": "Descarga el diagrama PRISMA",
        "description": "Usa PDF para incluirlo en documentos o SVG si necesitas editarlo."
      },
      {
        "title": "Exporta la matriz",
        "description": "Descarga el Excel y comprueba que contenga las filas y columnas de tu revisión."
      },
      {
        "title": "Genera el Word",
        "description": "Crea el DOCX y descárgalo del historial cuando termine el proceso."
      }
    ],
    "note": "Si cambias datos o textos después de exportar, genera una nueva versión."
  }
};

export const ProjectManageView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [project, setProject] = useState<RSLProject | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const tabFromUrl = searchParams.get('tab') as TabType | null;
  const validTabs: TabType[] = ['importaciones', 'cribado', 'descargas', 'matriz', 'redaccion', 'exportaciones'];
  const activeTab: TabType = validTabs.includes(tabFromUrl as TabType) ? (tabFromUrl as TabType) : 'importaciones';

  const setActiveTab = (newTab: TabType) => {
    setSearchParams({ tab: newTab });
  };

  // Load project details
  useEffect(() => {
    if (!id) return;
    const fetchProject = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await projectsService.getProjectById(id);
        setProject(data);
      } catch (err: any) {
        console.error('Error al cargar el proyecto:', err);
        setError('No se pudo cargar la información del proyecto.');
      } finally {
        setLoading(false);
      }
    };
    fetchProject();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
          <p className="text-sm font-medium text-slate-600">Cargando administración del proyecto...</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-rose-200 rounded-2xl p-6 max-w-md w-full text-center space-y-4 shadow-sm">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
          <h2 className="text-base font-bold text-slate-900">Proyecto no encontrado</h2>
          <p className="text-xs text-slate-500">{error || 'El proyecto solicitado no existe o fue eliminado.'}</p>
          <Link to="/projects" className="btn-green inline-flex items-center space-x-2 text-xs">
            <ArrowLeft className="w-4 h-4" />
            <span>Volver a Proyectos</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-emerald-200 selection:text-emerald-900">
      {/* HEADER DE ADMINISTRACIÓN DE PROYECTO */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 shadow-xs">
        <div className="max-w-[96%] xl:max-w-[98%] mx-auto space-y-3">
          {/* Fila superior: Botón volver + Título + Badges */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <Link
                to="/projects"
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                title="Volver a lista de proyectos"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="badge-green text-[10px] uppercase font-bold tracking-wider">
                    {project.geographic_scope || 'Ámbito Global'}
                  </span>
                  {project.extra_metadata?.journal_info?.journal_name && (
                    <span className="badge-orange text-[10px] font-semibold truncate max-w-[200px]">
                      {project.extra_metadata.journal_info.journal_name}
                    </span>
                  )}
                </div>
                <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-snug">
                  {project.title}
                </h1>
              </div>
            </div>

            {/* Acciones rápidas / Metadata autores */}
            <div className="flex items-center space-x-2 text-xs text-slate-500 bg-slate-50 p-2 rounded-xl border border-slate-200 self-stretch sm:self-auto justify-between sm:justify-start">
              <div className="flex items-center space-x-1.5">
                <Users className="w-4 h-4 text-emerald-600" />
                <span className="font-semibold text-slate-700">
                  {project.authors ? project.authors.length : 0} Autores
                </span>
              </div>
              <span className="text-slate-300">|</span>
              <div className="flex items-center space-x-1.5">
                <Calendar className="w-4 h-4 text-orange-600" />
                <span>{new Date(project.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {/* TOP BAR / TABS DE ADMINISTRACIÓN DEL PROYECTO */}
          <div className="pt-2 border-t border-slate-100">
            <nav className="flex items-center space-x-1 sm:space-x-2 overflow-x-auto pb-1 no-scrollbar">
              <button
                onClick={() => setActiveTab('importaciones')}
                className={`flex items-center space-x-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                  activeTab === 'importaciones'
                    ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Upload className="w-4 h-4" />
                <span>Importaciones</span>
              </button>

              <button
                onClick={() => setActiveTab('cribado')}
                className={`flex items-center space-x-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                  activeTab === 'cribado'
                    ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Filter className="w-4 h-4" />
                <span>Cribado</span>
              </button>

              <button
                onClick={() => setActiveTab('descargas')}
                className={`flex items-center space-x-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                  activeTab === 'descargas'
                    ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Download className="w-4 h-4" />
                <span>Descargas</span>
              </button>

              <button
                onClick={() => setActiveTab('matriz')}
                className={`flex items-center space-x-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                  activeTab === 'matriz'
                    ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Table className="w-4 h-4" />
                <span>Matriz</span>
              </button>

              <button
                onClick={() => setActiveTab('redaccion')}
                className={`flex items-center space-x-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                  activeTab === 'redaccion'
                    ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Redacción</span>
              </button>

              <button
                onClick={() => setActiveTab('exportaciones')}
                className={`flex items-center space-x-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                  activeTab === 'exportaciones'
                    ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Exportaciones</span>
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* ÁREA DE CONTENIDO PRINCIPAL POR TAB */}
      <main className="flex-1 max-w-[96%] xl:max-w-[98%] w-full mx-auto p-4 sm:p-6 space-y-3">
        <InstructionsPanel {...TAB_INSTRUCTIONS[activeTab]} />

        {/* ==========================================
            TAB 1: IMPORTACIONES (COMPONENTE DESACOPLADO)
           ========================================== */}
        {activeTab === 'importaciones' && <ImportacionesTab project={project} />}

        {/* ==========================================
            TAB 2: CRIBADO (COMPONENTE DESACOPLADO HITO 2)
           ========================================== */}
        {activeTab === 'cribado' && <ScreeningViewTab project={project} />}

        {/* ==========================================
            TAB 3: DESCARGAS (GESTIÓN DE PDFS HITO 3)
           ========================================== */}
        {activeTab === 'descargas' && project && <PdfManagementTab project={project} />}

        {/* ==========================================
            TAB 4: MATRIZ DE EXTRACCIÓN (HITO 4)
           ========================================== */}
        {activeTab === 'matriz' && project && <MatrixExtractionTab project={project} />}

        {/* ==========================================
            TAB 5: REDACCIÓN Y SÍNTESIS CIENTÍFICA (HITO 5)
           ========================================== */}
        {activeTab === 'redaccion' && project && <SynthesisDraftingTab project={project} />}

        {/* ==========================================
            TAB 6: EXPORTACIONES
           ========================================== */}
        {activeTab === 'exportaciones' && project && <ExportsTab project={project} />}
      </main>
    </div>
  );
};

export default ProjectManageView;
