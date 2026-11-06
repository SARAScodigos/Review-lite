import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Search,
  ChevronLeft,
  ChevronRight,
  FileText,
  Edit3,
  X,
  Info,
  ArrowUpDown
} from 'lucide-react';
import { screeningService } from '../../services/screeningService';
import type {
  AbstractScreeningRecord,
  PaginatedAbstractScreeningRecordsResponse
} from '../../services/screeningService';
import { AiModelSelectorBlock } from '../common/AiModelSelectorBlock';
import { DEFAULT_AI_MODEL, DEFAULT_AI_PROVIDER } from '../common/aiModelSelection';

interface ScreeningAbstractTabProps {
  projectId: string;
}

export const ScreeningAbstractTab: React.FC<ScreeningAbstractTabProps> = ({ projectId }) => {
  const [paginatedData, setPaginatedData] = useState<PaginatedAbstractScreeningRecordsResponse>({
    items: [],
    total: 0,
    skip: 0,
    limit: 50,
    returned: 0,
    has_next: false,
    has_previous: false,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Configuración de IA para cribado por abstract
  const [provider, setProvider] = useState<string>(DEFAULT_AI_PROVIDER);
  const [model, setModel] = useState<string>(DEFAULT_AI_MODEL);
  const [temperature, setTemperature] = useState<number>(0.2);
  const [runningAI, setRunningAI] = useState<boolean>(false);

  // Modal para sobrescribir decisión manual (Override Abstract)
  const [selectedRecordForOverride, setSelectedRecordForOverride] = useState<AbstractScreeningRecord | null>(null);
  const [overrideStatus, setOverrideStatus] = useState<'INCLUDED' | 'EXCLUDED' | 'MAYBE'>('INCLUDED');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [savingOverride, setSavingOverride] = useState<boolean>(false);

  const fetchRecords = async (currentPage: number, currentLimit: number) => {
    setLoading(true);
    setError(null);
    try {
      const skip = (currentPage - 1) * currentLimit;
      const data = await screeningService.getAbstractScreeningRecords(projectId, skip, currentLimit);
      setPaginatedData(data);
    } catch (err: any) {
      console.error('Error cargando registros de abstract:', err);
      setError('No se pudieron obtener los registros de cribado por abstract del servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords(page, pageSize);
  }, [projectId, page, pageSize]);

  const hasEvaluatedAbstracts = (paginatedData.items || []).some(
    (i) => i.abstract_status === 'INCLUDED' || i.abstract_status === 'EXCLUDED' || i.abstract_status === 'MAYBE'
  );

  // Ejecutar tarea Celery de cribado por abstract con IA
  const handleRunAbstractScreening = async () => {
    setRunningAI(true);
    try {
      await screeningService.startAbstractScreening(projectId, {
        provider,
        model,
        temperature,
        re_run: hasEvaluatedAbstracts,
      });
      alert(
        `Proceso de ${hasEvaluatedAbstracts ? 're-ejecución de ' : ''}cribado por abstract encolado en Celery con IA (${provider} / ${model}).`
      );
      await fetchRecords(page, pageSize);
    } catch (err: any) {
      alert('Error al iniciar cribado por abstract: ' + (err.response?.data?.detail || err.message));
    } finally {
      setRunningAI(false);
    }
  };

  // Abrir modal de sobrescritura manual
  const handleOpenOverrideModal = (record: AbstractScreeningRecord, newStatus: 'INCLUDED' | 'EXCLUDED' | 'MAYBE') => {
    setSelectedRecordForOverride(record);
    setOverrideStatus(newStatus);
    setOverrideReason('');
  };

  // Confirmar sobrescritura manual
  const handleConfirmOverride = async () => {
    if (!selectedRecordForOverride) return;
    setSavingOverride(true);
    try {
      await screeningService.overrideDecision(projectId, {
        record_id: selectedRecordForOverride.record_id,
        stage: 'abstract',
        new_status: overrideStatus,
        override_reason: overrideReason.trim() || undefined,
      });
      setSelectedRecordForOverride(null);
      await fetchRecords(page, pageSize);
    } catch (err: any) {
      alert('Error al guardar decisión manual: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSavingOverride(false);
    }
  };

  // Filtros y ordenación tipo Excel en encabezados
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');
  const [titleStatusFilter, setTitleStatusFilter] = useState<string>('ALL');
  const [abstractStatusFilter, setAbstractStatusFilter] = useState<string>('ALL');
  const [sortColumn, setSortColumn] = useState<'title' | 'source' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const toggleSort = (col: 'title' | 'source') => {
    if (sortColumn === col) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(col);
      setSortDirection('asc');
    }
  };

  const mapStatusToSpanish = (status?: string | null): string => {
    switch (status) {
      case 'INCLUDED':
        return 'INCLUIDO';
      case 'EXCLUDED':
        return 'EXCLUIDO';
      case 'MAYBE':
        return 'EN DUDA';
      case 'EVALUATING':
        return 'EVALUANDO';
      case 'PENDING':
        return 'PENDIENTE';
      default:
        return status ? status.toUpperCase() : 'PENDIENTE';
    }
  };

  const availableSources = Array.from(
    new Set((paginatedData.items || []).map((i) => i.database_source).filter(Boolean))
  );

  const filteredItems = (paginatedData.items || [])
    .filter((item) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match = (
          item.title.toLowerCase().includes(q) ||
          (item.abstract && item.abstract.toLowerCase().includes(q)) ||
          (item.authors && item.authors.toLowerCase().includes(q)) ||
          (item.doi && item.doi.toLowerCase().includes(q))
        );
        if (!match) return false;
      }
      if (sourceFilter !== 'ALL' && item.database_source !== sourceFilter) {
        return false;
      }
      if (titleStatusFilter !== 'ALL' && item.title_status !== titleStatusFilter) {
        return false;
      }
      if (abstractStatusFilter !== 'ALL' && item.abstract_status !== abstractStatusFilter) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (!sortColumn) return 0;
      const valA = sortColumn === 'title' ? (a.title || '') : (a.database_source || '');
      const valB = sortColumn === 'title' ? (b.title || '') : (b.database_source || '');
      const cmp = valA.localeCompare(valB, 'es', { sensitivity: 'base' });
      return sortDirection === 'asc' ? cmp : -cmp;
    });

  const totalPages = Math.ceil((paginatedData.total || 1) / pageSize);

  const getStatusBadge = (status: string, overridden?: boolean) => {
    switch (status) {
      case 'INCLUDED':
        return (
          <span className="badge-green flex items-center space-x-1 font-bold">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>INCLUIDO {overridden ? '(Manual)' : '(IA)'}</span>
          </span>
        );
      case 'EXCLUDED':
        return (
          <span className="badge-rose flex items-center space-x-1 font-bold">
            <XCircle className="w-3 h-3 text-rose-600" />
            <span>EXCLUIDO {overridden ? '(Manual)' : '(IA)'}</span>
          </span>
        );
      case 'MAYBE':
        return (
          <span className="badge-orange flex items-center space-x-1 font-bold">
            <HelpCircle className="w-3 h-3 text-orange-600" />
            <span>EN DUDA {overridden ? '(Manual)' : '(IA)'}</span>
          </span>
        );
      case 'EVALUATING':
        return (
          <span className="inline-flex items-center text-orange-600 font-bold text-[11px] bg-orange-50 px-2 py-0.5 rounded-md border border-orange-200">
            <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Evaluando IA...
          </span>
        );
      default:
        return (
          <span className="bg-slate-100 text-slate-600 font-mono text-[10px] px-2 py-0.5 rounded-md border border-slate-200">
            PENDIENTE
          </span>
        );
    }
  };

  return (
    <div className="space-y-5">
      {/* AVISO EXPLICATIVO DE PRERREQUISITOS */}
      <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-xs space-y-1">
        <div className="font-bold text-slate-800 flex items-center space-x-1.5">
          <Info className="w-4 h-4 text-emerald-600" />
          <span>Fase 2: Cribado Profundo de Resúmenes (Abstracts)</span>
        </div>
        <p className="text-slate-600 text-[11px]">
          En esta fase solo se evalúan los artículos que superaron el filtro de título (`INCLUDED` o `MAYBE`). La IA analiza la metodología y los hallazgos en el resumen.
        </p>
      </div>

      {/* TARJETA DE CONTROL Y PARÁMETROS DE IA */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center space-x-2">
              <FileText className="w-4 h-4 text-emerald-600" />
              <span>Evaluador de Abstracts con IA</span>
            </h3>
            <p className="text-xs text-slate-500">
              Evaluación profunda del texto del resumen por lotes optimizados.
            </p>
          </div>

          <button
            onClick={handleRunAbstractScreening}
            disabled={runningAI}
            className="btn-green text-xs py-2 px-4 inline-flex items-center space-x-2 shadow-sm"
          >
            {runningAI ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Evaluando Resúmenes con IA...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>{hasEvaluatedAbstracts ? 'Re-ejecutar Cribado de Abstracts' : 'Iniciar Cribado de Abstracts'}</span>
              </>
            )}
          </button>
        </div>

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
          disabled={runningAI}
          title="Parámetros Dinámicos de Inteligencia Artificial"
          description="Selecciona el proveedor de LLM, la arquitectura del modelo y la temperatura deseada para el cribado de resúmenes."
        />
      </div>

      {/* MESA DE TRABAJO DE ABSTRACTS */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar en resúmenes, títulos, autores o DOI..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-theme w-full pl-9 pr-8 text-xs"
            />
          </div>

          <div className="flex items-center justify-between sm:justify-end space-x-3">
            <div className="flex items-center space-x-1.5 text-slate-600 font-medium">
              <span>Por página:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="input-theme py-1 px-2 text-xs"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <button
              onClick={() => fetchRecords(page, pageSize)}
              className="text-xs text-emerald-700 hover:underline flex items-center space-x-1 font-semibold"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Actualizar Tabla</span>
            </button>

            <span className="font-mono text-slate-500">
              Total aptos: <strong className="text-slate-900">{paginatedData.total}</strong> artículos
            </span>
          </div>
        </div>

        {/* TABLA DE RESÚMENES Y EVALUACIONES */}
        <div className="overflow-x-auto border border-slate-200 rounded-xl min-h-[350px]">
          {loading ? (
            <div className="py-16 text-center space-y-2">
              <RefreshCw className="w-7 h-7 text-emerald-600 animate-spin mx-auto" />
              <p className="text-xs text-slate-500">Cargando mesa de trabajo de resúmenes...</p>
            </div>
          ) : error ? (
            <div className="py-12 text-center text-xs text-rose-600">{error}</div>
          ) : filteredItems.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              No hay resúmenes pendientes o disponibles en esta página.
            </div>
          ) : (
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100 text-slate-800 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="p-3 w-10 text-center">#</th>

                  {/* FUENTE / ID CON FILTRO Y ORDENACIÓN */}
                  <th className="p-3">
                    <div className="space-y-1">
                      <button
                        onClick={() => toggleSort('source')}
                        className="flex items-center space-x-1 text-slate-800 hover:text-emerald-700 font-bold uppercase"
                      >
                        <span>Fuente / ID</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </button>
                      <select
                        value={sourceFilter}
                        onChange={(e) => setSourceFilter(e.target.value)}
                        className="w-full text-[10px] py-0.5 px-1 bg-white border border-slate-300 rounded font-normal text-slate-700 normal-case"
                      >
                        <option value="ALL">Todas las fuentes</option>
                        {availableSources.map((src) => (
                          <option key={src} value={src}>{src}</option>
                        ))}
                      </select>
                    </div>
                  </th>

                  {/* TÍTULO Y ABSTRACT CON ORDENACIÓN A-Z */}
                  <th className="p-3 min-w-[240px]">
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => toggleSort('title')}
                        className="flex items-center space-x-1.5 text-slate-800 hover:text-emerald-700 font-bold uppercase"
                      >
                        <span>Título y Abstract</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                        {sortColumn === 'title' && (
                          <span className="text-[9px] text-emerald-700 font-semibold font-mono">
                            ({sortDirection === 'asc' ? 'A-Z' : 'Z-A'})
                          </span>
                        )}
                      </button>
                    </div>
                  </th>

                  {/* FASE 1 (TÍTULO) CON FILTRO ESPAÑOL */}
                  <th className="p-3 min-w-[130px]">
                    <div className="space-y-1">
                      <span className="block font-bold">Estado Titulo</span>
                      <select
                        value={titleStatusFilter}
                        onChange={(e) => setTitleStatusFilter(e.target.value)}
                        className="w-full text-[10px] py-0.5 px-1 bg-white border border-slate-300 rounded font-normal text-slate-700 normal-case"
                      >
                        <option value="ALL">Todos los estados</option>
                        <option value="INCLUDED">INCLUIDO</option>
                        <option value="EXCLUDED">EXCLUIDO</option>
                        <option value="MAYBE">EN DUDA</option>
                        <option value="EVALUATING">EVALUANDO</option>
                        <option value="PENDING">PENDIENTE</option>
                      </select>
                    </div>
                  </th>

                  {/* FASE 2 (ABSTRACT) CON FILTRO ESPAÑOL */}
                  <th className="p-3 min-w-[140px]">
                    <div className="space-y-1">
                      <span className="block font-bold">Estado Abstract</span>
                      <select
                        value={abstractStatusFilter}
                        onChange={(e) => setAbstractStatusFilter(e.target.value)}
                        className="w-full text-[10px] py-0.5 px-1 bg-white border border-slate-300 rounded font-normal text-slate-700 normal-case"
                      >
                        <option value="ALL">Todos los estados</option>
                        <option value="INCLUDED">INCLUIDO</option>
                        <option value="EXCLUDED">EXCLUIDO</option>
                        <option value="MAYBE">EN DUDA</option>
                        <option value="EVALUATING">EVALUANDO</option>
                        <option value="PENDING">PENDIENTE</option>
                      </select>
                    </div>
                  </th>

                  <th className="p-3 min-w-[220px]">Fundamentación IA Abstract</th>
                  <th className="p-3 text-right min-w-[150px]">Intervención</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredItems.map((rec, idx) => {
                  const rowIndex = (page - 1) * pageSize + idx + 1;
                  const doiUrl = rec.doi
                    ? rec.doi.startsWith('http')
                      ? rec.doi
                      : `https://doi.org/${rec.doi.replace(/^doi:/i, '').trim()}`
                    : null;

                  return (
                    <tr key={rec.record_id} className="hover:bg-slate-50/80 transition">
                      <td className="p-3 font-mono text-slate-400 text-center">{rowIndex}</td>

                      <td className="p-3">
                        <span className="badge-green text-[10px] block mb-0.5">{rec.database_source}</span>
                        {rec.id_article && <span className="font-mono text-[10px] text-slate-400">{rec.id_article}</span>}
                      </td>

                      <td className="p-3 space-y-1.5 max-w-md">
                        <h4 className="font-bold text-slate-900 leading-snug">{rec.title}</h4>
                        {rec.abstract ? (
                          <p className="text-[11px] text-slate-600 line-clamp-3 hover:line-clamp-none transition-all leading-relaxed bg-slate-50 p-2 rounded-lg border border-slate-200/80">
                            {rec.abstract}
                          </p>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Sin resumen</span>
                        )}
                        {doiUrl && (
                          <a
                            href={doiUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-700 hover:underline font-mono text-[10px] inline-flex items-center space-x-1"
                          >
                            <ExternalLink className="w-3 h-3 text-emerald-600" />
                            <span>{rec.doi}</span>
                          </a>
                        )}
                      </td>

                      <td className="p-3">
                        <span className="badge-green text-[10px] font-mono block uppercase">
                          {mapStatusToSpanish(rec.title_status)}
                        </span>
                      </td>

                      <td className="p-3">
                        {getStatusBadge(rec.abstract_status, rec.abstract_overridden)}
                      </td>

                      <td className="p-3 text-[11px] text-slate-600 leading-relaxed">
                        {rec.abstract_reason ? (
                          <p title={rec.abstract_reason}>{rec.abstract_reason}</p>
                        ) : (
                          <span className="text-slate-400 italic">Esperando evaluación...</span>
                        )}
                      </td>

                      <td className="p-3 text-right space-x-1">
                        <button
                          onClick={() => handleOpenOverrideModal(rec, 'INCLUDED')}
                          className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition inline-block"
                          title="Forzar Inclusión Manual"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenOverrideModal(rec, 'EXCLUDED')}
                          className="p-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition inline-block"
                          title="Forzar Exclusión Manual"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenOverrideModal(rec, 'MAYBE')}
                          className="p-1.5 rounded-lg bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200 transition inline-block"
                          title="Marcar En Duda"
                        >
                          <HelpCircle className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* NAVEGACIÓN PAGINADA */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs text-slate-500">
          <div>
            Página <strong className="text-slate-900">{page}</strong> de <strong className="text-slate-900">{totalPages || 1}</strong>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page <= 1 || loading}
              className="btn-outline-theme text-xs py-1.5 px-3 inline-flex items-center space-x-1 disabled:opacity-50"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Anterior</span>
            </button>

            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages || loading}
              className="btn-outline-theme text-xs py-1.5 px-3 inline-flex items-center space-x-1 disabled:opacity-50"
            >
              <span>Siguiente</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* MODAL DE SOBRESCRITURA MANUAL ABSTRACT */}
      {selectedRecordForOverride && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 my-auto">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h4 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                <Edit3 className="w-4 h-4 text-emerald-600" />
                <span>Intervención Manual de Resumen (Override)</span>
              </h4>
              <button
                onClick={() => setSelectedRecordForOverride(null)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <p className="font-bold text-slate-900">{selectedRecordForOverride.title}</p>
              <p className="text-[11px] text-slate-500">
                Cambiando estado a: <strong className="text-emerald-700 uppercase">{overrideStatus}</strong>
              </p>
            </div>

            <div className="space-y-1 text-xs">
              <label className="font-bold text-slate-700 block">Motivo / Justificación de la Corrección:</label>
              <textarea
                rows={3}
                placeholder="Explica por qué corriges la decisión sobre el resumen..."
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                className="input-theme w-full text-xs"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedRecordForOverride(null)}
                className="btn-outline-theme text-xs py-1.5 px-3"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmOverride}
                disabled={savingOverride}
                className="btn-green text-xs py-1.5 px-4 inline-flex items-center space-x-1"
              >
                {savingOverride ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span>Guardar Decisión</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScreeningAbstractTab;
