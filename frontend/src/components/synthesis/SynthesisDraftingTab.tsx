import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FileText,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Layers,
  Check,
  Trash2,
  Download,
  Copy,
  Sliders,
  Edit3,
  Plus,
  BookOpen,
  Eye,
  Code,
  Columns
} from 'lucide-react';
import type { RSLProject } from '../../types/project';
import { AiModelSelectorBlock } from '../common/AiModelSelectorBlock';
import { DEFAULT_AI_MODEL, DEFAULT_AI_PROVIDER } from '../common/aiModelSelection';
import { ManualWritingGuide, isGuidedWritingSection } from './ManualWritingGuide';
import { InstructionsPanel } from '../common/InstructionsPanel';
import type { InstructionsPanelContent } from '../common/InstructionsPanel';
import { synthesisService } from '../../services/synthesisService';
import type {
  SynthesisSectionItem,
  SynthesisSectionType
} from '../../services/synthesisService';

interface SynthesisDraftingTabProps {
  project: RSLProject;
}

interface SectionDefinition {
  type: SynthesisSectionType;
  title: string;
  shortLabel: string;
  description: string;
  isObjective?: boolean;
}

const BASE_SECTIONS: SectionDefinition[] = [
  {
    type: 'INTRODUCTION',
    title: '1. Introducción y Antecedentes',
    shortLabel: '1. Introducción',
    description: 'Contexto de investigación, justificación del problema y antecedentes relevantes.',
  },
  {
    type: 'THEORETICAL_FRAMEWORK',
    title: '2. Marco Teórico y Conceptos Clave',
    shortLabel: '2. Marco Teórico',
    description: 'Bases teóricas, dimensiones conceptuales y modelos de referencia.',
  },
  {
    type: 'METHODOLOGY_PRISMA',
    title: '3. Metodología RSL / PRISMA 2020',
    shortLabel: '3. Metodología',
    description: 'Protocolo de búsqueda, fuentes de datos, criterios de elegibilidad y diagrama PRISMA.',
  },
  {
    type: 'DISCUSSION',
    title: '5. Discusión de Hallazgos y Brechas',
    shortLabel: '5. Discusión',
    description: 'Análisis crítico de hallazgos, contraste de evidencia y marco teórico emergente.',
  },
  {
    type: 'CONCLUSIONS',
    title: '6. Conclusiones y Trabajos Futuros',
    shortLabel: '6. Conclusiones',
    description: 'Síntesis final de aportes, implicaciones prácticas y líneas de investigación futuras.',
  },
];

const SECTION_INSTRUCTIONS: Record<string, InstructionsPanelContent> = {
  "INTRODUCTION": {
    "title": "Introducción",
    "description": "Explica el problema y por qué hace falta esta revisión.",
    "steps": [
      {
        "title": "Elige los artículos",
        "description": "Pulsa Evaluar elegibilidad y revisa cuáles aportan contexto o antecedentes."
      },
      {
        "title": "Indica el enfoque",
        "description": "Si lo necesitas, añade la población, el contexto o el alcance en las instrucciones opcionales."
      },
      {
        "title": "Revisa el borrador",
        "description": "Comprueba que presente el problema y los objetivos sin adelantar conclusiones."
      },
      {
        "title": "Comprueba las citas",
        "description": "Contrasta las afirmaciones con los artículos, corrige y guarda."
      }
    ],
    "note": "Comprueba las citas en los artículos originales. Si falta respaldo o la generación falla, consulta las fuentes y redacta ese fragmento manualmente."
  },
  "THEORETICAL_FRAMEWORK": {
    "title": "Marco teórico",
    "description": "Ordena los conceptos y modelos que ayudarán a interpretar los hallazgos.",
    "steps": [
      {
        "title": "Selecciona las fuentes",
        "description": "Evalúa la elegibilidad y revisa qué estudios aportan definiciones, teorías o modelos."
      },
      {
        "title": "Define el orden",
        "description": "Indica los conceptos o categorías que quieres desarrollar en las instrucciones personalizadas."
      },
      {
        "title": "Genera y revisa",
        "description": "Comprueba que el borrador distinga definiciones, relaciones teóricas y antecedentes."
      },
      {
        "title": "Ajusta los términos",
        "description": "Elimina repeticiones, verifica las fuentes de cada definición y guarda."
      }
    ],
    "note": "Verifica las definiciones en sus fuentes. Corrige o completa manualmente lo que falte; la IA no reemplaza tu análisis."
  },
  "METHODOLOGY_PRISMA": {
    "title": "Metodología PRISMA",
    "description": "Describe cómo buscaste, seleccionaste y analizaste los estudios.",
    "steps": [
      {
        "title": "Revisa el protocolo",
        "description": "Comprueba preguntas, fuentes, ecuaciones, fechas y criterios de selección."
      },
      {
        "title": "Verifica las cifras",
        "description": "Contrasta importaciones, duplicados, exclusiones y textos completos con el diagrama PRISMA."
      },
      {
        "title": "Revisa la metodología",
        "description": "Genera el borrador y comprueba que otra persona pueda repetir el procedimiento."
      },
      {
        "title": "Corrige y guarda",
        "description": "Ajusta nombres, ecuaciones y cantidades. Añade las limitaciones que correspondan."
      }
    ],
    "note": "Contrasta el borrador con el procedimiento que realizaste. Corrige manualmente pasos o cifras incorrectos; no añadas procedimientos que no aplicaste."
  }
};

interface ParsedTable {
  title?: string;
  columns: { key: string; label: string }[];
  rows: Record<string, any>[];
}

const parseGeneratedTable = (rawTable: any): ParsedTable | null => {
  if (!rawTable) return null;

  // Formato Objeto { title, columns: [{ key, label }], rows: [...] }
  if (typeof rawTable === 'object' && !Array.isArray(rawTable)) {
    const title = rawTable.title || undefined;
    const rawRows = Array.isArray(rawTable.rows) ? rawTable.rows : [];

    let columns: { key: string; label: string }[] = [];
    if (Array.isArray(rawTable.columns) && rawTable.columns.length > 0) {
      columns = rawTable.columns.map((col: any) =>
        typeof col === 'string'
          ? { key: col, label: col }
          : { key: col.key || col.id || col.label || 'col', label: col.label || col.key || 'Columna' }
      );
    } else if (rawRows.length > 0) {
      const keys = Object.keys(rawRows[0]);
      columns = keys.map((k) => ({ key: k, label: k }));
    }

    if (rawRows.length === 0 && columns.length === 0) return null;
    return { title, columns, rows: rawRows };
  }

  // Formato Arreglo directo [{ article_id: "...", ... }]
  if (Array.isArray(rawTable) && rawTable.length > 0) {
    const keys = Object.keys(rawTable[0]);
    const columns = keys.map((k) => ({ key: k, label: k }));
    return { columns, rows: rawTable };
  }

  return null;
};

