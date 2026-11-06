import React, { useState, useEffect } from 'react';
import {
  Download,
  Upload,
  FileText,
  Sparkles,
  RefreshCw,
  Search,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Clock,
  X,
  FileUp,
  FlaskConical,
  ArrowUpDown,
  Trash2,
  RotateCcw
} from 'lucide-react';
import { pdfService } from '../../services/pdfService';
import type {
  PaginatedPDFCandidatesResponse,
  PDFDownloadProcessStatus,
  TestPDFDownloadResult
} from '../../services/pdfService';
import type { RSLProject } from '../../types/project';

interface PdfManagementTabProps {
  project: RSLProject;
}

export const PdfManagementTab: React.FC<PdfManagementTabProps> = ({ project }) => {
  const [candidatesData, setCandidatesData] = useState<PaginatedPDFCandidatesResponse>({
    items: [],
    total: 0,
    skip: 0,
    limit: 100,
    returned: 0,
    has_next: false,
    has_previous: false,
  });
  const [statusMetrics, setStatusMetrics] = useState<PDFDownloadProcessStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [downloadingBatch, setDownloadingBatch] = useState<boolean>(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  // Subida/Reemplazo Manual Inline por fila (Caja Drag & Drop directo en la tabla - PUT)
  const [draggingRecordId, setDraggingRecordId] = useState<string | null>(null);
  const [inlineUploadingRecordId, setInlineUploadingRecordId] = useState<string | null>(null);
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);

  const handleInlineUpload = async (recordId: string, file: File) => {
    if (!file.name.endsWith('.pdf') && file.type !== 'application/pdf') {
      alert('Por favor selecciona un archivo PDF (.pdf).');
      return;
    }
    setInlineUploadingRecordId(recordId);
    try {
      await pdfService.replacePdf(project.id, recordId, file);
      await fetchCandidatesAndStatus();
    } catch (err: any) {
      alert('Error al guardar PDF: ' + (err.response?.data?.detail || err.message));
    } finally {
      setInlineUploadingRecordId(null);
    }
  };

  const handleDeletePdf = async (recordId: string) => {
    if (!confirm('¿Estás seguro de eliminar el archivo PDF físico de este artículo? El estado cambiará a Pendiente Carga Manual.')) {
      return;
    }
    setDeletingRecordId(recordId);
    try {
      await pdfService.deletePdf(project.id, recordId);
      await fetchCandidatesAndStatus();
    } catch (err: any) {
      alert('Error al eliminar PDF: ' + (err.response?.data?.detail || err.message));
    } finally {
      setDeletingRecordId(null);
    }
  };

  const handleInlineDragOver = (e: React.DragEvent, recordId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingRecordId(recordId);
  };

  const handleInlineDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingRecordId(null);
  };

  const handleInlineDrop = async (e: React.DragEvent, recordId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingRecordId(null);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      await handleInlineUpload(recordId, file);
    }
  };

  // Modal Prueba Rápida por DOI / URL
  const [showTestModal, setShowTestModal] = useState<boolean>(false);
  const [testDoi, setTestDoi] = useState<string>('10.48550/arXiv.2303.08774');
  const [testUrl, setTestUrl] = useState<string>('');
  const [testing, setTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<TestPDFDownloadResult | null>(null);

  // Cargar lista de candidatos y métricas de estado (modo silencioso opcional para evitar parpadeos)
  const fetchCandidatesAndStatus = async (isSilent: boolean = false) => {
    if (!isSilent) setLoading(true);
    setError(null);
    try {
      const skip = (page - 1) * pageSize;
      const [candRes, statusRes] = await Promise.all([
        pdfService.getEligiblePdfCandidates(project.id, skip, pageSize),
        pdfService.getPdfDownloadStatus(project.id, activeTaskId || undefined),
      ]);
      setCandidatesData(candRes);
      setStatusMetrics(statusRes);
    } catch (err: any) {
      console.error('Error cargando datos de PDFs:', err);
      if (!isSilent) setError('No se pudo cargar la lista de artículos aptos para descarga de PDF.');
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  // Detectar si hay algún documento o proceso en estado Descargando
  const isAnyDownloading = Boolean(
    (statusMetrics?.downloading && statusMetrics.downloading > 0) ||
    (statusMetrics?.task_status && ['STARTED', 'PENDING', 'PROGRESS', 'QUEUED'].includes(statusMetrics.task_status)) ||
    candidatesData.items.some((i) => i.pdf_download_status === 'DOWNLOADING') ||
    downloadingBatch
  );

  useEffect(() => {
    fetchCandidatesAndStatus();
  }, [project.id, page, pageSize]);

  // Polling inteligente cada 10 segundos mientras algún documento esté descargando (sin parpadeo)
  useEffect(() => {
    if (!isAnyDownloading) return;

    const interval = setInterval(() => {
      fetchCandidatesAndStatus(true);
    }, 10000); // 10 segundos silencioso

    return () => clearInterval(interval);
  }, [isAnyDownloading, project.id, page, pageSize, activeTaskId]);

  // Iniciar descarga masiva Celery
  const handleStartBatchDownload = async () => {
    if (!confirm('¿Deseas iniciar la descarga masiva asíncrona de PDFs en acceso abierto (Unpaywall, Semantic Scholar, CrossRef)?')) {
      return;
    }
    setDownloadingBatch(true);
    try {
      const res = await pdfService.downloadAllProjectPdfs(project.id);
      setActiveTaskId(res.task_id);
      alert(`Descarga masiva encolada en Celery (ID: ${res.task_id}).`);
      await fetchCandidatesAndStatus();
    } catch (err: any) {
      alert('Error al iniciar descarga masiva: ' + (err.response?.data?.detail || err.message));
    } finally {
      setDownloadingBatch(false);
    }
  };



  // Ejecutar prueba rápida directa
  const handleRunTestDownload = async () => {
    if (!testDoi.trim() && !testUrl.trim()) {
      alert('Ingresa al menos un DOI o una URL para realizar la prueba.');
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const res = await pdfService.testDirectPdfDownload(testDoi.trim() || undefined, testUrl.trim() || undefined);
      setTestResult(res);
    } catch (err: any) {
      alert('Error en la prueba de descarga: ' + (err.response?.data?.detail || err.message));
    } finally {
      setTesting(false);
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

  // Filtros y ordenación tipo Excel en encabezados
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');
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

  const availableSources = Array.from(
    new Set((candidatesData.items || []).map((i) => i.database_source).filter(Boolean))
  );

  const filteredItems = (candidatesData.items || [])
    .filter((item) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match = (
          item.title.toLowerCase().includes(q) ||
          (item.authors && item.authors.toLowerCase().includes(q)) ||
          (item.doi && item.doi.toLowerCase().includes(q)) ||
          (item.id_article && item.id_article.toLowerCase().includes(q))
        );
        if (!match) return false;
      }
      if (sourceFilter !== 'ALL' && item.database_source !== sourceFilter) {
        return false;
      }
      if (statusFilter !== 'ALL' && item.pdf_download_status !== statusFilter) {
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

  const totalPages = Math.ceil((candidatesData.total || 1) / pageSize);

  const renderPdfStatusBadge = (statusStr: string) => {
    switch (statusStr) {
      case 'DOWNLOADED':
        return (
          <span className="badge-green inline-flex items-center space-x-1 font-bold">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>Descargado (OA)</span>
          </span>
        );
      case 'MANUALLY_UPLOADED':
        return (
          <span className="bg-emerald-100 text-emerald-900 border border-emerald-300 px-2 py-0.5 rounded-full font-bold text-[10px] inline-flex items-center space-x-1">
            <Upload className="w-3 h-3 text-emerald-700" />
            <span>Cargado Manual</span>
          </span>
        );
      case 'PENDING_MANUAL_UPLOAD':
        return (
          <span className="badge-rose inline-flex items-center space-x-1 font-bold">
            <AlertCircle className="w-3 h-3 text-rose-600" />
            <span>Pendiente Carga Manual</span>
          </span>
        );
      case 'DOWNLOADING':
        return (
          <span className="bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-full font-bold text-[10px] inline-flex items-center space-x-1">
            <RefreshCw className="w-3 h-3 animate-spin text-blue-600" />
            <span>Descargando...</span>
          </span>
        );
      case 'ERROR':
        return (
          <span className="badge-rose inline-flex items-center space-x-1 font-bold">
            <AlertCircle className="w-3 h-3 text-rose-600" />
            <span>Error</span>
          </span>
        );
      default:
        return (
          <span className="bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded-full font-mono text-[10px] inline-flex items-center space-x-1">
            <Clock className="w-3 h-3 text-slate-400" />
            <span>Pendiente Auto</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER DE LA SECCIÓN DE DESCARGAS DE PDF */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <Download className="w-5 h-5 text-emerald-600" />
              <span>Gestión y Descarga de Textos Completos (PDFs) - Hito 3</span>
            </h2>
            <p className="text-xs text-slate-500">
              Descarga automática multihilo mediante Unpaywall, Semantic Scholar y CrossRef para artículos aptos.
            </p>
          </div>

          <div className="flex items-center space-x-2 self-end sm:self-auto">
            <button
              onClick={() => setShowTestModal(true)}
              className="btn-outline-theme text-xs py-2 px-3 inline-flex items-center space-x-1.5"
              title="Probar descargador de PDFs directamente por DOI o URL sin guardar en base de datos"
            >
              <FlaskConical className="w-4 h-4 text-emerald-600" />
              <span>Prueba Rápida DOI/URL</span>
            </button>

            <button
              onClick={handleStartBatchDownload}
              disabled={downloadingBatch}
              className="btn-green inline-flex items-center space-x-2 text-xs py-2 px-3.5"
            >
              {downloadingBatch ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span>Iniciar Descarga Masiva (OA)</span>
            </button>
          </div>
        </div>

        {/* TARJETAS DE CONTADORES Y ESTADOS DE PDF */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Aptos</span>
            <div className="text-lg font-extrabold text-slate-900">
              {statusMetrics?.total_eligible ?? candidatesData.total ?? 0}
            </div>
          </div>

          <div className="p-3 bg-blue-50/80 rounded-xl border border-blue-200">
            <span className="text-[10px] uppercase font-bold text-blue-800 block">Pendientes Auto</span>
            <div className="text-lg font-extrabold text-blue-900">
              {statusMetrics?.pending_auto_download ?? 0}
            </div>
          </div>

          <div className="p-3 bg-emerald-50/80 rounded-xl border border-emerald-200">
            <span className="text-[10px] uppercase font-bold text-emerald-800 block">Descargados (OA)</span>
            <div className="text-lg font-extrabold text-emerald-900">
              {statusMetrics?.downloaded ?? 0}
            </div>
          </div>

          <div className="p-3 bg-emerald-100/60 rounded-xl border border-emerald-300">
            <span className="text-[10px] uppercase font-bold text-emerald-900 block">Cargados Manual</span>
            <div className="text-lg font-extrabold text-emerald-900">
              {statusMetrics?.manually_uploaded ?? 0}
            </div>
          </div>

          <div className="p-3 bg-rose-50/80 rounded-xl border border-rose-200">
            <span className="text-[10px] uppercase font-bold text-rose-800 block">Req. Carga Manual</span>
            <div className="text-lg font-extrabold text-rose-900">
              {statusMetrics?.pending_manual_upload ?? 0}
            </div>
          </div>

          <div className="p-3 bg-slate-100 rounded-xl border border-slate-300">
            <span className="text-[10px] uppercase font-bold text-slate-600 block">Errores</span>
            <div className="text-lg font-extrabold text-slate-800">
              {statusMetrics?.errors ?? 0}
            </div>
          </div>
        </div>
      </div>

      {/* MESA DE TRABAJO Y TABLA DE REGISTROS APTOS PARA PDF */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por título, autor, DOI o ID de artículo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-theme w-full pl-9 pr-8 text-xs"
            />
          </div>

          <div className="flex items-center justify-between sm:justify-end space-x-3">
            <div className="flex items-center space-x-1.5 text-slate-600 font-medium">
              <span>Estado PDF:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="input-theme py-1 px-2 text-xs"
              >
                <option value="ALL">Todos los estados</option>
                <option value="DOWNLOADED">Descargado (OA)</option>
                <option value="MANUALLY_UPLOADED">Cargado Manualmente</option>
                <option value="PENDING_MANUAL_UPLOAD">Pendiente Carga Manual</option>
                <option value="PENDING_AUTO_DOWNLOAD">Pendiente Auto</option>
                <option value="ERROR">Error</option>
              </select>
            </div>

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
              onClick={() => fetchCandidatesAndStatus()}
              className="text-xs text-emerald-700 hover:underline flex items-center space-x-1 font-semibold"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Actualizar Tabla</span>
            </button>
          </div>
        </div>

        {/* TABLA DE REGISTROS */}
        <div className="overflow-x-auto border border-slate-200 rounded-xl min-h-[350px]">
          {loading ? (
            <div className="py-16 text-center space-y-2">
              <RefreshCw className="w-7 h-7 text-emerald-600 animate-spin mx-auto" />
              <p className="text-xs text-slate-500">Cargando mesa de trabajo de PDFs...</p>
            </div>
          ) : error ? (
            <div className="py-12 text-center text-xs text-rose-600">{error}</div>
          ) : filteredItems.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              No se encontraron artículos aptos para PDF con los filtros seleccionados.
            </div>
          ) : (
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100 text-slate-800 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="p-3 w-10 text-center">#</th>

                  {/* FUENTE / ID CON FILTRO Y ORDENACION */}
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

                  {/* ARTICULO Y METADATOS CON ORDENACION A-Z */}
                  <th className="p-3 min-w-[280px]">
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => toggleSort('title')}
                        className="flex items-center space-x-1.5 text-slate-800 hover:text-emerald-700 font-bold uppercase"
                      >
                        <span>Artículo y Metadatos</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                        {sortColumn === 'title' && (
                          <span className="text-[9px] text-emerald-700 font-semibold font-mono">
                            ({sortDirection === 'asc' ? 'A-Z' : 'Z-A'})
                          </span>
                        )}
                      </button>
                    </div>
                  </th>

                  <th className="p-3 min-w-[120px]">Estado Título/Abstract</th>

                  {/* ESTADO PDF & ORIGEN CON FILTRO DESPLEGABLE */}
                  <th className="p-3 min-w-[160px]">
                    <div className="space-y-1">
                      <span className="block font-bold">Estado PDF & Origen</span>
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="w-full text-[10px] py-0.5 px-1 bg-white border border-slate-300 rounded font-normal text-slate-700 normal-case"
                      >
                        <option value="ALL">Todos los estados</option>
                        <option value="DOWNLOADED">Descargado (OA)</option>
                        <option value="MANUALLY_UPLOADED">Cargado Manualmente</option>
                        <option value="PENDING_MANUAL_UPLOAD">Pendiente Carga Manual</option>
                        <option value="PENDING_AUTO_DOWNLOAD">Pendiente Auto</option>
                        <option value="ERROR">Error</option>
                      </select>
                    </div>
                  </th>

                  <th className="p-3 text-right min-w-[180px]">Gestión / Archivo</th>
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
                  const isPdfAvailable = rec.pdf_download_status === 'DOWNLOADED' || rec.pdf_download_status === 'MANUALLY_UPLOADED';
                  const pdfUrl = pdfService.getPdfFileUrl(project.id, rec.record_id);

                  return (
                    <tr key={rec.record_id} className="hover:bg-slate-50/80 transition">
                      <td className="p-3 font-mono text-slate-400 text-center">{rowIndex}</td>

                      <td className="p-3">
                        <span className="badge-green text-[10px] block mb-0.5">{rec.database_source}</span>
                        {rec.id_article && <span className="font-mono text-[10px] text-slate-400">{rec.id_article}</span>}
                      </td>

                      <td className="p-3 space-y-1 max-w-md">
                        <h4 className="font-bold text-slate-900 leading-snug">{rec.title}</h4>
                        <div className="text-[11px] text-slate-500">
                          {rec.authors || 'Autores N/A'} ({rec.publication_year || 'Año N/A'})
                        </div>
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

                      <td className="p-3 space-y-1 text-[10px]">
                        <div>Título: <span className="font-bold text-slate-800 uppercase">{mapStatusToSpanish(rec.title_status)}</span></div>
                        <div>Abstract: <span className="font-bold text-slate-800 uppercase">{mapStatusToSpanish(rec.abstract_status)}</span></div>
                      </td>

                      <td className="p-3 space-y-1">
                        <div>{renderPdfStatusBadge(rec.pdf_download_status)}</div>
                        {rec.pdf_download_source && (
                          <div className="text-[10px] text-slate-500 font-mono">
                            Fuente: <strong>{rec.pdf_download_source}</strong>
                          </div>
                        )}
                        {rec.pdf_error_message && (
                          <div className="text-[10px] text-rose-600 truncate max-w-xs" title={rec.pdf_error_message}>
                            {rec.pdf_error_message}
                          </div>
                        )}
                      </td>

                      <td className="p-3 text-right space-x-1.5 whitespace-nowrap">
                        {isPdfAvailable ? (
                          <div className="inline-flex items-center space-x-1.5">
                            <a
                              href={pdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn-green text-[11px] py-1 px-2.5 inline-flex items-center space-x-1"
                              title="Abrir y visualizar el PDF en el navegador"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>Ver PDF</span>
                            </a>

                            {/* REEMPLAZAR PDF (PUT) */}
                            <label
                              onDragOver={(e) => handleInlineDragOver(e, rec.record_id)}
                              onDragLeave={handleInlineDragLeave}
                              onDrop={(e) => handleInlineDrop(e, rec.record_id)}
                              className={`inline-flex items-center space-x-1 px-2 py-1 rounded-lg text-[10px] font-semibold border border-dashed cursor-pointer transition ${
                                draggingRecordId === rec.record_id
                                  ? 'border-emerald-600 bg-emerald-100 text-emerald-900'
                                  : inlineUploadingRecordId === rec.record_id
                                  ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                                  : 'border-slate-300 hover:border-emerald-500 bg-white text-slate-700 hover:text-emerald-700'
                              }`}
                              title="Reemplazar el PDF actual mediante arrastrar y soltar o clic (PUT)"
                            >
                              <input
                                type="file"
                                accept="application/pdf,.pdf"
                                onChange={(e) => {
                                  if (e.target.files && e.target.files.length > 0) {
                                    handleInlineUpload(rec.record_id, e.target.files[0]);
                                  }
                                }}
                                className="hidden"
                              />
                              {inlineUploadingRecordId === rec.record_id ? (
                                <RefreshCw className="w-3 h-3 animate-spin text-emerald-600" />
                              ) : (
                                <RotateCcw className="w-3 h-3 text-slate-500" />
                              )}
                              <span>Reemplazar</span>
                            </label>

                            {/* ELIMINAR PDF (DELETE) */}
                            <button
                              onClick={() => handleDeletePdf(rec.record_id)}
                              disabled={deletingRecordId === rec.record_id}
                              className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 border border-rose-200 inline-flex items-center"
                              title="Eliminar archivo PDF físico (DELETE) y volver a Pendiente Carga Manual"
                            >
                              {deletingRecordId === rec.record_id ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <label
                            onDragOver={(e) => handleInlineDragOver(e, rec.record_id)}
                            onDragLeave={handleInlineDragLeave}
                            onDrop={(e) => handleInlineDrop(e, rec.record_id)}
                            className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold border-2 border-dashed cursor-pointer transition-all ${
                              draggingRecordId === rec.record_id
                                ? 'border-emerald-600 bg-emerald-100 text-emerald-900 scale-105 shadow-xs'
                                : inlineUploadingRecordId === rec.record_id
                                ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                                : 'border-emerald-300 hover:border-emerald-500 bg-emerald-50/50 hover:bg-emerald-50 text-emerald-800'
                            }`}
                            title="Arrastra y suelta el archivo PDF sobre este recuadro o haz clic para seleccionarlo"
                          >
                            <input
                              type="file"
                              accept="application/pdf,.pdf"
                              onChange={(e) => {
                                if (e.target.files && e.target.files.length > 0) {
                                  handleInlineUpload(rec.record_id, e.target.files[0]);
                                }
                              }}
                              className="hidden"
                            />
                            {inlineUploadingRecordId === rec.record_id ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                                <span>Subiendo...</span>
                              </>
                            ) : (
                              <>
                                <FileUp className="w-3.5 h-3.5 text-emerald-600" />
                                <span>{draggingRecordId === rec.record_id ? 'Soltar aquí' : 'Soltar PDF aquí'}</span>
                              </>
                            )}
                          </label>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* PAGINACIÓN */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2 text-xs text-slate-500">
            <span>Página {page} de {totalPages}</span>
            <div className="flex space-x-2">
              <button
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page === 1}
                className="btn-outline-theme px-3 py-1 text-xs disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                disabled={page === totalPages}
                className="btn-outline-theme px-3 py-1 text-xs disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>



      {/* MODAL DE PRUEBA RÁPIDA DIRECTA POR DOI / URL */}
      {showTestModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-xl w-full p-5 sm:p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                  <FlaskConical className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Prueba Rápida de Descargador de PDFs</h3>
                  <p className="text-[11px] text-slate-500">Ejecuta la cadena de resolveres en vivo (Unpaywall, Semantic Scholar, CrossRef)</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowTestModal(false);
                  setTestResult(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">DOI del Artículo:</label>
                <input
                  type="text"
                  placeholder="ej. 10.48550/arXiv.2303.08774"
                  value={testDoi}
                  onChange={(e) => setTestDoi(e.target.value)}
                  className="input-theme w-full py-1.5 px-3 text-xs font-mono"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">O URL Directa (Opcional):</label>
                <input
                  type="text"
                  placeholder="https://arxiv.org/pdf/2303.08774.pdf"
                  value={testUrl}
                  onChange={(e) => setTestUrl(e.target.value)}
                  className="input-theme w-full py-1.5 px-3 text-xs font-mono"
                />
              </div>

              <div className="flex justify-end space-x-2">
                <button
                  onClick={handleRunTestDownload}
                  disabled={testing}
                  className="btn-green text-xs py-2 px-4 inline-flex items-center space-x-2"
                >
                  {testing ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <FlaskConical className="w-4 h-4" />
                  )}
                  <span>Ejecutar Prueba en Vivo</span>
                </button>
              </div>

              {/* RESULTADOS DE LA PRUEBA */}
              {testResult && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 font-mono text-[11px]">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="font-bold">Resultado de Descarga:</span>
                    <span className={testResult.success ? 'text-emerald-700 font-bold' : 'text-rose-600 font-bold'}>
                      {testResult.success ? '✔ EXITOSO' : '✖ FALLIDO'}
                    </span>
                  </div>

                  {testResult.success ? (
                    <div className="space-y-1 text-slate-700">
                      <div>Fuente Resolver: <strong className="text-emerald-800">{testResult.download_source || 'Direct URL'}</strong></div>
                      <div>Ruta Almacenada: <span className="text-slate-600">{testResult.file_path}</span></div>
                      <div>Hash SHA-256: <span className="text-slate-500 text-[10px] break-all">{testResult.sha256_hash}</span></div>
                      <div>Tamaño: <strong>{testResult.file_size_bytes} bytes</strong></div>
                    </div>
                  ) : (
                    <div className="text-rose-600">
                      Error: {testResult.error_message || 'No se pudo obtener el PDF en acceso abierto.'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PdfManagementTab;
