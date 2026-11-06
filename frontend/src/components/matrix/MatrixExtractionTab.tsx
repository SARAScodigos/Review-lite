import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Table,
  Sparkles,
  RefreshCw,
  FileSpreadsheet,
  Upload,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  Edit3,
  Trash2,
  ExternalLink,
  Layers,
  Check,
  AlertCircle,
  ArrowUpDown,
  Sliders,
  ArrowUp,
  ArrowDown,
  Bot,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';
import type { RSLProject } from '../../types/project';
import { AiModelSelectorBlock } from '../common/AiModelSelectorBlock';
import { DEFAULT_AI_MODEL, DEFAULT_AI_PROVIDER } from '../common/aiModelSelection';
import { matrixService } from '../../services/matrixService';
import type {
  ExtractedMatrixRowItem,
  MatrixWorkbenchCandidateItem,
  MatrixWorkbenchMetrics,
  ExtractionReviewStatus,
  MatrixColumnItem
} from '../../services/matrixService';
import { pdfService } from '../../services/pdfService';

interface MatrixExtractionTabProps {
  project: RSLProject;
}

const STANDARD_COLUMNS = [
  'ID',
  'Año de publicación',
  'Título',
  'DOI',
  'Autor(es)',
  'Abstract',
  'Tipo de artículo',
  'Objetivos generales',
  'Palabras clave',
  'Introducción',
  'Fundamentación Teórica',
  'Metodología',
  'Diseño',
  'Población Muestra y Muestreo',
  'Resultados',
  'Discusión',
  'Conclusiones',
  'Relación con el título de investigación',
];