export const SynthesisDraftingTab: React.FC<SynthesisDraftingTabProps> = ({ project }) => {
  // Configuración del Selector de IA
  const [provider, setProvider] = useState<string>(DEFAULT_AI_PROVIDER);
  const [model, setModel] = useState<string>(DEFAULT_AI_MODEL);
  const [temperature, setTemperature] = useState<number>(0.2);

  // Sincronización de Pestañas con la URL (`useSearchParams`)
  const [searchParams, setSearchParams] = useSearchParams();
  const validSectionKeys = ['INTRODUCTION', 'THEORETICAL_FRAMEWORK', 'METHODOLOGY_PRISMA', 'RESULTS_OBJECTIVE', 'DISCUSSION', 'CONCLUSIONS'];

  const sectionFromUrl = searchParams.get('section');
  const initialSectionKey = validSectionKeys.includes(sectionFromUrl || '') ? (sectionFromUrl as string) : 'INTRODUCTION';
  const [selectedSectionKey, setSelectedSectionKey] = useState<string>(initialSectionKey);

  const objectiveFromUrl = searchParams.get('objective');
  const [selectedObjectiveCode, setSelectedObjectiveCode] = useState<string>(objectiveFromUrl || 'OB1');

  // Función para cambiar de sección sincronizando con la URL
  const handleSelectSectionKey = (key: string) => {
    setSelectedSectionKey(key);
    const newParams = new URLSearchParams(searchParams);
    newParams.set('tab', 'redaccion');
    newParams.set('section', key);
    if (key === 'RESULTS_OBJECTIVE') {
      newParams.set('objective', selectedObjectiveCode);
    } else {
      newParams.delete('objective');
    }
    setSearchParams(newParams, { replace: true });
  };

  // Función para cambiar de objetivo en Resultados sincronizando con la URL
  const handleSelectObjectiveCode = (code: string) => {
    setSelectedObjectiveCode(code);
    const newParams = new URLSearchParams(searchParams);
    newParams.set('tab', 'redaccion');
    newParams.set('section', 'RESULTS_OBJECTIVE');
    newParams.set('objective', code);
    setSearchParams(newParams, { replace: true });
  };

  // Sincronizar estado cuando cambien los searchParams del navegador
  useEffect(() => {
    const sec = searchParams.get('section');
    if (sec && validSectionKeys.includes(sec) && sec !== selectedSectionKey) {
      setSelectedSectionKey(sec);
    }
    const obj = searchParams.get('objective');
    if (obj && obj !== selectedObjectiveCode) {
      setSelectedObjectiveCode(obj);
    }
  }, [searchParams]);

  // Secciones registradas en Backend
  const [sections, setSections] = useState<SynthesisSectionItem[]>([]);
  const [activeSection, setActiveSection] = useState<SynthesisSectionItem | null>(null);

  // Artículos de la Matriz disponibles (para selección manual de candidatos)
  interface MatrixArticleOption {
    id: string;
    title: string;
  }
  const [matrixArticles, setMatrixArticles] = useState<MatrixArticleOption[]>([]);
  const [newCandidateInput, setNewCandidateInput] = useState<string>('');
  const [customColumnInput, setCustomColumnInput] = useState<string>('');
  const [selectedCustomColumns, setSelectedCustomColumns] = useState<string[]>([]);

  // Tarea de Celery Activa & Polling
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [taskSectionId, setTaskSectionId] = useState<string | null>(null);
  const [taskActionType, setTaskActionType] = useState<'ELIGIBILITY' | 'IDENTIFY_IDS' | 'TABLE' | 'DRAFT' | null>(null);
  const [, setLoading] = useState<boolean>(true);
  const [taskInProgress, setTaskInProgress] = useState<boolean>(false);
  const [taskMessage, setTaskMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Estados de edición del borrador
  const [customInstructions, setCustomInstructions] = useState<string>('');
  const [editableDraft, setEditableDraft] = useState<string>('');
  const [viewMode, setViewMode] = useState<'preview' | 'edit'>('preview');
  const [copied, setCopied] = useState<boolean>(false);
  const [tableCopied, setTableCopied] = useState<boolean>(false);

  // Copiar tabla sintética al portapapeles (TSV / Excel)
  const handleCopyTable = (parsed: ParsedTable) => {
    const headers = parsed.columns.map((c) => c.label).join('\t');
    const rows = parsed.rows
      .map((r) => parsed.columns.map((c) => String(r[c.key] ?? '')).join('\t'))
      .join('\n');
    const tsvText = `${headers}\n${rows}`;

    navigator.clipboard.writeText(tsvText);
    setTableCopied(true);
    setTimeout(() => setTableCopied(false), 2000);
  };

  // Registro de Nuevos Objetivos del Proyecto
  const [showNewObjectiveModal, setShowNewObjectiveModal] = useState<boolean>(false);
  const [newObjectiveCode, setNewObjectiveCode] = useState<string>('');
  const [newObjectiveDesc, setNewObjectiveDesc] = useState<string>('');

  // Función para obtener la lista consolidada de objetivos del proyecto (extra_metadata + secciones)
  const getProjectObjectivesList = (): { code: string; description: string; section?: SynthesisSectionItem }[] => {
    const map = new Map<string, { code: string; description: string; section?: SynthesisSectionItem }>();

    // 1. Deserializar desde project.extra_metadata.objectives
    const rawObjectives = (project.extra_metadata as any)?.objectives;
    if (rawObjectives && typeof rawObjectives === 'object') {
      Object.entries(rawObjectives).forEach(([code, desc]) => {
        map.set(code, {
          code,
          description: typeof desc === 'string' ? desc : `Objetivo ${code}`,
        });
      });
    }

    // 2. Complementar con las secciones RESULTS_OBJECTIVE registradas en el backend
    sections
      .filter((s) => s.section_type === 'RESULTS_OBJECTIVE')
      .forEach((s) => {
        const code = s.objective_key || s.objective_title || 'OB1';
        const existing = map.get(code);
        map.set(code, {
          code,
          description: s.objective_description || existing?.description || `Objetivo ${code}`,
          section: s,
        });
      });

    if (map.size === 0) {
      map.set('OB1', { code: 'OB1', description: 'Objetivo Principal (OB1)' });
    }

    return Array.from(map.values());
  };

  // Obtener lista de artículos candidatos heredados de los Objetivos de Resultados redactados
  const getInheritedObjectiveArticles = (): { id: string; title: string; sourceObjective: string }[] => {
    const result: { id: string; title: string; sourceObjective: string }[] = [];
    const seen = new Set<string>();

    sections
      .filter((s) => s.section_type === 'RESULTS_OBJECTIVE' && !!s.generated_draft)
      .forEach((sec) => {
        const obName = sec.objective_title || sec.objective_key || 'Objetivo';
        (sec.candidate_article_ids || []).forEach((artId) => {
          if (!seen.has(artId)) {
            seen.add(artId);
            const backendInfo = sec.candidate_articles?.find((a) => a.article_id === artId);
            const mapInfo = matrixArticles.find((a) => a.id === artId);
            result.push({
              id: artId,
              title: backendInfo?.title || mapInfo?.title || 'Título no disponible',
              sourceObjective: obName,
            });
          }
        });
      });

    return result;
  };

  // Construir lista limpia de pestañas principales del manuscrito RSL
  const mainSectionTabs: { key: string; title: string; type: SynthesisSectionType; description: string }[] = [
    { key: 'INTRODUCTION', title: '1. Introducción', type: 'INTRODUCTION', description: BASE_SECTIONS[0].description },
    { key: 'THEORETICAL_FRAMEWORK', title: '2. Marco Teórico', type: 'THEORETICAL_FRAMEWORK', description: BASE_SECTIONS[1].description },
    { key: 'METHODOLOGY_PRISMA', title: '3. Metodología PRISMA', type: 'METHODOLOGY_PRISMA', description: BASE_SECTIONS[2].description },
    { key: 'RESULTS_OBJECTIVE', title: '4. Resultados', type: 'RESULTS_OBJECTIVE', description: 'Resultados y evidencias clasificadas por Objetivo de Investigación' },
    { key: 'DISCUSSION', title: '5. Discusión', type: 'DISCUSSION', description: BASE_SECTIONS[3].description },
    { key: 'CONCLUSIONS', title: '6. Conclusiones', type: 'CONCLUSIONS', description: BASE_SECTIONS[4].description },
  ];

  // 1. Cargar Lista de Secciones y Matriz de Artículos Oficiales (ID + Título)
  const loadSectionsData = async (isSilent: boolean = false) => {
    if (!isSilent) setLoading(true);
    setError(null);
    try {
      const [secList, availableArticles] = await Promise.all([
        synthesisService.getSections(project.id).catch(() => []),
        synthesisService.getAvailableMatrixArticles(project.id).catch(() => []),
      ]);

      setSections(secList || []);

      const options: MatrixArticleOption[] = (availableArticles || []).map((art) => ({
        id: art.article_id,
        title: art.title || 'Título no disponible',
      }));
      setMatrixArticles(options);

    } catch (err: any) {
      console.error('Error cargando secciones de síntesis:', err);
      if (!isSilent) setError('No se pudo conectar con el módulo de Síntesis y Redacción.');
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  useEffect(() => {
    loadSectionsData();
  }, [project.id]);

  // Restaurar tarea activa desde localStorage al recargar (F5)
  useEffect(() => {
    const savedTaskId = localStorage.getItem(`synthesis_active_task_${project.id}`);
    const savedSecId = localStorage.getItem(`synthesis_active_sec_${project.id}`);
    if (savedTaskId && savedSecId) {
      setActiveTaskId(savedTaskId);
      setTaskSectionId(savedSecId);
      setTaskInProgress(true);
      setTaskMessage('Reanudando seguimiento de tarea en Celery...');
    }
  }, [project.id]);

  // Sincronizar localStorage
  useEffect(() => {
    if (activeTaskId) {
      localStorage.setItem(`synthesis_active_task_${project.id}`, activeTaskId);
    } else {
      localStorage.removeItem(`synthesis_active_task_${project.id}`);
    }
    if (taskSectionId) {
      localStorage.setItem(`synthesis_active_sec_${project.id}`, taskSectionId);
    } else {
      localStorage.removeItem(`synthesis_active_sec_${project.id}`);
    }
  }, [activeTaskId, taskSectionId, project.id]);

  // Cancelar o resetear tarea Celery bloqueada
  const handleCancelTask = () => {
    localStorage.removeItem(`synthesis_active_task_${project.id}`);
    localStorage.removeItem(`synthesis_active_sec_${project.id}`);
    setActiveTaskId(null);
    setTaskSectionId(null);
    setTaskActionType(null);
    setTaskInProgress(false);
    setTaskMessage(null);
  };

  // Polling silencioso cada 3 segundos mientras Celery procesa la redacción
  useEffect(() => {
    if (!taskInProgress && !activeTaskId) return;

    const pollTask = async () => {
      await loadSectionsData(true);
      if (!activeTaskId) return;

      try {
        const task = await synthesisService.getTaskStatus(project.id, activeTaskId);
        setTaskMessage(`Estado en Celery: ${task.status}`);

        if (['SUCCESS', 'FAILURE', 'REVOKED'].includes(task.status)) {
          const currentSecId = taskSectionId;
          handleCancelTask();
          await loadSectionsData(true);

          if (task.status === 'SUCCESS' && currentSecId) {
            try {
              const updatedSec = await synthesisService.getSectionDetail(project.id, currentSecId);
              setActiveSection(updatedSec);
              if (updatedSec.generated_draft) {
                setEditableDraft(updatedSec.generated_draft);
              }
            } catch (secErr) {
              console.warn('Error al actualizar detalle de sección post-tarea:', secErr);
            }
          } else if (task.status !== 'SUCCESS') {
            const errorDetails = task.error || (typeof task.result === 'string' ? task.result : null) || 'No se pudo completar el procesamiento con IA.';
            alert(`⚠️ Error en la tarea de síntesis con IA:\n\n${errorDetails}`);
          }
        }
      } catch (err) {
        console.warn('Polling de tarea de síntesis:', err);
      }
    };

    void pollTask();
    const interval = setInterval(() => {
      void pollTask();
    }, 3000);

    return () => clearInterval(interval);
  }, [taskInProgress, activeTaskId, project.id]);

  // Sincronizar la sección activa seleccionada en las pestañas
  useEffect(() => {
    const currentTab = mainSectionTabs.find((t) => t.key === selectedSectionKey);
    if (!currentTab) return;

    if (currentTab.type === 'RESULTS_OBJECTIVE') {
      const existingSec = sections.find(
        (s) => s.section_type === 'RESULTS_OBJECTIVE' && (s.objective_key === selectedObjectiveCode || s.objective_title === selectedObjectiveCode)
      );
      setActiveSection(existingSec || null);
      setCustomInstructions(existingSec?.custom_instructions || '');
      setEditableDraft(existingSec?.generated_draft || '');
    } else {
      const existingSec = sections.find((s) => s.section_type === currentTab.type);
      setActiveSection(existingSec || null);
      setCustomInstructions(existingSec?.custom_instructions || '');
      setEditableDraft(existingSec?.generated_draft || '');
    }
  }, [selectedSectionKey, selectedObjectiveCode, sections]);

  // Asegurar la existencia de la sección (POST /synthesis/sections)
  const ensureSectionExists = async (): Promise<SynthesisSectionItem> => {
    const currentTab = mainSectionTabs.find((t) => t.key === selectedSectionKey)!;
    if (activeSection) return activeSection;

    const currentTabIdx = mainSectionTabs.findIndex((t) => t.key === selectedSectionKey);
    const isResults = currentTab.type === 'RESULTS_OBJECTIVE';
    const objectiveCode = isResults ? selectedObjectiveCode : undefined;
    const objectivesList = getProjectObjectivesList();
    const currentObjInfo = objectivesList.find((o) => o.code === selectedObjectiveCode);

    const created = await synthesisService.createOrOverwriteSection(project.id, {
      section_type: currentTab.type,
      objective_title: objectiveCode,
      objective_description: currentObjInfo?.description,
      order_index: currentTabIdx >= 0 ? currentTabIdx + 1 : 1,
    });

    await loadSectionsData(true);
    setActiveSection(created);
    return created;
  };

  // Registrar un Nuevo Objetivo (POST /synthesis/sections con section_type = RESULTS_OBJECTIVE)
  const handleCreateNewObjective = async () => {
    if (!newObjectiveCode.trim()) {
      alert('Por favor especifica el código del objetivo (ej. OB2, OB3).');
      return;
    }

    const obCode = newObjectiveCode.trim().toUpperCase();
    const obDesc = newObjectiveDesc.trim() || `Objetivo de investigación ${obCode}`;

    try {
      const created = await synthesisService.createOrOverwriteSection(project.id, {
        section_type: 'RESULTS_OBJECTIVE',
        objective_title: obCode,
        objective_description: obDesc,
        order_index: mainSectionTabs.length + 1,
      });

      await loadSectionsData(true);
      setSelectedSectionKey('RESULTS_OBJECTIVE');
      setSelectedObjectiveCode(obCode);
      setActiveSection(created);
      setShowNewObjectiveModal(false);
      setNewObjectiveCode('');
      setNewObjectiveDesc('');
    } catch (err: any) {
      alert('Error al registrar el nuevo objetivo: ' + (err.response?.data?.detail || err.message));
    }
  };

  // 1. Recomendar Columnas / Evaluar Elegibilidad (POST /evaluate-eligibility)
  const handleEvaluateEligibility = async () => {
    try {
      const currentTab = mainSectionTabs.find((t) => t.key === selectedSectionKey)!;
      const sec = await ensureSectionExists();
      setTaskSectionId(sec.id);
      setTaskActionType('ELIGIBILITY');
      setTaskInProgress(true);
      const res = await synthesisService.evaluateEligibility(project.id, sec.id, {
        objective_code: currentTab.type === 'RESULTS_OBJECTIVE' ? selectedObjectiveCode : undefined,
        selected_custom_columns: selectedCustomColumns.length > 0 ? selectedCustomColumns : undefined,
        provider,
        model,
        temperature,
        custom_prompt: customInstructions.trim() || undefined,
      });

      setActiveTaskId(res.task_id);
      setTaskMessage(
        currentTab.type === 'RESULTS_OBJECTIVE'
          ? 'Recomendando columnas clave de la matriz para el objetivo con IA...'
          : 'Evaluando elegibilidad de artículos candidatos e identificando razones con IA...'
      );
    } catch (err: any) {
      alert('Error al evaluar elegibilidad: ' + (err.response?.data?.detail || err.message));
      handleCancelTask();
    }
  };

  // 1.5. Identificar IDs Candidatos (Solo Resultados - POST /identify-ids)
  const handleIdentifyIds = async () => {
    try {
      const currentTab = mainSectionTabs.find((t) => t.key === selectedSectionKey)!;
      const sec = await ensureSectionExists();
      setTaskSectionId(sec.id);
      setTaskActionType('IDENTIFY_IDS');
      setTaskInProgress(true);
      const res = await synthesisService.identifyIds(project.id, sec.id, {
        objective_code: currentTab.type === 'RESULTS_OBJECTIVE' ? selectedObjectiveCode : undefined,
        selected_custom_columns: selectedCustomColumns.length > 0 ? selectedCustomColumns : undefined,
        provider,
        model,
        temperature,
        custom_prompt: customInstructions.trim() || undefined,
      });

      setActiveTaskId(res.task_id);
      setTaskMessage('Identificando artículos candidatos usando columnas confirmadas con IA...');
    } catch (err: any) {
      alert('Error al identificar IDs candidatos: ' + (err.response?.data?.detail || err.message));
      handleCancelTask();
    }
  };

  // 2. Generar Tabla Sintética Comparativa (Solo Resultados - POST /generate-table)
  const handleGenerateTable = async (force: boolean = false) => {
    const hasExistingTable = activeSection?.generated_table && activeSection.generated_table.length > 0;
    if (hasExistingTable && !force) {
      const confirmForce = window.confirm(
        'Esta sección ya cuenta con una tabla sintética comparativa generada. ¿Deseas regenerarla con IA y reemplazar la tabla actual?'
      );
      if (!confirmForce) return;
      force = true;
    }

    try {
      const currentTab = mainSectionTabs.find((t) => t.key === selectedSectionKey)!;
      const sec = await ensureSectionExists();
      setTaskSectionId(sec.id);
      setTaskActionType('TABLE');
      setTaskInProgress(true);
      const res = await synthesisService.generateTable(project.id, sec.id, {
        objective_code: currentTab.type === 'RESULTS_OBJECTIVE' ? selectedObjectiveCode : undefined,
        selected_custom_columns: selectedCustomColumns.length > 0 ? selectedCustomColumns : undefined,
        provider,
        model,
        temperature,
        custom_prompt: customInstructions.trim() || undefined,
        force,
      });

      setActiveTaskId(res.task_id);
      setTaskMessage('Generando tabla sintética comparativa JSONB con IA...');
    } catch (err: any) {
      if (err.response?.status === 409) {
        const retryForce = window.confirm(
          'La tabla sintética comparativa ya existe (HTTP 409). ¿Deseas forzar su regeneración y sobrescribirla?'
        );
        if (retryForce) {
          handleGenerateTable(true);
          return;
        }
      } else {
        alert('Error al generar tabla comparativa: ' + (err.response?.data?.detail || err.message));
      }
      handleCancelTask();
    }
  };

  // 3. Generar Redacción en Markdown (POST /generate-draft)
  const handleGenerateDraft = async () => {
    const currentTab = mainSectionTabs.find((t) => t.key === selectedSectionKey)!;

    // Validación Estricta para Discusión
    if (currentTab.type === 'DISCUSSION') {
      const hasObjectiveDrafts = sections.some((s) => s.section_type === 'RESULTS_OBJECTIVE' && !!s.generated_draft);
      if (!hasObjectiveDrafts) {
        alert('Debe redactar primero los Resultados de al menos un Objetivo de investigación antes de generar la Discusión.');
        return;
      }
    }

    // Validación Estricta para Conclusiones (Regla 2.5)
    if (currentTab.type === 'CONCLUSIONS') {
      const hasResults = sections.some((s) => s.section_type === 'RESULTS_OBJECTIVE' && !!s.generated_draft);
      const hasDiscussion = sections.some((s) => s.section_type === 'DISCUSSION' && !!s.generated_draft);
      if (!hasResults || !hasDiscussion) {
        alert('No se pueden generar las Conclusiones. Es obligatorio haber redactado primero los Resultados y el borrador de la sección de Discusión.');
        return;
      }
    }

    try {
      const sec = await ensureSectionExists();
      setTaskSectionId(sec.id);
      setTaskActionType('DRAFT');
      setTaskInProgress(true);
      const res = await synthesisService.generateDraft(project.id, sec.id, {
        objective_code: currentTab.type === 'RESULTS_OBJECTIVE' ? selectedObjectiveCode : undefined,
        selected_custom_columns: selectedCustomColumns.length > 0 ? selectedCustomColumns : undefined,
        provider,
        model,
        temperature,
        custom_prompt: customInstructions.trim() || undefined,
      });

      setActiveTaskId(res.task_id);
      setTaskMessage(
        currentTab.type === 'DISCUSSION'
          ? 'Generando Discusión transversal con análisis comparativo y Marco Teórico Emergente de un solo tirón...'
          : 'Redactando borrador académico en Markdown citando con [ID]...'
      );
    } catch (err: any) {
      alert('Error al generar redacción: ' + (err.response?.data?.detail || err.message));
      handleCancelTask();
    }
  };

  // Guardar Cambios Manuales (PUT /sections/{section_id})
  const handleSaveManualEdits = async () => {
    if (!activeSection) return;
    try {
      await synthesisService.updateSection(project.id, activeSection.id, {
        generated_draft: editableDraft,
        custom_instructions: customInstructions,
        candidate_article_ids: activeSection.candidate_article_ids,
        status: 'COMPLETED',
      });
      await loadSectionsData(true);
      alert('Borrador y cambios guardados con éxito.');
    } catch (err: any) {
      alert('Error al guardar sección: ' + (err.response?.data?.detail || err.message));
    }
  };

  // Agregar / Quitar Candidatos Manualmente
  const handleAddCandidateId = async (idToAdd: string) => {
    if (!idToAdd.trim()) return;
    const cleanId = idToAdd.trim();

    try {
      const sec = await ensureSectionExists();
      const currentIds = sec.candidate_article_ids || [];
      if (currentIds.includes(cleanId)) return;

      const updatedIds = [...currentIds, cleanId];
      const updated = await synthesisService.updateSection(project.id, sec.id, {
        candidate_article_ids: updatedIds,
      });
      setActiveSection(updated);
      setNewCandidateInput('');
      await loadSectionsData(true);
    } catch (err: any) {
      alert('Error al agregar ID candidato: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleRemoveCandidateId = async (idToRemove: string) => {
    if (!activeSection) return;
    const currentIds = activeSection.candidate_article_ids || [];
    const updatedIds = currentIds.filter((id) => id !== idToRemove);
    try {
      const updated = await synthesisService.updateSection(project.id, activeSection.id, {
        candidate_article_ids: updatedIds,
      });
      setActiveSection(updated);
      await loadSectionsData(true);
    } catch (err: any) {
      alert('Error al quitar ID candidato: ' + (err.response?.data?.detail || err.message));
    }
  };

  // Copiar borrador al portapapeles
  const handleCopyDraft = () => {
    if (!editableDraft) return;
    navigator.clipboard.writeText(editableDraft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Descargar borrador en archivo .md
  const handleDownloadMarkdown = () => {
    if (!editableDraft) return;
    const currentTab = mainSectionTabs.find((t) => t.key === selectedSectionKey)!;
    const blob = new Blob([editableDraft], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Sintesis_${currentTab.key}_${project.title.replace(/\s+/g, '_')}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Formateador simple de Markdown para previsualización enriquecida con Citas [ID]
  const renderMarkdownPreview = (text: string) => {
    if (!text) return <p className="text-slate-400 italic text-xs">No hay borrador generado para esta sección.</p>;

    const lines = text.split('\n');
    return (
      <div className="space-y-3 font-sans text-xs text-slate-800 leading-relaxed">
        {lines.map((line, idx) => {
          if (line.startsWith('# ')) {
            return <h1 key={idx} className="text-lg font-extrabold text-slate-900 border-b pb-1 mt-4">{line.replace('# ', '')}</h1>;
          }
          if (line.startsWith('## ')) {
            return <h2 key={idx} className="text-base font-bold text-emerald-900 mt-3">{line.replace('## ', '')}</h2>;
          }
          if (line.startsWith('### ')) {
            return <h3 key={idx} className="text-sm font-bold text-slate-800 mt-2">{line.replace('### ', '')}</h3>;
          }
          if (line.startsWith('- ') || line.startsWith('* ')) {
            return (
              <li key={idx} className="ml-4 list-disc text-slate-700">
                {renderInlineCitations(line.substring(2))}
              </li>
            );
          }
          if (!line.trim()) {
            return <div key={idx} className="h-1" />;
          }
          return <p key={idx}>{renderInlineCitations(line)}</p>;
        })}
      </div>
    );
  };

  // Renderizador de Citas por ID exacto [AgentJulc] con distintivo visual
  const renderInlineCitations = (text: string) => {
    const parts = text.split(/(\[[A-Za-z0-9_\-\.]+\]|\([A-Za-z0-9_\-\.]+\))/g);
    return parts.map((part, i) => {
      if (/^(\[[A-Za-z0-9_\-\.]+\]|\([A-Za-z0-9_\-\.]+\))$/.test(part)) {
        return (
          <span
            key={i}
            className="inline-flex items-center px-1.5 py-0.2 mx-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-2xs"
            title="Evidencia citada por ID de la Matriz"
          >
            {part}
          </span>
        );
      }
      return part;
    });
  };

  const currentTab = mainSectionTabs.find((t) => t.key === selectedSectionKey)!;
  const isResultsTab = currentTab.type === 'RESULTS_OBJECTIVE';
  const isGuidedSection = isGuidedWritingSection(currentTab.type);

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between text-amber-800 text-xs">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => loadSectionsData()}
            className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 font-semibold rounded-lg text-[11px]"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* 1. CABECERA Y RESUMEN GENERAL DEL HITO 5 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <FileText className="w-5 h-5 text-emerald-600" />
              <span>Síntesis y Redacción Científica (Hito 5)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Prepara los primeros apartados con asistencia de IA y desarrolla Resultados, Discusión y Conclusiones con guías para el investigador.
            </p>
          </div>

          <div className="flex items-center space-x-2 text-xs">
            <span className="badge-green text-xs font-bold">
              {sections.filter((s) => !isGuidedWritingSection(s.section_type) && s.status === 'COMPLETED').length} / 3 Borradores IA completados
            </span>
          </div>
        </div>

        {/* SELECTOR DE PROVEEDOR Y MODELO DE IA */}
        {!isGuidedSection && <AiModelSelectorBlock
          usage="drafting"
          provider={provider}
          model={model}
          temperature={temperature}
          onChange={(config) => {
            setProvider(config.provider);
            setModel(config.model);
            setTemperature(config.temperature);
          }}
        />}
      </div>

      {/* 2. CONMUTADOR DE SECCIONES PRINCIPALES DE REDACCIÓN */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-6">
        <div className="flex items-center space-x-2 border-b border-slate-100 pb-4 overflow-x-auto no-scrollbar">
          {mainSectionTabs.map((tab) => {
            const sec = sections.find((s) => s.section_type === tab.type);
            const isDone = !isGuidedWritingSection(tab.type) && sec?.status === 'COMPLETED';
            const isWriting = !isGuidedWritingSection(tab.type) && (sec?.status === 'WRITING_BY_AI' || sec?.status === 'SELECTING_IDS');
            const isSelected = selectedSectionKey === tab.key;

            return (
              <button
                key={tab.key}
                onClick={() => handleSelectSectionKey(tab.key)}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center space-x-2 border ${
                  isSelected
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-600/20'
                    : isDone
                    ? 'bg-emerald-50/60 text-emerald-900 border-emerald-200 hover:bg-emerald-100'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {isWriting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : isDone ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span>{tab.title}</span>
              </button>
            );
          })}
        </div>

        {isGuidedSection ? (
          <ManualWritingGuide
            key={`${project.id}:${selectedSectionKey}:${selectedSectionKey === 'RESULTS_OBJECTIVE' ? selectedObjectiveCode : 'all'}`}
            project={project}
            section={selectedSectionKey}
            objectives={getProjectObjectivesList()}
            objectiveCode={getProjectObjectivesList().some((item) => item.code === selectedObjectiveCode) ? selectedObjectiveCode : getProjectObjectivesList()[0].code}
            onObjectiveChange={handleSelectObjectiveCode}
          />
        ) : <>
        <InstructionsPanel
          {...SECTION_INSTRUCTIONS[selectedSectionKey]}
          compact
        />

        {/* MODAL REGISTRO DE NUEVO OBJETIVO */}
        {showNewObjectiveModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
                  <Plus className="w-4 h-4 text-emerald-600" />
                  <span>Registrar Nuevo Objetivo de Investigación</span>
                </h3>
                <button
                  onClick={() => setShowNewObjectiveModal(false)}
                  className="text-slate-400 hover:text-slate-600 font-bold text-sm"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Código / Título del Objetivo (ej. OB2, OB3):</label>
                  <input
                    type="text"
                    placeholder="OB2"
                    value={newObjectiveCode}
                    onChange={(e) => setNewObjectiveCode(e.target.value)}
                    className="input-theme w-full text-xs py-2 px-3 uppercase font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Descripción del Objetivo:</label>
                  <textarea
                    rows={3}
                    placeholder="Analizar la precisión y rendimiento de los modelos en el corpus..."
                    value={newObjectiveDesc}
                    onChange={(e) => setNewObjectiveDesc(e.target.value)}
                    className="input-theme w-full text-xs py-2 px-3"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => setShowNewObjectiveModal(false)}
                  className="btn-outline-theme text-xs py-1.5 px-3"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateNewObjective}
                  className="btn-green text-xs py-1.5 px-4 font-bold"
                >
                  Registrar Objetivo
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 3. DETALLE Y FLUJO OPERATIVO DE LA SECCIÓN SELECCIONADA */}
        <div className="space-y-6">
          {/* SUB-BARRA DE OBJETIVOS DE INVESTIGACIÓN (EXCLUSIVA DE LA SECCIÓN DE RESULTADOS) */}
          {selectedSectionKey === 'RESULTS_OBJECTIVE' && (() => {
            const objectivesList = getProjectObjectivesList();

            return (
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-2.5">
                  <div className="flex items-center space-x-2">
                    <Sliders className="w-4 h-4 text-emerald-600" />
                    <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                      Objetivos de Investigación del Proyecto ({objectivesList.length})
                    </h4>
                  </div>
                  <button
                    onClick={() => setShowNewObjectiveModal(true)}
                    className="btn-outline-theme text-xs py-1 px-3 inline-flex items-center space-x-1 whitespace-nowrap"
                    title="Registrar un nuevo objetivo de investigación (OB2, OB3...)"
                  >
                    <Plus className="w-3.5 h-3.5 text-emerald-600" />
                    <span>+ Registrar Nuevo Objetivo</span>
                  </button>
                </div>

                {/* PILLS DE SELECCIÓN DE OBJETIVOS EXISTENTES */}
                <div className="flex flex-wrap gap-2">
                  {objectivesList.map((ob) => {
                    const isSelectedObj = selectedObjectiveCode === ob.code;
                    const isObDone = ob.section?.status === 'COMPLETED';

                    return (
                      <button
                        key={ob.code}
                        onClick={() => handleSelectObjectiveCode(ob.code)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 border ${
                          isSelectedObj
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                            : isObDone
                            ? 'bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {isObDone && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                        <span className="font-mono">[{ob.code}]</span>
                        <span className="font-medium opacity-90 truncate max-w-[200px]">{ob.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                <span>
                  {currentTab.title}
                  {selectedSectionKey === 'RESULTS_OBJECTIVE' && ` (${selectedObjectiveCode})`}
                </span>
                {activeSection?.status && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                      activeSection.status === 'COMPLETED'
                        ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                        : activeSection.status === 'WRITING_BY_AI'
                        ? 'bg-blue-100 text-blue-900 border border-blue-300 animate-pulse'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {activeSection.status}
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {selectedSectionKey === 'RESULTS_OBJECTIVE'
                  ? `Resultados y evidencia para: ${
                      getProjectObjectivesList().find((o) => o.code === selectedObjectiveCode)?.description || selectedObjectiveCode
                    }`
                  : currentTab.description}
              </p>
            </div>

            {/* BOTONES DE ACCIÓN DE IA */}
            <div className="flex flex-wrap items-center gap-2">
              {(() => {
                const isMethodologyTab = currentTab.type === 'METHODOLOGY_PRISMA';
                const hasNoCandidateIds = !isMethodologyTab && (!activeSection?.candidate_article_ids || activeSection.candidate_article_ids.length === 0);
                const hasNoColumns = isResultsTab && (!activeSection?.trimmed_columns_used || activeSection.trimmed_columns_used.length === 0);

                if (isResultsTab) {
                  return (
                    <>
                      {/* PASO 1: RECOMENDAR COLUMNAS */}
                      <button
                        onClick={handleEvaluateEligibility}
                        disabled={taskInProgress}
                        className="btn-outline-theme text-xs py-1.5 px-3 inline-flex items-center space-x-1.5"
                        title="Paso 1: Recomendar columnas de la matriz necesarias para este objetivo con IA"
                      >
                        {taskInProgress && activeSection?.id === taskSectionId && taskActionType === 'ELIGIBILITY' ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                        ) : (
                          <Sliders className="w-3.5 h-3.5 text-emerald-600" />
                        )}
                        <span>1. Recomendar Columnas (IA)</span>
                      </button>

                      {/* PASO 2: IDENTIFICAR IDs CANDIDATOS */}
                      <button
                        onClick={handleIdentifyIds}
                        disabled={taskInProgress || hasNoColumns}
                        className={`btn-outline-theme text-xs py-1.5 px-3 inline-flex items-center space-x-1.5 ${
                          hasNoColumns ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                        title={
                          hasNoColumns
                            ? 'Debes recomendar o confirmar al menos 1 columna de la matriz antes de identificar los IDs candidatos'
                            : 'Paso 2: Identificar artículos candidatos pertinentes usando las columnas confirmadas'
                        }
                      >
                        {taskInProgress && activeSection?.id === taskSectionId && taskActionType === 'IDENTIFY_IDS' ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        )}
                        <span>2. Identificar IDs (IA)</span>
                      </button>

                      {/* PASO 3: TABLA COMPARATIVA JSONB */}
                      <button
                        onClick={() => handleGenerateTable(false)}
                        disabled={taskInProgress || hasNoCandidateIds}
                        className={`btn-outline-theme text-xs py-1.5 px-3 inline-flex items-center space-x-1.5 ${
                          hasNoCandidateIds ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                        title={
                          hasNoCandidateIds
                            ? 'Debes identificar o agregar al menos 1 ID de artículo candidato antes de generar la tabla comparativa'
                            : activeSection?.generated_table && activeSection.generated_table.length > 0
                            ? 'Paso 3: Ya existe una tabla sintética. Haz clic para regenerarla (se solicitará confirmación)'
                            : 'Paso 3: Generar Tabla Sintética Comparativa JSONB para este objetivo'
                        }
                      >
                        {taskInProgress && activeSection?.id === taskSectionId && taskActionType === 'TABLE' ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                        ) : (
                          <Layers className="w-3.5 h-3.5 text-emerald-600" />
                        )}
                        <span>
                          {activeSection?.generated_table && activeSection.generated_table.length > 0
                            ? '3. Regenerar Tabla (IA)'
                            : '3. Tabla Comparativa (IA)'}
                        </span>
                      </button>

                      {/* PASO 4: REDACTAR NARRATIVA DE RESULTADOS */}
                      <button
                        onClick={handleGenerateDraft}
                        disabled={taskInProgress || hasNoCandidateIds}
                        className={`btn-green text-xs py-1.5 px-3.5 inline-flex items-center space-x-1.5 shadow-2xs ${
                          hasNoCandidateIds ? 'opacity-50 cursor-not-allowed bg-slate-300 hover:bg-slate-300 text-slate-500 border-slate-300' : ''
                        }`}
                        title={
                          hasNoCandidateIds
                            ? 'Debes identificar o agregar al menos 1 ID de artículo candidato antes de solicitar la redacción con IA'
                            : 'Paso Final: Redactar narrativa profunda de resultados en Markdown citando evidencia con [ID]'
                        }
                      >
                        {taskInProgress && activeSection?.id === taskSectionId && taskActionType === 'DRAFT' ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                        <span>Redactar Sección (IA)</span>
                      </button>
                    </>
                  );
                }

                const isDiscussionTab = currentTab.type === 'DISCUSSION';
                const isConclusionsTab = currentTab.type === 'CONCLUSIONS';
                const hasObjectiveDrafts = sections.some((s) => s.section_type === 'RESULTS_OBJECTIVE' && !!s.generated_draft);
                const hasDiscussionDraft = sections.some((s) => s.section_type === 'DISCUSSION' && !!s.generated_draft);

                let isDraftDisabled = taskInProgress;
                let draftTooltip = 'Redactar narrativa de la sección en Markdown siguiendo el protocolo del proyecto';

                if (isDiscussionTab) {
                  if (!hasObjectiveDrafts) {
                    isDraftDisabled = true;
                    draftTooltip = 'Debe redactar primero los Resultados de al menos un Objetivo de investigación.';
                  } else {
                    draftTooltip = 'Redactar Discusión transversal con contraste de objetivos y Marco Teórico Emergente de un solo tirón';
                  }
                } else if (isConclusionsTab) {
                  if (!hasObjectiveDrafts || !hasDiscussionDraft) {
                    isDraftDisabled = true;
                    draftTooltip = 'Es obligatorio haber redactado primero los Resultados y el borrador de la sección de Discusión.';
                  } else {
                    draftTooltip = 'Redactar Conclusiones finales y líneas futuras basadas estrictamente en Resultados y Discusión';
                  }
                } else if (!isMethodologyTab) {
                  if (hasNoCandidateIds) {
                    isDraftDisabled = true;
                    draftTooltip = 'Debes evaluar o agregar al menos 1 ID de artículo candidato antes de solicitar la redacción con IA.';
                  }
                }

                return (
                  <>
                    {!isMethodologyTab && !isDiscussionTab && !isConclusionsTab && (
                      <button
                        onClick={handleEvaluateEligibility}
                        disabled={taskInProgress}
                        className="btn-outline-theme text-xs py-1.5 px-3 inline-flex items-center space-x-1.5"
                        title="Paso 1: Evaluar elegibilidad de artículos candidatos e identificar razones del porqué"
                      >
                        {taskInProgress && activeSection?.id === taskSectionId && taskActionType === 'ELIGIBILITY' ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                        ) : (
                          <Sliders className="w-3.5 h-3.5 text-emerald-600" />
                        )}
                        <span>1. Evaluar Elegibilidad (IA)</span>
                      </button>
                    )}

                    <button
                      onClick={handleGenerateDraft}
                      disabled={isDraftDisabled}
                      className={`btn-green text-xs py-1.5 px-3.5 inline-flex items-center space-x-1.5 shadow-2xs ${
                        isDraftDisabled ? 'opacity-50 cursor-not-allowed bg-slate-300 hover:bg-slate-300 text-slate-500 border-slate-300' : ''
                      }`}
                      title={draftTooltip}
                    >
                      {taskInProgress && activeSection?.id === taskSectionId && taskActionType === 'DRAFT' ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {isDiscussionTab
                          ? 'Redactar Discusión (IA)'
                          : isConclusionsTab
                          ? 'Redactar Conclusiones (IA)'
                          : 'Redactar Sección (IA)'}
                      </span>
                    </button>
                  </>
                );
              })()}
            </div>
          </div>

          {/* INDICADOR DE TAREA CELERY EN CURSO */}
          {taskInProgress && taskMessage && (
            <div className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-xl flex items-center space-x-3 text-xs text-emerald-900 font-semibold animate-pulse">
              <RefreshCw className="w-4 h-4 animate-spin text-emerald-700 flex-shrink-0" />
              <span>{taskMessage}</span>
            </div>
          )}

          {/* VISUALIZACIÓN DE COLUMNAS SELECCIONADAS / RECORTADAS POR LA IA PARA ESTE OBJETIVO */}
          {activeSection?.trimmed_columns_used && activeSection.trimmed_columns_used.length > 0 && (
            <div className="bg-emerald-50/70 border border-emerald-200 p-3.5 rounded-xl space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5 font-bold text-emerald-900">
                  <Columns className="w-4 h-4 text-emerald-700" />
                  <span>Columnas de la Matriz Seleccionadas por la IA ({activeSection.trimmed_columns_used.length}):</span>
                </div>
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                  Retribución Inteligente de Columnas
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {activeSection.trimmed_columns_used.map((col, cIdx) => (
                  <span
                    key={cIdx}
                    className="bg-white text-emerald-950 font-semibold text-[11px] px-2.5 py-1 rounded-lg border border-emerald-300/70 shadow-2xs flex items-center space-x-1"
                  >
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    <span>{col}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* SECTOR OPCIONAL: SELECCIÓN DE COLUMNAS PERSONALIZADAS DE LA MATRIZ PARA EL OBJETIVO */}
          {currentTab.type === 'RESULTS_OBJECTIVE' && (
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="font-bold text-slate-800 flex items-center space-x-1.5">
                  <Columns className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Columnas personalizadas adicionales para retribución (Opcional):</span>
                </span>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    placeholder="Nombre de columna..."
                    value={customColumnInput}
                    onChange={(e) => setCustomColumnInput(e.target.value)}
                    className="input-theme text-xs py-1 px-2.5 w-48"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (customColumnInput.trim() && !selectedCustomColumns.includes(customColumnInput.trim())) {
                        setSelectedCustomColumns([...selectedCustomColumns, customColumnInput.trim()]);
                        setCustomColumnInput('');
                      }
                    }}
                    disabled={!customColumnInput.trim()}
                    className="btn-outline-theme text-xs py-1 px-2.5 flex-shrink-0"
                  >
                    + Agregar
                  </button>
                </div>
              </div>

              {selectedCustomColumns.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {selectedCustomColumns.map((col, idx) => (
                    <span
                      key={idx}
                      className="bg-white text-slate-800 font-medium text-[11px] px-2 py-0.5 rounded-lg border border-slate-300 inline-flex items-center space-x-1"
                    >
                      <span>{col}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedCustomColumns(selectedCustomColumns.filter((c) => c !== col))}
                        className="text-slate-400 hover:text-rose-600 ml-1"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* VISTA DEDICADA PARA CONCLUSIONES: SÍNTESIS GLOBAL Y SÓLO 1 CLIC */}
          {currentTab.type === 'CONCLUSIONS' && (() => {
            const objectiveDraftsCount = sections.filter((s) => s.section_type === 'RESULTS_OBJECTIVE' && !!s.generated_draft).length;
            const totalObjectives = getProjectObjectivesList().length;
            const discussionDraft = sections.find((s) => s.section_type === 'DISCUSSION')?.generated_draft;
            const isReady = objectiveDraftsCount > 0 && !!discussionDraft;

            return (
              <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center space-x-2">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      <span>Conclusiones Finales & Líneas Futuras</span>
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Esta sección sintetiza de forma global el proyecto RSL basándose en el título, objetivos del estudio, resultados y discusión previa.
                    </p>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                      isReady
                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                        : 'bg-amber-50 text-amber-900 border-amber-300'
                    }`}
                  >
                    {isReady ? 'Listo para Redactar en 1 Clic' : 'Requisitos Incompletos'}
                  </span>
                </div>

                {/* INSUMOS DEL PROYECTO CONSUMIDOS POR LA IA */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Título del Proyecto</span>
                    <p className="font-bold text-slate-900 truncate">{project.title}</p>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Insumo 1: Resultados</span>
                    <div className="flex items-center space-x-1.5 font-bold">
                      {objectiveDraftsCount > 0 ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                      )}
                      <span className={objectiveDraftsCount > 0 ? 'text-emerald-900' : 'text-amber-800'}>
                        {objectiveDraftsCount} de {totalObjectives} Objetivos Redactados
                      </span>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Insumo 2: Discusión</span>
                    <div className="flex items-center space-x-1.5 font-bold">
                      {discussionDraft ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                      )}
                      <span className={discussionDraft ? 'text-emerald-900' : 'text-amber-800'}>
                        {discussionDraft ? 'Borrador de Discusión Listo' : 'Discusión Pendiente'}
                      </span>
                    </div>
                  </div>
                </div>

                {!isReady && (
                  <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-center space-x-2 text-amber-800 text-xs">
                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <span>
                      Para redactar las Conclusiones es obligatorio haber redactado previamente al menos un Objetivo de Resultados y el borrador de la sección de Discusión.
                    </span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* FASE 1: ARTÍCULOS CANDIDATOS Y MAPA DE JUSTIFICACIONES (EXCEPTO METODOLOGÍA PRISMA Y CONCLUSIONES) */}
          {currentTab.type !== 'METHODOLOGY_PRISMA' && currentTab.type !== 'CONCLUSIONS' && (
            <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-4">
              {/* EN DISCUSIÓN: MOSTRAR LOS ARTÍCULOS HEREDADOS DE TODOS LOS OBJETIVOS DE RESULTADOS */}
              {currentTab.type === 'DISCUSSION' && (() => {
                const inherited = getInheritedObjectiveArticles();
                if (inherited.length === 0) return null;

                return (
                  <div className="bg-emerald-50/60 border border-emerald-200 p-4 rounded-xl space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-200/60 pb-2">
                      <div className="flex items-center space-x-2">
                        <Layers className="w-4 h-4 text-emerald-700" />
                        <h4 className="font-bold text-emerald-950 text-xs uppercase tracking-wider">
                          Artículos Elegibles Heredados de los Objetivos de Resultados ({inherited.length})
                        </h4>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-900 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300">
                        Integración Transversal Automática
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {inherited.map((art) => (
                        <div
                          key={art.id}
                          className="flex items-start justify-between p-2.5 bg-white border border-emerald-200 rounded-lg text-xs space-x-2.5 shadow-2xs"
                        >
                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-mono text-xs font-bold text-emerald-900 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300">
                                [{art.id}]
                              </span>
                              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                                Obtenido de {art.sourceObjective}
                              </span>
                            </div>
                            <h5 className="font-semibold text-slate-800 text-xs leading-snug truncate">
                              {art.title}
                            </h5>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div className="flex justify-between items-center">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center space-x-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>
                    {currentTab.type === 'DISCUSSION'
                      ? `Artículos Adicionales Específicos para Discusión (${activeSection?.candidate_article_ids?.length || 0})`
                      : `Artículos Elegibles Seleccionados (${activeSection?.candidate_article_ids?.length || 0})`}
                  </span>
                </h4>
              </div>

              {/* SECTOR PARA AGREGAR MANUALMENTE UN ID CANDIDATO */}
              <div className="flex items-center space-x-2">
                <select
                  value={newCandidateInput}
                  onChange={(e) => setNewCandidateInput(e.target.value)}
                  className="input-theme text-xs py-1 px-2.5 flex-1 max-w-xl truncate"
                >
                  <option value="">-- Seleccionar y agregar artículo a esta sección --</option>
                  {matrixArticles
                    .filter((art) => !(activeSection?.candidate_article_ids || []).includes(art.id))
                    .map((art) => (
                      <option key={art.id} value={art.id}>
                        [{art.id}] {art.title}
                      </option>
                    ))}
                </select>

                <button
                  onClick={() => handleAddCandidateId(newCandidateInput)}
                  disabled={!newCandidateInput}
                  className="btn-outline-theme text-xs py-1 px-3 inline-flex items-center space-x-1 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Agregar Artículo</span>
                </button>
              </div>

              {/* CARDS DE ARTÍCULOS ELEGIBLES CON ID, TÍTULO Y JUSTIFICACIÓN EXPLICATIVA */}
              {(!activeSection?.candidate_article_ids || activeSection.candidate_article_ids.length === 0) ? (
                <p className="text-xs text-slate-400 italic py-2">
                  No hay artículos elegibles asignados a esta sección. Haz clic en "1. Evaluar Elegibilidad (IA)" o agrega artículos manualmente.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
                  {activeSection.candidate_article_ids.map((id) => {
                    const reason = activeSection.selection_justifications?.[id];
                    const backendInfo = activeSection.candidate_articles?.find((a) => a.article_id === id);
                    const mapInfo = matrixArticles.find((a) => a.id === id);
                    const articleTitle = backendInfo?.title || mapInfo?.title || 'Título no disponible';

                    return (
                      <div
                        key={id}
                        className="flex items-start justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-x-3 hover:bg-slate-100/70 transition"
                      >
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-xs font-bold text-emerald-900 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300 shadow-2xs">
                              [{id}]
                            </span>
                            <h5 className="font-bold text-slate-900 text-xs leading-snug">
                              {articleTitle}
                            </h5>
                          </div>

                          {reason && (
                            <p className="text-[11px] text-slate-600 leading-relaxed pt-1 border-t border-slate-200/60 mt-1">
                              <span className="font-semibold text-emerald-800">Justificación IA: </span>
                              {reason}
                            </p>
                          )}
                        </div>

                        <button
                          onClick={() => handleRemoveCandidateId(id)}
                          className="text-slate-400 hover:text-rose-600 p-1 flex-shrink-0"
                          title="Quitar artículo de esta sección"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* FASE 2A: TABLA SINTÉTICA COMPARATIVA (SOLO EN RESULTADOS POR OBJETIVO) */}
          {isResultsTab && (() => {
            const parsed = parseGeneratedTable(activeSection?.generated_table);
            if (!parsed || parsed.rows.length === 0) return null;

            return (
              <div className="bg-white p-4.5 rounded-xl border border-slate-200 space-y-3 shadow-2xs">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center space-x-1.5">
                      <Layers className="w-4 h-4 text-emerald-600" />
                      <span>{parsed.title || `Tabla Sintética Comparativa (${parsed.rows.length} Filas)`}</span>
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Matriz sintética JSONB recortada y generada por la IA para citar en la narrativa con [ID].
                    </p>
                  </div>

                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                    JSONB Estructurado ({parsed.rows.length} Filas, {parsed.columns.length} Columnas)
                  </span>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-[350px]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-800 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200 sticky top-0 z-10">
                      <tr>
                        {parsed.columns.map((col) => (
                          <th key={col.key} className="p-2.5 border-r border-slate-200 font-bold bg-slate-100 min-w-[140px]">
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {parsed.rows.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-emerald-50/30 transition">
                          {parsed.columns.map((col) => {
                            const val = row[col.key];
                            const isArticleIdCol = col.key === 'article_id' || col.key === 'article_custom_id' || col.key === 'ID';

                            return (
                              <td key={col.key} className="p-2.5 text-[11px] text-slate-800 align-top border-r border-slate-100">
                                {isArticleIdCol ? (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded font-mono text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-2xs">
                                    {String(val ?? '-')}
                                  </span>
                                ) : (
                                  String(val ?? '-')
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* BOTÓN COPIAR TABLA EN LA PARTE INFERIOR DERECHA */}
                <div className="flex justify-end pt-1">
                  <button
                    onClick={() => handleCopyTable(parsed)}
                    className="btn-outline-theme text-xs py-1 px-2.5 inline-flex items-center space-x-1.5 shadow-2xs hover:bg-emerald-50"
                    title="Copiar contenido de la tabla al portapapeles (compatible con Excel / Word / TSV)"
                  >
                    {tableCopied ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700 font-bold">¡Tabla Copiada!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-600" />
                        <span>Copiar Tabla</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })()}

          {/* FASE 3: EDITOR Y VISUALIZADOR DE BORRADOR MARKDOWN */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4 shadow-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center space-x-2">
                <Edit3 className="w-4 h-4 text-emerald-600" />
                <span>Borrador Redactado de la Sección (Markdown)</span>
              </h4>

              <div className="flex items-center space-x-2">
                {/* CONMUTADOR VISTA PREVIA VS EDITOR PLANO */}
                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-xs">
                  <button
                    onClick={() => setViewMode('preview')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center space-x-1 ${
                      viewMode === 'preview' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Vista Previa</span>
                  </button>
                  <button
                    onClick={() => setViewMode('edit')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center space-x-1 ${
                      viewMode === 'edit' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Code className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Editar Markdown</span>
                  </button>
                </div>

                <button
                  onClick={handleCopyDraft}
                  disabled={!editableDraft}
                  className="btn-outline-theme text-xs py-1 px-2.5 inline-flex items-center space-x-1"
                  title="Copiar texto borrador al portapapeles"
                >
                  <Copy className="w-3.5 h-3.5 text-slate-600" />
                  <span>{copied ? '¡Copiado!' : 'Copiar'}</span>
                </button>

                <button
                  onClick={handleDownloadMarkdown}
                  disabled={!editableDraft}
                  className="btn-outline-theme text-xs py-1 px-2.5 inline-flex items-center space-x-1"
                  title="Descargar archivo Markdown (.md)"
                >
                  <Download className="w-3.5 h-3.5 text-slate-600" />
                  <span>.md</span>
                </button>

                <button
                  onClick={handleSaveManualEdits}
                  disabled={!activeSection}
                  className="btn-green text-xs py-1.5 px-3.5 inline-flex items-center space-x-1.5 shadow-2xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Guardar Borrador</span>
                </button>
              </div>
            </div>

            {/* CAMPO DE INSTRUCCIONES PERSONALIZADAS / DIRECTIVAS AL LLM */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-700 block">
                Instrucciones Personalizadas para la IA (Opcional):
              </label>
              <input
                type="text"
                placeholder="Ej: Enfócate en el contraste de métodos cuantitativos, usa un tono académico formal..."
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                className="input-theme w-full text-xs py-1.5 px-3"
              />
            </div>

            {/* CONTENIDO DEL BORRADOR: VISTA PREVIA O EDITOR PLANO */}
            {viewMode === 'preview' ? (
              <div className="p-4 bg-slate-50/50 rounded-xl border border-slate-200 min-h-[220px]">
                {renderMarkdownPreview(editableDraft)}
              </div>
            ) : (
              <textarea
                rows={14}
                value={editableDraft}
                onChange={(e) => setEditableDraft(e.target.value)}
                placeholder="El borrador en Markdown generado por la IA aparecerá aquí..."
                className="input-theme w-full text-xs font-mono p-3 leading-relaxed"
              />
            )}
          </div>
        </div>
        </>}
      </div>
    </div>
  );
};

export default SynthesisDraftingTab;