export const MatrixExtractionTab: React.FC<MatrixExtractionTabProps> = ({ project }) => {
  // Configuración de IA para extracción
  const [provider, setProvider] = useState<string>(DEFAULT_AI_PROVIDER);
  const [model, setModel] = useState<string>(DEFAULT_AI_MODEL);
  const [temperature, setTemperature] = useState<number>(0.1);

  // Persistencia de Pestaña Activa en la URL (?tab=matriz&subtab=matrix) para conservar el estado al recargar
  const [searchParams, setSearchParams] = useSearchParams();
  const subtabFromUrl = searchParams.get('subtab') as 'workbench' | 'matrix' | null;
  const activeSubView: 'workbench' | 'matrix' = subtabFromUrl === 'matrix' ? 'matrix' : 'workbench';

  const setActiveSubView = (newSubTab: 'workbench' | 'matrix') => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('subtab', newSubTab);
      return next;
    });
  };

  // Estado de Datos
  const [workbenchItems, setWorkbenchItems] = useState<MatrixWorkbenchCandidateItem[]>([]);
  const [workbenchTotal, setWorkbenchTotal] = useState<number>(0);
  const [matrixRows, setMatrixRows] = useState<ExtractedMatrixRowItem[]>([]);
  const [metrics, setMetrics] = useState<MatrixWorkbenchMetrics | null>(null);

  // Cargando y Errores
  const [loading, setLoading] = useState<boolean>(true);
  const [extractingBatch, setExtractingBatch] = useState<boolean>(false);
  const [singleExtractingId, setSingleExtractingId] = useState<string | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Paginación
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Búsqueda y Filtros
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Edición Directa Inline de Filas (sin modal)
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [inlineEditFormData, setInlineEditFormData] = useState<Record<string, any>>({});
  const [inlineEditStatus, setInlineEditStatus] = useState<ExtractionReviewStatus>('CONFIRMED');
  const [savingInlineRowId, setSavingInlineRowId] = useState<string | null>(null);

  // Modal de Creación de Fila Manual Desacoplada
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [manualCustomId, setManualCustomId] = useState<string>('');
  const [manualFormData, setManualFormData] = useState<Record<string, any>>({});
  const [savingManualRow, setSavingManualRow] = useState<boolean>(false);

  // Input oculto para importación de Excel/CSV
  const excelFileInputRef = useRef<HTMLInputElement | null>(null);
  const [importingExcel, setImportingExcel] = useState<boolean>(false);

  // Modal y Gestión de Columnas de Matriz (GET/POST/PATCH/DELETE /matrix/columns)
  const [allColumns, setAllColumns] = useState<MatrixColumnItem[]>([]);
  const [showColumnsModal, setShowColumnsModal] = useState<boolean>(false);
  const [newColumnName, setNewColumnName] = useState<string>('');
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingColumnName, setEditingColumnName] = useState<string>('');
  const [savingColumn, setSavingColumn] = useState<boolean>(false);

  // Fallback seguro en caso de carga inicial
  const fallbackColumns: MatrixColumnItem[] = STANDARD_COLUMNS.map((name, idx) => ({
    id: null,
    project_id: project.id,
    name,
    position: idx,
    is_predefined: true,
    is_ai_extractable: idx >= 6,
    include_in_ai: idx >= 6,
  }));

  // Cargar columnas completas desde la API (las 18 base + personalizadas)
  const loadColumns = async () => {
    try {
      const cols = await matrixService.getMatrixColumns(project.id);
      if (Array.isArray(cols) && cols.length > 0) {
        setAllColumns(cols);
      } else {
        setAllColumns(fallbackColumns);
      }
    } catch (err) {
      console.error('Error al cargar columnas de la matriz:', err);
    }
  };

  const handleCreateColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColumnName.trim()) return;
    setSavingColumn(true);
    try {
      await matrixService.createMatrixColumn(project.id, newColumnName.trim());
      setNewColumnName('');
      await loadColumns();
      await loadData(true);
    } catch (err: any) {
      alert('Error al crear columna: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSavingColumn(false);
    }
  };

  const handleUpdateColumnName = async (columnId: string) => {
    if (!editingColumnName.trim()) return;
    setSavingColumn(true);
    try {
      await matrixService.updateMatrixColumn(project.id, columnId, { name: editingColumnName.trim() });
      setEditingColumnId(null);
      await loadColumns();
      await loadData(true);
    } catch (err: any) {
      alert('Error al renombrar columna: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSavingColumn(false);
    }
  };

  const handleToggleAiInclusion = async (colName: string, currentInclude: boolean) => {
    setSavingColumn(true);
    try {
      await matrixService.toggleColumnAiInclusion(project.id, colName, !currentInclude);
      await loadColumns();
      await loadData(true);
    } catch (err: any) {
      alert('Error al cambiar configuración de IA: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSavingColumn(false);
    }
  };

  const handleReorderColumn = async (columnId: string, currentPos: number, direction: 'up' | 'down') => {
    const targetPos = direction === 'up' ? currentPos - 1 : currentPos + 1;
    if (targetPos < 0 || targetPos >= customColumns.length) return;

    setSavingColumn(true);
    try {
      await matrixService.updateMatrixColumn(project.id, columnId, { position: targetPos });
      await loadColumns();
      await loadData(true);
    } catch (err: any) {
      alert('Error al reordenar columna: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSavingColumn(false);
    }
  };

  const handleDeleteColumn = async (columnId: string, colName: string) => {
    if (!confirm(`¿Eliminar la columna personalizada "${colName}"? Esta clave se quitará de todas las filas del proyecto.`)) {
      return;
    }
    setSavingColumn(true);
    try {
      await matrixService.deleteMatrixColumn(project.id, columnId);
      await loadColumns();
      await loadData(true);
    } catch (err: any) {
      alert('Error al eliminar columna: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSavingColumn(false);
    }
  };

  // Cargar Workbench, Matriz, Métricas y Columnas (con parámetro silencioso para evitar parpadeos)
  const loadData = async (isSilent: boolean = false) => {
    if (!isSilent) setLoading(true);
    setError(null);
    try {
      const skip = (page - 1) * pageSize;
      const [wbRes, rowsRes, metRes, colsRes] = await Promise.all([
        matrixService.getWorkbenchCandidates(project.id, skip, pageSize).catch(() => null),
        matrixService.getMatrixRows(project.id).catch(() => []),
        matrixService.getMatrixMetrics(project.id).catch(() => null),
        matrixService.getMatrixColumns(project.id).catch(() => []),
      ]);

      if (wbRes) {
        setWorkbenchItems(wbRes.items || []);
        setWorkbenchTotal(wbRes.total || 0);
      }
      setMatrixRows(rowsRes || []);
      setMetrics(metRes);
      if (Array.isArray(colsRes) && colsRes.length > 0) {
        setAllColumns(colsRes);
      } else {
        setAllColumns(fallbackColumns);
      }
    } catch (err: any) {
      console.error('Error cargando matriz de extracción:', err);
      if (!isSilent) setError('No se pudo comunicar con el módulo de Matriz de Extracción.');
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [project.id, page, pageSize]);

  // Persistir activeTaskId y singleExtractingId en localStorage para mantener el spinner exacto tras recargar
  useEffect(() => {
    const savedTaskId = localStorage.getItem(`matrix_active_task_${project.id}`);
    const savedSingleId = localStorage.getItem(`matrix_single_extracting_id_${project.id}`);
    if (savedTaskId) {
      setActiveTaskId(savedTaskId);
      if (savedSingleId) {
        setSingleExtractingId(savedSingleId);
        setExtractingBatch(false);
      } else {
        setExtractingBatch(true);
      }
    }
  }, [project.id]);

  useEffect(() => {
    if (activeTaskId) {
      localStorage.setItem(`matrix_active_task_${project.id}`, activeTaskId);
    } else {
      localStorage.removeItem(`matrix_active_task_${project.id}`);
    }
  }, [activeTaskId, project.id]);

  useEffect(() => {
    if (singleExtractingId) {
      localStorage.setItem(`matrix_single_extracting_id_${project.id}`, singleExtractingId);
    } else {
      localStorage.removeItem(`matrix_single_extracting_id_${project.id}`);
    }
  }, [singleExtractingId, project.id]);

  // Polling inteligente mientras Celery esté extrayendo en segundo plano (sin parpadeos)
  useEffect(() => {
    if (!extractingBatch && !activeTaskId) return;

    const refreshTask = async () => {
      await loadData(true);
      if (!activeTaskId) return;

      try {
        const task = await matrixService.getMatrixExtractionTaskStatus(project.id, activeTaskId);
        if (['SUCCESS', 'FAILURE', 'REVOKED'].includes(task.status)) {
          localStorage.removeItem(`matrix_active_task_${project.id}`);
          localStorage.removeItem(`matrix_single_extracting_id_${project.id}`);
          setActiveTaskId(null);
          setExtractingBatch(false);
          setSingleExtractingId(null);
          await loadData(true);
          if (task.status !== 'SUCCESS') {
            alert('La extracción de matriz terminó con error. Revisa el detalle de la tarea o los logs del backend.');
          }
        }
      } catch {
        // La tabla sigue actualizándose en silencio
      }
    };

    void refreshTask();
    const interval = setInterval(() => {
      void refreshTask();
    }, 3000); // Polling silencioso cada 3 segundos mientras haya una tarea activa

    return () => clearInterval(interval);
  }, [extractingBatch, activeTaskId, project.id, page, pageSize]);

  // 1. Iniciar Extracción Masiva con IA en Celery (POST /extract-all)
  const handleStartBatchExtraction = async () => {
    if (!confirm(`¿Iniciar la extracción masiva analítica de matrices desde PDFs con IA (${provider} / ${model} / Temp: ${temperature})?`)) {
      return;
    }
    setSingleExtractingId(null);
    localStorage.removeItem(`matrix_single_extracting_id_${project.id}`);
    setExtractingBatch(true);
    try {
      const res = await matrixService.extractAllPdfs(project.id, {
        provider,
        model,
        temperature,
      });
      setActiveTaskId(res.task_id);
      await loadData(true);
    } catch (err: any) {
      alert('Error al iniciar extracción masiva: ' + (err.response?.data?.detail || err.message));
      setExtractingBatch(false);
    }
  };

  // 2. Extraer Fila Individual a Demanda (POST /records/{record_id}/extract)
  const handleExtractSingleRecord = async (recordId: string) => {
    setSingleExtractingId(recordId);
    localStorage.setItem(`matrix_single_extracting_id_${project.id}`, recordId);
    setExtractingBatch(false);
    try {
      const task = await matrixService.extractSingleRecord(project.id, recordId, {
        provider,
        model,
        temperature,
      });
      setActiveTaskId(task.task_id);
      await loadData(true);
    } catch (err: any) {
      alert('Error extrayendo matriz del artículo: ' + (err.response?.data?.detail || err.message));
      setSingleExtractingId(null);
      localStorage.removeItem(`matrix_single_extracting_id_${project.id}`);
    }
  };

  // 3. Confirmar Decisión Humana de Texto Completo (POST /confirm-fulltext)
  const handleConfirmFulltext = async (recordId: string, finalStatus: 'INCLUDED' | 'EXCLUDED') => {
    const reasonPrompt = finalStatus === 'EXCLUDED'
      ? prompt('Ingresa el motivo o criterio de exclusión a texto completo (Opcional):')
      : null;

    try {
      await matrixService.confirmFulltextDecision(project.id, recordId, finalStatus, reasonPrompt || undefined);
      await loadData();
    } catch (err: any) {
      alert('Error al confirmar texto completo: ' + (err.response?.data?.detail || err.message));
    }
  };

  // 4. Edición Directa Inline de Filas (PUT /rows/{row_id})
  const handleStartInlineEdit = (row: ExtractedMatrixRowItem) => {
    setEditingRowId(row.id);
    setInlineEditFormData({ ...row.extraction_data });
    setInlineEditStatus(row.review_status || 'CONFIRMED');
  };

  const handleCancelInlineEdit = () => {
    setEditingRowId(null);
    setInlineEditFormData({});
  };

  const handleSaveInlineEdit = async (rowId: string) => {
    setSavingInlineRowId(rowId);
    try {
      await matrixService.updateMatrixRow(project.id, rowId, {
        extraction_data: inlineEditFormData,
        review_status: inlineEditStatus,
      });
      setEditingRowId(null);
      await loadData(true);
    } catch (err: any) {
      alert('Error al guardar cambios en la fila: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSavingInlineRowId(null);
    }
  };

  // 5. Crear Fila Manual Desacoplada (POST /rows)
  const handleCreateManualRowSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingManualRow(true);
    try {
      await matrixService.createManualRow(project.id, {
        article_custom_id: manualCustomId.trim() || undefined,
        extraction_data: manualFormData,
        review_status: 'CONFIRMED',
      });
      setShowCreateModal(false);
      setManualCustomId('');
      setManualFormData({});
      await loadData();
    } catch (err: any) {
      alert('Error al crear fila manual: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSavingManualRow(false);
    }
  };

  // 6. Eliminar Fila de la Matriz (DELETE /rows/{row_id})
  const handleDeleteRow = async (rowId: string) => {
    if (!confirm('¿Deseas eliminar esta fila de la matriz de extracción?')) return;
    try {
      await matrixService.deleteMatrixRow(project.id, rowId);
      await loadData();
    } catch (err: any) {
      alert('Error al eliminar fila: ' + (err.response?.data?.detail || err.message));
    }
  };

  // 7. Importar Matriz desde Excel/CSV (POST /import-excel)
  const handleImportExcelSubmit = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];

    setImportingExcel(true);
    try {
      await matrixService.importMatrixExcel(project.id, file);
      alert('Matriz Excel/CSV importada correctamente de forma desacoplada.');
      await loadData();
    } catch (err: any) {
      alert('Error al importar Excel: ' + (err.response?.data?.detail || err.message));
    } finally {
      setImportingExcel(false);
      if (excelFileInputRef.current) excelFileInputRef.current.value = '';
    }
  };

  // Filtros y ordenación tipo Excel en los encabezados del Workbench
  const [wbSourceFilter, setWbSourceFilter] = useState<string>('ALL');
  const [wbPdfFilter, setWbPdfFilter] = useState<string>('ALL');
  const [wbMatrixReviewFilter, setWbMatrixReviewFilter] = useState<string>('ALL');
  const [wbFulltextFilter, setWbFulltextFilter] = useState<string>('ALL');
  const [wbSortColumn, setWbSortColumn] = useState<'title' | 'source' | null>(null);
  const [wbSortDirection, setWbSortDirection] = useState<'asc' | 'desc'>('asc');

  const toggleWbSort = (col: 'title' | 'source') => {
    if (wbSortColumn === col) {
      setWbSortDirection(wbSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setWbSortColumn(col);
      setWbSortDirection('asc');
    }
  };

  const availableWbSources = Array.from(
    new Set(workbenchItems.map((i) => i.database_source).filter(Boolean))
  );

  // Construir columnas visibles según Sección 4.4 de matriz_extraccion.md:
  // GET /columns devuelve la lista completa (18 base + personalizadas) ordenada por position
  const displayColumns = (allColumns && allColumns.length > 0 ? allColumns : fallbackColumns)
    .slice()
    .sort((a, b) => a.position - b.position);

  const customColumns = displayColumns.filter((c) => c.is_predefined === false || Boolean(c.id));

  const allTableHeaders = Array.from(new Set(displayColumns.map((c) => c.name)));

  // Filtrado y ordenación de Workbench en cliente
  const filteredWorkbenchItems = workbenchItems
    .filter((item) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match = (
          (item.title && item.title.toLowerCase().includes(q)) ||
          (item.authors && item.authors.toLowerCase().includes(q)) ||
          (item.article_custom_id && item.article_custom_id.toLowerCase().includes(q)) ||
          (item.database_source && item.database_source.toLowerCase().includes(q))
        );
        if (!match) return false;
      }

      if (wbSourceFilter !== 'ALL' && item.database_source !== wbSourceFilter) {
        return false;
      }

      if (wbPdfFilter === 'WITH_PDF' && !item.pdf_file_path) return false;
      if (wbPdfFilter === 'WITHOUT_PDF' && item.pdf_file_path) return false;

      if (wbMatrixReviewFilter === 'CONFIRMED' && item.matrix_review_status !== 'CONFIRMED') return false;
      if (wbMatrixReviewFilter === 'DRAFT' && item.matrix_review_status !== 'DRAFT') return false;
      if (wbMatrixReviewFilter === 'PENDING' && item.matrix_row_id) return false;

      if (wbFulltextFilter !== 'ALL' && item.fulltext_status !== wbFulltextFilter) return false;

      return true;
    })
    .sort((a, b) => {
      if (!wbSortColumn) return 0;
      const valA = wbSortColumn === 'title' ? (a.title || '') : (a.database_source || '');
      const valB = wbSortColumn === 'title' ? (b.title || '') : (b.database_source || '');
      const cmp = valA.localeCompare(valB, 'es', { sensitivity: 'base' });
      return wbSortDirection === 'asc' ? cmp : -cmp;
    });

  // Filtros y ordenación tipo Excel en la vista de Matriz (Origen, Revisión, Año, Título, DOI, Autor, etc., excepto ID)
  const [matSourceFilter, setMatSourceFilter] = useState<string>('ALL');
  const [matReviewFilter, setMatReviewFilter] = useState<string>('ALL');
  const [matYearFilter, setMatYearFilter] = useState<string>('ALL');
  const [matDoiFilter, setMatDoiFilter] = useState<string>('ALL');
  const [matSortHeader, setMatSortHeader] = useState<string | null>(null);
  const [matSortDir, setMatSortDir] = useState<'asc' | 'desc'>('asc');

  const toggleMatSort = (header: string) => {
    if (matSortHeader === header) {
      setMatSortDir(matSortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setMatSortHeader(header);
      setMatSortDir('asc');
    }
  };

  const availableMatrixYears = Array.from(
    new Set(
      matrixRows
        .map((r) => r.extraction_data?.['Año de publicación'] || r.extraction_data?.['Año'])
        .filter(Boolean)
        .map(String)
    )
  ).sort((a, b) => b.localeCompare(a));

  const filteredMatrixRows = matrixRows
    .filter((row) => {
      const data = row.extraction_data || {};

      if (matSourceFilter !== 'ALL' && row.source_type !== matSourceFilter) return false;
      if (matReviewFilter !== 'ALL' && row.review_status !== matReviewFilter) return false;

      if (matYearFilter !== 'ALL') {
        const rowYear = String(data['Año de publicación'] || data['Año'] || '');
        if (rowYear !== matYearFilter) return false;
      }

      if (matDoiFilter === 'WITH_DOI' && !data['DOI']) return false;
      if (matDoiFilter === 'WITHOUT_DOI' && data['DOI']) return false;

      return true;
    })
    .sort((a, b) => {
      if (!matSortHeader) return 0;
      const valA = String(a.extraction_data?.[matSortHeader] || '');
      const valB = String(b.extraction_data?.[matSortHeader] || '');
      const cmp = valA.localeCompare(valB, 'es', { sensitivity: 'base', numeric: true });
      return matSortDir === 'asc' ? cmp : -cmp;
    });

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between text-amber-800 text-xs">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => loadData()}
            className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 font-semibold rounded-lg text-[11px]"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* 1. SECTOR SUPERIOR DE ACCIONES Y DESCARGA DE PLANTILLA EXCEL */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <Table className="w-5 h-5 text-emerald-600" />
              <span>Matriz de Extracción RSL & Cribado a Texto Completo (Hito 4)</span>
            </h2>
            <p className="text-xs text-slate-500">
              Extracción profunda de metadatos desde PDFs, edición celda por celda JSONB y confirmación humana PRISMA 2020.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto">
            {/* BOTÓN GESTIONAR COLUMNAS PERSONALIZADAS */}
            <button
              onClick={() => {
                loadColumns();
                setShowColumnsModal(true);
              }}
              className="btn-outline-theme inline-flex items-center space-x-1.5 text-xs py-2 px-3.5"
              title="Gestionar columnas de la matriz y activar/apagar extracción con IA (GET/POST/PATCH/DELETE /matrix/columns)"
            >
              <Sliders className="w-4 h-4 text-emerald-600" />
              <span>Gestionar Columnas ({displayColumns.length})</span>
            </button>

            {/* BOTÓN DESCARGAR PLANTILLA EXCEL (.xlsx) */}
            <a
              href={matrixService.getExcelTemplateUrl(project.id)}
              download
              className="btn-outline-theme inline-flex items-center space-x-1.5 text-xs py-2 px-3.5"
              title="Descargar plantilla limpia en Excel (.xlsx) pre-formateada con las 18 columnas estándar + variables del proyecto"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Plantilla Excel (.xlsx)</span>
            </a>

            {/* BOTÓN IMPORTAR EXCEL MASIVO */}
            <input
              ref={excelFileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleImportExcelSubmit}
              className="hidden"
            />
            <button
              onClick={() => excelFileInputRef.current?.click()}
              disabled={importingExcel}
              className="btn-outline-theme inline-flex items-center space-x-1.5 text-xs py-2 px-3.5"
              title="Importar una matriz previa hecha en Excel (.xlsx) o CSV"
            >
              {importingExcel ? (
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
              ) : (
                <Upload className="w-4 h-4 text-emerald-600" />
              )}
              <span>Importar Excel/CSV</span>
            </button>

            {/* BOTÓN CREAR FILA MANUAL DESACOPLADA */}
            <button
              onClick={() => {
                setManualFormData({});
                setShowCreateModal(true);
              }}
              className="btn-green inline-flex items-center space-x-1.5 text-xs py-2 px-3.5 shadow-2xs"
            >
              <Plus className="w-4 h-4" />
              <span>+ Fila Manual</span>
            </button>
          </div>
        </div>

        {/* 2. REUSABLE AI MODEL SELECTOR BLOCK INTEGRATED FOR MATRIX EXTRACTION */}
        <AiModelSelectorBlock
          displayOnly
          provider={provider}
          model={model}
          temperature={temperature}
          onChange={(cfg) => {
            setProvider(cfg.provider);
            setModel(cfg.model);
            setTemperature(cfg.temperature);
          }}
          disabled={extractingBatch}
          title="Selector de Modelos de Inteligencia Artificial para Extracción"
          description="Ajusta el proveedor y arquitectura LLM para analizar el texto completo de los PDFs. (Campos 1-6 provienen directo de BD sin consumir tokens)."
        />

        {/* BOTÓN PRINCIPAL DE EXTRACCIÓN MASIVA CON CELERY */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-emerald-50/60 p-4 rounded-xl border border-emerald-200">
          <div className="text-xs text-emerald-900">
            <span className="font-bold block flex items-center space-x-1">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <span>Extracción de todos los documentos disponibles</span>
            </span>
            <p className="text-[11px] text-emerald-700 mt-0.5">
              Analizará únicamente las filas pendientes o en borrador. Las filas confirmadas por el investigador no se sobrescribirán.
            </p>
          </div>

          <button
            onClick={handleStartBatchExtraction}
            disabled={extractingBatch}
            className="btn-green text-xs py-2.5 px-5 inline-flex items-center space-x-2 shadow-xs whitespace-nowrap self-stretch sm:self-auto justify-center"
          >
            {extractingBatch ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Extrayendo Matrices con IA...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Iniciar Extracción Masiva con IA</span>
              </>
            )}
          </button>
        </div>

        {/* 3. TARJETAS DE MÉTRICAS AGREGADAS DEL WORKBENCH */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase block">Candidatos T. C.</span>
            <div className="text-lg font-extrabold text-slate-900">{metrics?.total_candidates ?? 0}</div>
            <span className="text-[9px] text-slate-400">Total Aptos</span>
          </div>

          <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200 space-y-1">
            <span className="text-[10px] font-bold text-emerald-800 uppercase block">Con PDF</span>
            <div className="text-lg font-extrabold text-emerald-900">{metrics?.with_pdf ?? 0}</div>
            <span className="text-[9px] text-emerald-700">Listos para IA</span>
          </div>

          <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200 space-y-1">
            <span className="text-[10px] font-bold text-amber-800 uppercase block">Sin PDF</span>
            <div className="text-lg font-extrabold text-amber-900">{metrics?.without_pdf ?? 0}</div>
            <span className="text-[9px] text-amber-700">Requiere Carga</span>
          </div>

          <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-200 space-y-1">
            <span className="text-[10px] font-bold text-blue-800 uppercase block">Extraídos</span>
            <div className="text-lg font-extrabold text-blue-900">{metrics?.extracted_rows ?? 0}</div>
            <span className="text-[9px] text-blue-700">
              Draft: {metrics?.draft_rows ?? 0} • Conf: {metrics?.confirmed_rows ?? 0}
            </span>
          </div>

          <div className="p-3 bg-emerald-100/60 rounded-xl border border-emerald-300 space-y-1">
            <span className="text-[10px] font-bold text-emerald-900 uppercase block">PRISMA Incluidos</span>
            <div className="text-lg font-extrabold text-emerald-950">{metrics?.fulltext_included ?? 0}</div>
            <span className="text-[9px] text-emerald-800">Confirmados RSL</span>
          </div>

          <div className="p-3 bg-rose-50/60 rounded-xl border border-rose-200 space-y-1">
            <span className="text-[10px] font-bold text-rose-800 uppercase block">Excluidos</span>
            <div className="text-lg font-extrabold text-rose-900">{metrics?.fulltext_excluded ?? 0}</div>
            <span className="text-[9px] text-rose-700">Descartados</span>
          </div>
        </div>
      </div>

      {/* 4. MESA DE TRABAJO CON CONMUTADOR DE VISTAS (WORKBENCH VS MATRIZ JSONB COMPLETA) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          {/* CONMUTADOR SUB-VISTAS */}
          <div className="flex items-center space-x-2 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveSubView('workbench')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-2 ${
                activeSubView === 'workbench'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Layers className="w-4 h-4 text-emerald-600" />
              <span>Mesa de Control({workbenchTotal})</span>
            </button>

            <button
              onClick={() => setActiveSubView('matrix')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-2 ${
                activeSubView === 'matrix'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Table className="w-4 h-4 text-emerald-600" />
              <span>Matriz 18 Columnas + Dinámicas ({matrixRows.length})</span>
            </button>
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto">
            {activeSubView === 'workbench' && (
              <input
                type="text"
                placeholder="Buscar artículo, autor o ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-theme py-1.5 px-3 text-xs w-full sm:w-64"
              />
            )}

            <button
              onClick={() => loadData()}
              className="text-xs text-emerald-700 hover:underline flex items-center space-x-1 font-semibold whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Actualizar Datos</span>
            </button>

            {/* BOTÓN EXPORTAR MATRIZ REAL (.xlsx) (GET /matrix/export/excel) */}
            <a
              href={matrixService.getExportExcelUrl(project.id)}
              download
              className="btn-green inline-flex items-center space-x-1.5 text-xs py-1.5 px-3 rounded-xl font-bold shadow-2xs whitespace-nowrap"
              title="Descargar la matriz completa en Excel (.xlsx) con filas reales (IA, importadas y manuales)"
            >
              <FileSpreadsheet className="w-4 h-4 text-white" />
              <span>Exportar Matriz (.xlsx)</span>
            </a>
          </div>
        </div>

        {/* -------------------------------------------------------------
            SUB-VISTA 1: MESA DE CONTROL Y CONFIRMACIÓN PRISMA 2020 (WORKBENCH)
           ------------------------------------------------------------- */}
        {activeSubView === 'workbench' && (
          <div className="space-y-4">
            <div className="overflow-x-auto border border-slate-200 rounded-xl min-h-[350px]">
              {loading ? (
                <div className="py-16 text-center space-y-2">
                  <RefreshCw className="w-7 h-7 text-emerald-600 animate-spin mx-auto" />
                  <p className="text-xs text-slate-500">Cargando mesa de trabajo a texto completo...</p>
                </div>
              ) : filteredWorkbenchItems.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  No hay candidatos aptos para la fase de texto completo con el filtro ingresado.
                </div>
              ) : (
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-100 text-slate-800 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-2 w-8 text-center">#</th>

                      {/* FUENTE / ID CON FILTRO Y ORDENACIÓN */}
                      <th className="py-2.5 px-2 min-w-[110px]">
                        <div className="space-y-1">
                          <button
                            onClick={() => toggleWbSort('source')}
                            className="flex items-center space-x-1 text-slate-800 hover:text-emerald-700 font-bold uppercase"
                          >
                            <span>Fuente / ID</span>
                            <ArrowUpDown className="w-3 h-3 text-slate-400" />
                          </button>
                          <select
                            value={wbSourceFilter}
                            onChange={(e) => setWbSourceFilter(e.target.value)}
                            className="w-full text-[10px] py-0.5 px-1 bg-white border border-slate-300 rounded font-normal text-slate-700 normal-case"
                          >
                            <option value="ALL">Todas</option>
                            {availableWbSources.map((src) => (
                              <option key={src} value={src}>{src}</option>
                            ))}
                          </select>
                        </div>
                      </th>

                      {/* ARTÍCULO Y METADATOS CON ORDENACIÓN A-Z */}
                      <th className="py-2.5 px-2">
                        <div className="flex items-center justify-between">
                          <button
                            onClick={() => toggleWbSort('title')}
                            className="flex items-center space-x-1.5 text-slate-800 hover:text-emerald-700 font-bold uppercase"
                          >
                            <span>Artículo y Metadatos</span>
                            <ArrowUpDown className="w-3 h-3 text-slate-400" />
                            {wbSortColumn === 'title' && (
                              <span className="text-[9px] text-emerald-700 font-semibold font-mono">
                                ({wbSortDirection === 'asc' ? 'A-Z' : 'Z-A'})
                              </span>
                            )}
                          </button>
                        </div>
                      </th>

                      {/* ESTADO PDF CON FILTRO */}
                      <th className="py-2.5 px-2 min-w-[95px]">
                        <div className="space-y-1">
                          <span className="block font-bold">Estado PDF</span>
                          <select
                            value={wbPdfFilter}
                            onChange={(e) => setWbPdfFilter(e.target.value)}
                            className="w-full text-[10px] py-0.5 px-1 bg-white border border-slate-300 rounded font-normal text-slate-700 normal-case"
                          >
                            <option value="ALL">Todos</option>
                            <option value="WITH_PDF">Con PDF</option>
                            <option value="WITHOUT_PDF">Sin PDF</option>
                          </select>
                        </div>
                      </th>

                      {/* MATRIZ / REVISIÓN CON FILTRO */}
                      <th className="py-2.5 px-2 min-w-[110px]">
                        <div className="space-y-1">
                          <span className="block font-bold">Matriz / Revisión</span>
                          <select
                            value={wbMatrixReviewFilter}
                            onChange={(e) => setWbMatrixReviewFilter(e.target.value)}
                            className="w-full text-[10px] py-0.5 px-1 bg-white border border-slate-300 rounded font-normal text-slate-700 normal-case"
                          >
                            <option value="ALL">Todos</option>
                            <option value="CONFIRMED">Confirmados</option>
                            <option value="DRAFT">Borrador IA</option>
                            <option value="PENDING">Pendientes</option>
                          </select>
                        </div>
                      </th>

                      {/* CRIBADO TEXTO COMPLETO CON FILTRO */}
                      <th className="py-2.5 px-2 min-w-[115px]">
                        <div className="space-y-1">
                          <span className="block font-bold">Texto Completo</span>
                          <select
                            value={wbFulltextFilter}
                            onChange={(e) => setWbFulltextFilter(e.target.value)}
                            className="w-full text-[10px] py-0.5 px-1 bg-white border border-slate-300 rounded font-normal text-slate-700 normal-case"
                          >
                            <option value="ALL">Todas</option>
                            <option value="INCLUDED">INCLUIDO</option>
                            <option value="EXCLUDED">EXCLUIDO</option>
                            <option value="PENDING">PENDIENTE</option>
                          </select>
                        </div>
                      </th>

                      <th className="py-2.5 px-2 text-right min-w-[160px]">Acciones RSL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredWorkbenchItems.map((item, idx) => {
                      const rowIndex = (page - 1) * pageSize + idx + 1;
                      const isExtractingThis = singleExtractingId
                        ? singleExtractingId === item.record_id
                        : (extractingBatch && Boolean(activeTaskId) && (!item.matrix_row_id || item.matrix_review_status === 'DRAFT'));

                      return (
                        <tr key={item.record_id} className="hover:bg-slate-50 transition">
                          <td className="p-3 font-mono text-slate-400 text-center">{rowIndex}</td>

                          <td className="p-3">
                            <span className="badge-green text-[10px] block mb-0.5">{item.database_source}</span>
                            <span className="font-mono text-[10px] text-slate-600 font-bold">{item.article_custom_id}</span>
                          </td>

                          <td className="p-3 space-y-1">
                            <h4 className="font-bold text-slate-900 leading-snug">{item.title}</h4>
                            <div className="text-[11px] text-slate-500">
                              {item.authors || 'Autores N/A'} ({item.publication_year || 'Año N/A'})
                            </div>
                            {item.doi && (
                              <a
                                href={item.doi.startsWith('http') ? item.doi : `https://doi.org/${item.doi.replace(/^doi:/i, '').trim()}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-emerald-700 hover:underline font-mono text-[10px] inline-flex items-center space-x-1"
                              >
                                <ExternalLink className="w-3 h-3 text-emerald-600" />
                                <span>{item.doi}</span>
                              </a>
                            )}
                          </td>

                          <td className="p-3">
                            {item.pdf_file_path ? (
                              <span className="badge-green inline-flex items-center space-x-1 text-[10px]">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>PDF Adjunto</span>
                              </span>
                            ) : (
                              <span className="badge-rose inline-flex items-center space-x-1 text-[10px]">
                                <AlertCircle className="w-3 h-3 text-rose-600" />
                                <span>Sin PDF</span>
                              </span>
                            )}
                          </td>

                          <td className="p-3">
                            {item.matrix_row_id ? (
                              <span
                                className={`px-2 py-0.5 rounded-full font-bold text-[10px] inline-flex items-center space-x-1 ${
                                  item.matrix_review_status === 'CONFIRMED'
                                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                    : 'bg-blue-50 text-blue-800 border border-blue-200'
                                }`}
                              >
                                {item.matrix_review_status === 'CONFIRMED' ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-700" />
                                    <span>Confirmado</span>
                                  </>
                                ) : (
                                  <>
                                    <Clock className="w-3 h-3 text-blue-600" />
                                    <span>Borrador IA</span>
                                  </>
                                )}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-medium">Pendiente</span>
                            )}
                          </td>

                          <td className="p-3">
                            {item.fulltext_status === 'INCLUDED' ? (
                              <span className="badge-green font-bold text-[10px]">INCLUIDO</span>
                            ) : item.fulltext_status === 'EXCLUDED' ? (
                              <span className="badge-rose font-bold text-[10px]">EXCLUIDO</span>
                            ) : (
                              <span className="bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                PENDIENTE
                              </span>
                            )}
                            {item.fulltext_reason && (
                              <p className="text-[9px] text-slate-400 mt-0.5 truncate max-w-xs" title={item.fulltext_reason}>
                                {item.fulltext_reason}
                              </p>
                            )}
                          </td>

                          <td className="p-3 text-right space-x-1.5 whitespace-nowrap">
                            {/* EXTRAER CON IA */}
                            {item.can_extract && (
                              <button
                                onClick={() => handleExtractSingleRecord(item.record_id)}
                                disabled={isExtractingThis}
                                className="btn-green text-[10px] py-1 px-2 inline-flex items-center space-x-1 shadow-2xs"
                                title="Extraer matriz con IA para este artículo"
                              >
                                {isExtractingThis ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Sparkles className="w-3 h-3" />
                                )}
                                <span>{item.matrix_row_id ? 'Re-extraer' : 'Extraer IA'}</span>
                              </button>
                            )}

                            {/* VER PDF */}
                            {item.pdf_file_path && (
                              <a
                                href={pdfService.getPdfFileUrl(project.id, item.record_id)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-outline-theme text-[10px] py-1 px-2 inline-flex items-center space-x-1"
                                title="Ver PDF"
                              >
                                <FileText className="w-3 h-3 text-emerald-600" />
                                <span>PDF</span>
                              </a>
                            )}

                            {/* DECISIÓN HUMAN-IN-THE-LOOP */}
                            <button
                              onClick={() => handleConfirmFulltext(item.record_id, 'INCLUDED')}
                              className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 inline-flex items-center"
                              title="Confirmar e Incluir a Texto Completo (PRISMA 2020)"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => handleConfirmFulltext(item.record_id, 'EXCLUDED')}
                              className="p-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 inline-flex items-center"
                              title="Excluir a Texto Completo"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* PAGINACIÓN DE WORKBENCH */}
            <div className="flex items-center justify-between pt-2 text-xs text-slate-500">
              <div className="flex items-center space-x-3">
                <span>Página {page} de {Math.max(Math.ceil(workbenchTotal / pageSize), 1)}</span>
                <div className="flex items-center space-x-1">
                  <span>Filas:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="input-theme py-0.5 px-1.5 text-xs font-semibold"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  disabled={page === 1}
                  className="btn-outline-theme px-3 py-1 text-xs disabled:opacity-40"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(p + 1, Math.ceil(workbenchTotal / pageSize)))}
                  disabled={page >= Math.ceil(workbenchTotal / pageSize)}
                  className="btn-outline-theme px-3 py-1 text-xs disabled:opacity-40"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------
            SUB-VISTA 2: TABLA MATRIZ DE 18 COLUMNAS ESTÁNDAR + DINÁMICAS (JSONB)
           ------------------------------------------------------------- */}
        {activeSubView === 'matrix' && (
          <div className="space-y-4">
            <div className="overflow-x-auto border border-slate-200 rounded-xl min-h-[350px]">
              {loading ? (
                <div className="py-16 text-center space-y-2">
                  <RefreshCw className="w-7 h-7 text-emerald-600 animate-spin mx-auto" />
                  <p className="text-xs text-slate-500">Cargando matriz de extracción JSONB...</p>
                </div>
              ) : matrixRows.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  No hay filas registradas en la matriz de extracción. Inicia una extracción con IA o importa un Excel/CSV.
                </div>
              ) : (
                <table className="w-full text-left text-xs text-slate-700 border-collapse">
                  <thead className="bg-slate-100 text-slate-800 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="p-3 w-10 text-center border-r border-slate-200">#</th>

                      {/* FILTRO ORIGEN */}
                      <th className="p-3 min-w-[110px] border-r border-slate-200">
                        <div className="space-y-1">
                          <span className="block font-bold">Origen</span>
                          <select
                            value={matSourceFilter}
                            onChange={(e) => setMatSourceFilter(e.target.value)}
                            className="w-full text-[10px] py-0.5 px-1 bg-white border border-slate-300 rounded font-normal text-slate-700 normal-case"
                          >
                            <option value="ALL">Todas</option>
                            <option value="AI_GENERATED">AI_GENERATED</option>
                            <option value="USER_IMPORTED">USER_IMPORTED</option>
                            <option value="MANUAL_SCREENING">MANUAL_SCREENING</option>
                          </select>
                        </div>
                      </th>

                      {/* FILTRO REVISIÓN */}
                      <th className="p-3 min-w-[110px] border-r border-slate-200">
                        <div className="space-y-1">
                          <span className="block font-bold">Revisión</span>
                          <select
                            value={matReviewFilter}
                            onChange={(e) => setMatReviewFilter(e.target.value)}
                            className="w-full text-[10px] py-0.5 px-1 bg-white border border-slate-300 rounded font-normal text-slate-700 normal-case"
                          >
                            <option value="ALL">Todos</option>
                            <option value="CONFIRMED">CONFIRMED</option>
                            <option value="DRAFT">DRAFT</option>
                            <option value="REJECTED">REJECTED</option>
                          </select>
                        </div>
                      </th>

                      {/* COLUMNAS DE LA MATRIZ CON FILTROS/ORDENACIÓN ESPECÍFICOS */}
                      {allTableHeaders.map((header) => {
                        const h = header.toLowerCase();
                        const isIdCol = h === 'id';
                        const isYearCol = h.includes('año');
                        const isDoiCol = h.includes('doi');
                        const isAbstract = h.includes('abstract');
                        const isShort = isIdCol || isYearCol || isDoiCol || h.includes('tipo');
                        const isMedium = h.includes('título') || h.includes('autor') || h.includes('palabras');
                        const colWidth = isAbstract ? 'min-w-[480px]' : isShort ? 'min-w-[130px]' : isMedium ? 'min-w-[220px]' : 'min-w-[300px]';

                        return (
                          <th key={header} className={`p-3 border-r border-slate-200 ${colWidth}`}>
                            <div className="space-y-1">
                              <button
                                onClick={() => toggleMatSort(header)}
                                className="flex items-center space-x-1 text-slate-800 hover:text-emerald-700 font-bold uppercase text-left"
                              >
                                <span>{header}</span>
                                <ArrowUpDown className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                {matSortHeader === header && (
                                  <span className="text-[9px] text-emerald-700 font-semibold font-mono">
                                    ({matSortDir === 'asc' ? 'A-Z' : 'Z-A'})
                                  </span>
                                )}
                              </button>

                              {/* FILTRO DROPDOWN SOLO EN AÑO Y DOI (EXCEPTO EN ID SEGÚN INSTRUCCIÓN) */}
                              {isYearCol && (
                                <select
                                  value={matYearFilter}
                                  onChange={(e) => setMatYearFilter(e.target.value)}
                                  className="w-full text-[10px] py-0.5 px-1 bg-white border border-slate-300 rounded font-normal text-slate-700 normal-case"
                                >
                                  <option value="ALL">Todos los años</option>
                                  {availableMatrixYears.map((yr) => (
                                    <option key={yr} value={yr}>{yr}</option>
                                  ))}
                                </select>
                              )}

                              {isDoiCol && (
                                <select
                                  value={matDoiFilter}
                                  onChange={(e) => setMatDoiFilter(e.target.value)}
                                  className="w-full text-[10px] py-0.5 px-1 bg-white border border-slate-300 rounded font-normal text-slate-700 normal-case"
                                >
                                  <option value="ALL">Todos</option>
                                  <option value="WITH_DOI">Con DOI</option>
                                  <option value="WITHOUT_DOI">Sin DOI</option>
                                </select>
                              )}
                            </div>
                          </th>
                        );
                      })}
                      <th className="p-3 text-right sticky right-0 bg-slate-100 shadow-xs min-w-[90px]">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {filteredMatrixRows.map((row, idx) => {
                      const isEditingThisRow = editingRowId === row.id;

                      return (
                        <tr
                          key={row.id}
                          className={`transition ${isEditingThisRow ? 'bg-emerald-50/30' : 'hover:bg-slate-50'}`}
                        >
                          <td className="p-3 font-mono text-slate-400 text-center align-top border-r border-slate-100">{idx + 1}</td>

                          <td className="p-3 align-top border-r border-slate-100">
                            <span
                              className={`badge-green text-[9px] ${
                                row.source_type === 'USER_IMPORTED' ? 'bg-amber-100 text-amber-900 border-amber-300' : ''
                              }`}
                            >
                              {row.source_type}
                            </span>
                          </td>

                          <td className="p-3 align-top border-r border-slate-100">
                            {isEditingThisRow ? (
                              <select
                                value={inlineEditStatus}
                                onChange={(e) => setInlineEditStatus(e.target.value as ExtractionReviewStatus)}
                                className="input-theme text-[9px] py-1 px-1 font-bold bg-white"
                              >
                                <option value="CONFIRMED">CONFIRMED</option>
                                <option value="DRAFT">DRAFT</option>
                                <option value="REJECTED">REJECTED</option>
                              </select>
                            ) : (
                              <span
                                className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                  row.review_status === 'CONFIRMED'
                                    ? 'bg-emerald-100 text-emerald-900'
                                    : 'bg-blue-50 text-blue-800'
                                }`}
                              >
                                {row.review_status}
                              </span>
                            )}
                          </td>

                          {/* RENDERIZADO DE CELDAS DINÁMICAS (MODO LECTURA VS MODO EDICIÓN INLINE AL INSTANTE) */}
                          {allTableHeaders.map((header) => {
                            const cellVal = row.extraction_data?.[header];
                            const displayVal = typeof cellVal === 'object' ? JSON.stringify(cellVal, null, 2) : (cellVal || '-');
                            
                            const h = header.toLowerCase();
                            const isAbstract = h.includes('abstract');
                            const isShort = h.includes('id') || h.includes('año') || h.includes('doi') || h.includes('tipo');
                            const isMedium = h.includes('título') || h.includes('autor') || h.includes('palabras');
                            const cellWidth = isAbstract
                              ? 'min-w-[480px] max-w-[650px]'
                              : isShort
                              ? 'min-w-[130px] max-w-[180px]'
                              : isMedium
                              ? 'min-w-[220px] max-w-[300px]'
                              : 'min-w-[300px] max-w-[450px]';

                            return (
                              <td
                                key={header}
                                className={`p-3 text-[11px] leading-relaxed text-slate-800 whitespace-normal break-words align-top border-r border-slate-100 ${cellWidth}`}
                              >
                                {isEditingThisRow ? (
                                  <textarea
                                    rows={Math.max(2, Math.min(Math.ceil((String(inlineEditFormData[header] ?? '')).length / 35), 8))}
                                    value={inlineEditFormData[header] ?? ''}
                                    onChange={(e) =>
                                      setInlineEditFormData((prev) => ({ ...prev, [header]: e.target.value }))
                                    }
                                    placeholder={`Ingresa ${header}...`}
                                    className="w-full text-[11px] leading-relaxed p-1.5 rounded-lg border border-emerald-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-500 bg-white text-slate-800 font-normal focus:outline-none transition shadow-2xs resize-y"
                                  />
                                ) : (
                                  <div className="max-h-[260px] overflow-y-auto pr-1">
                                    {String(displayVal)}
                                  </div>
                                )}
                              </td>
                            );
                          })}

                          <td className="p-3 text-right space-x-1 sticky right-0 bg-white shadow-xs align-top min-w-[120px]">
                            {isEditingThisRow ? (
                              <div className="flex items-center justify-end space-x-1">
                                <button
                                  onClick={() => handleSaveInlineEdit(row.id)}
                                  disabled={savingInlineRowId === row.id}
                                  className="btn-green text-[10px] py-1 px-2 rounded-lg inline-flex items-center space-x-1 shadow-2xs"
                                  title="Guardar celdas editadas directamente"
                                >
                                  {savingInlineRowId === row.id ? (
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <>
                                      <Check className="w-3.5 h-3.5" />
                                      <span>Guardar</span>
                                    </>
                                  )}
                                </button>

                                <button
                                  onClick={handleCancelInlineEdit}
                                  disabled={savingInlineRowId === row.id}
                                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 border border-slate-200 inline-flex items-center"
                                  title="Cancelar edición"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleStartInlineEdit(row)}
                                  className="p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-50 border border-emerald-200 inline-flex items-center"
                                  title="Editar celdas directamente en la tabla"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  onClick={() => handleDeleteRow(row.id)}
                                  className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 border border-rose-200 inline-flex items-center"
                                  title="Eliminar fila de la matriz"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 6. MODAL DE CREACIÓN DE FILA MANUAL DESACOPLADA */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl space-y-5 my-auto max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <Plus className="w-5 h-5 text-emerald-600" />
                <span>Agregar Fila Manual Desacoplada</span>
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-700 p-1 rounded-lg">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateManualRowSubmit} className="space-y-4 text-xs overflow-y-auto pr-2 flex-1">
              <div className="space-y-1">
                <label className="font-bold text-slate-700 block">ID Personalizado del Artículo (Ej: ART_SMITH_2024)</label>
                <input
                  type="text"
                  placeholder="ID personalizado..."
                  value={manualCustomId}
                  onChange={(e) => setManualCustomId(e.target.value)}
                  className="input-theme w-full text-xs"
                />
              </div>

              <div className="border-t border-slate-100 pt-3 space-y-3">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Llenado de Celdas</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {allTableHeaders.map((header) => (
                    <div key={header} className="space-y-1">
                      <label className="font-semibold text-slate-700 text-[11px] block">{header}</label>
                      <input
                        type="text"
                        value={manualFormData[header] ?? ''}
                        onChange={(e) =>
                          setManualFormData((prev) => ({ ...prev, [header]: e.target.value }))
                        }
                        className="input-theme w-full text-xs"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn-outline-theme text-xs py-2 px-4"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={savingManualRow}
                  className="btn-green text-xs py-2 px-5 inline-flex items-center space-x-1.5"
                >
                  {savingManualRow ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  <span>Crear Fila Manual</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* 6. MODAL DE GESTIÓN DE COLUMNAS Y CONFIGURACIÓN DE IA (GET/POST/PATCH/DELETE /matrix/columns) */}
      {showColumnsModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl space-y-5 my-auto max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                  <Sliders className="w-5 h-5 text-emerald-600" />
                  <span>Gestionar Columnas de Matriz & Configuración de IA</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Activa o desactiva qué columnas se envían a la IA en las extracciones masivas (`PATCH /columns/ai-inclusion`).
                </p>
              </div>
              <button
                onClick={() => setShowColumnsModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* FORMULARIO AGREGAR NUEVA COLUMNA PERSONALIZADA (POST /matrix/columns) */}
            <form onSubmit={handleCreateColumn} className="flex items-center space-x-2 bg-emerald-50/50 p-3 rounded-xl border border-emerald-200">
              <input
                type="text"
                placeholder="Nombre de la nueva columna (ej: Nivel asistencial, Tipo de organización)..."
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                className="input-theme flex-1 text-xs py-2 px-3 bg-white"
              />
              <button
                type="submit"
                disabled={savingColumn || !newColumnName.trim()}
                className="btn-green text-xs py-2 px-4 inline-flex items-center space-x-1.5 whitespace-nowrap shadow-2xs"
              >
                {savingColumn ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                <span>+ Agregar Columna</span>
              </button>
            </form>

            {/* LISTADO COMPLETO DE COLUMNAS (BASE + PERSONALIZADAS CON SWITCH IA) */}
            <div className="space-y-2 overflow-y-auto max-h-[400px] pr-1.5 border-t border-slate-100 pt-3 flex-1">
              <div className="flex items-center justify-between pb-1">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                  Columnas de la Matriz RSL ({displayColumns.length})
                </h4>
                <span className="text-[10px] text-slate-500 flex items-center space-x-1">
                  <Bot className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Interruptor IA encendido = Columna solicitada al LLM</span>
                </span>
              </div>

              <div className="space-y-2">
                {displayColumns.map((col, idx) => {
                  const isCustom = col.is_predefined === false || Boolean(col.id);
                  const canAiToggle = col.is_ai_extractable !== false;
                  const isAiIncluded = col.include_in_ai !== false;
                  const isEditingThisCol = Boolean(editingColumnId && col.id && editingColumnId === col.id);

                  return (
                    <div
                      key={col.id || col.name || idx}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between p-2.5 rounded-xl text-xs border transition ${
                        !isAiIncluded
                          ? 'bg-slate-100 border-slate-300 opacity-80'
                          : isCustom
                          ? 'bg-emerald-50/40 border-emerald-200'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 flex-1 mr-2 mb-2 sm:mb-0">
                        <span className="font-mono text-[10px] text-slate-400 font-bold w-6 text-center">
                          #{idx + 1}
                        </span>

                        {isEditingThisCol ? (
                          <input
                            type="text"
                            value={editingColumnName}
                            onChange={(e) => setEditingColumnName(e.target.value)}
                            className="input-theme text-xs py-1 px-2 flex-1"
                            autoFocus
                          />
                        ) : (
                          <div className="space-y-0.5">
                            <span className="font-semibold text-slate-800 flex items-center space-x-1.5">
                              <span>{col.name}</span>
                              {isCustom ? (
                                <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[9px] px-1.5 py-0.2 rounded-md font-bold">
                                  Personalizada
                                </span>
                              ) : (
                                <span className="bg-slate-100 text-slate-600 border border-slate-200 text-[9px] px-1.5 py-0.2 rounded-md font-medium">
                                  Base 18
                                </span>
                              )}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center space-x-2 self-end sm:self-auto">
                        {/* BOTÓN APAGAR/ENCENDER EXTRACCIÓN CON IA (`PATCH /columns/ai-inclusion`) */}
                        {canAiToggle ? (
                          <button
                            onClick={() => handleToggleAiInclusion(col.name, isAiIncluded)}
                            disabled={savingColumn}
                            className={`inline-flex items-center space-x-1 py-1 px-2.5 rounded-lg text-[10px] font-bold border transition ${
                              isAiIncluded
                                ? 'bg-emerald-100 text-emerald-900 border-emerald-300 hover:bg-emerald-200'
                                : 'bg-slate-200 text-slate-700 border-slate-300 hover:bg-slate-300'
                            }`}
                            title={
                              isAiIncluded
                                ? 'Haga clic para APAGAR esta columna y omitirla en extracciones de IA (ahorra tokens)'
                                : 'Haga clic para ENCENDER esta columna y pedirla a la IA'
                            }
                          >
                            {isAiIncluded ? (
                              <>
                                <ToggleRight className="w-4 h-4 text-emerald-700" />
                                <span>IA: ENCENDIDA</span>
                              </>
                            ) : (
                              <>
                                <ToggleLeft className="w-4 h-4 text-slate-500" />
                                <span>IA: APAGADA</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <span className="text-[9px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                            Metadato BD (0 Tokens)
                          </span>
                        )}

                        {/* ACCIONES PARA COLUMNAS PERSONALIZADAS (RENOMBRAR / REORDENAR / ELIMINAR) */}
                        {isCustom && col.id && (
                          <div className="flex items-center space-x-1 border-l border-slate-200 pl-1.5">
                            {isEditingThisCol ? (
                              <>
                                <button
                                  onClick={() => handleUpdateColumnName(col.id!)}
                                  disabled={savingColumn}
                                  className="btn-green text-[10px] py-1 px-2 inline-flex items-center space-x-1"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Guardar</span>
                                </button>
                                <button
                                  onClick={() => setEditingColumnId(null)}
                                  className="btn-outline-theme text-[10px] py-1 px-1.5"
                                >
                                  Cancelar
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleReorderColumn(col.id!, col.position, 'up')}
                                  disabled={idx === 0 || savingColumn}
                                  className="p-1 rounded text-slate-500 hover:bg-slate-200 disabled:opacity-30"
                                  title="Mover arriba"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  onClick={() => handleReorderColumn(col.id!, col.position, 'down')}
                                  disabled={idx === customColumns.length - 1 || savingColumn}
                                  className="p-1 rounded text-slate-500 hover:bg-slate-200 disabled:opacity-30"
                                  title="Mover abajo"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  onClick={() => {
                                    setEditingColumnId(col.id!);
                                    setEditingColumnName(col.name);
                                  }}
                                  className="p-1 rounded text-emerald-700 hover:bg-emerald-100"
                                  title="Renombrar columna"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  onClick={() => handleDeleteColumn(col.id!, col.name)}
                                  className="p-1 rounded text-rose-600 hover:bg-rose-100"
                                  title="Eliminar columna"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowColumnsModal(false)}
                className="btn-green text-xs py-2 px-5"
              >
                Guardar y Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
