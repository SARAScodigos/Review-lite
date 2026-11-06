import React, { useState, useEffect } from 'react';
import {
  Upload,
  FileUp,
  Sparkles,
  Database,
  FileText,
  Trash2,
  AlertCircle,
  RefreshCw,
  FileSpreadsheet,
  Eye,
  X,
  Play,
  Copy,
  Check
} from 'lucide-react';
import type { RSLProject } from '../../types/project';
import { searchFilesService } from '../../services/searchFilesService';
import type {
  SearchResultFile,
  PendingDuplicateCluster,
  ScreeningSessionStatus,
  DeduplicationSummaryResponse
} from '../../services/searchFilesService';
import { DeduplicationReviewModal } from './DeduplicationReviewModal';
import { ExtractedRecordsModal } from './ExtractedRecordsModal';
import { UniqueRecordsModal } from './UniqueRecordsModal';

interface ImportacionesTabProps {
  project: RSLProject;
}

export const ImportacionesTab: React.FC<ImportacionesTabProps> = ({ project }) => {
  // Estado de lista de archivos de búsqueda desde la BD
  const [searchFiles, setSearchFiles] = useState<SearchResultFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState<boolean>(true);
  const [fileError, setFileError] = useState<string | null>(null);

  // Resumen por fuente bibliográfica (GET /duplicates/summary)
  const [sourceSummary, setSourceSummary] = useState<DeduplicationSummaryResponse | null>(null);

  // Modal para subir archivo
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [databaseSource, setDatabaseSource] = useState<string>('Scopus');
  const [searchEquation, setSearchEquation] = useState<string>('');
  const [fileNotes, setFileNotes] = useState<string>('');
  const [referentialName, setReferentialName] = useState<string>('');

  // Tareas Celery en ejecución (task_id -> status)
  const [extractingTaskMap, setExtractingTaskMap] = useState<Record<string, string>>({});

  // Ver registros extraídos de un archivo
  const [viewingFileRecords, setViewingFileRecords] = useState<SearchResultFile | null>(null);

  // Estado de la Sesión de Desduplicación PRISMA
  const [screeningSession, setScreeningSession] = useState<ScreeningSessionStatus | null>(null);
  const [isDeduplicating, setIsDeduplicating] = useState<boolean>(false);

  // Clusters duplicados pendientes
  const [pendingClusters, setPendingClusters] = useState<PendingDuplicateCluster[]>([]);
  const [isClusterModalOpen, setIsClusterModalOpen] = useState<boolean>(false);

  // Modal para ver detalles de Registros Únicos (GET /screening/duplicates/unique-records)
  const [isUniqueModalOpen, setIsUniqueModalOpen] = useState<boolean>(false);

  // Estado para feedback de copia de Ecuación de Búsqueda
  const [copiedFileId, setCopiedFileId] = useState<string | null>(null);

  const handleCopyEquation = (equation: string, fileId: string) => {
    if (!equation) return;
    navigator.clipboard.writeText(equation);
    setCopiedFileId(fileId);
    setTimeout(() => setCopiedFileId(null), 2000);
  };

  // Cargar datos iniciales desde el backend
  const loadSearchFilesAndSession = async () => {
    setLoadingFiles(true);
    setFileError(null);
    try {
      const [files, session, duplicates, summaryBySource] = await Promise.all([
        searchFilesService.getSearchFiles(project.id).catch(() => []),
        searchFilesService.getScreeningSession(project.id).catch(() => null),
        searchFilesService.getPendingDuplicates(project.id).catch(() => []),
        searchFilesService.getDeduplicationSummaryBySource(project.id).catch(() => null),
      ]);

      setSearchFiles(files);
      if (session) setScreeningSession(session);
      setPendingClusters(duplicates);
      if (summaryBySource) setSourceSummary(summaryBySource);
    } catch (err: any) {
      console.error('Error cargando archivos de búsqueda:', err);
      setFileError('No se pudo comunicar con los servicios de extracción y desduplicación.');
    } finally {
      setLoadingFiles(false);
    }
  };

  useEffect(() => {
    loadSearchFilesAndSession();
  }, [project.id]);

  // Manejar subida de archivo
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      alert('Por favor selecciona un archivo (.csv, .xls, .xlsx, .bib, .ris)');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('database_source', databaseSource);
      if (referentialName) formData.append('nombre', referentialName.trim());
      if (searchEquation) formData.append('search_equation', searchEquation.trim());
      if (fileNotes) formData.append('notes', fileNotes.trim());

      // Determinar file_type
      const ext = selectedFile.name.split('.').pop()?.toLowerCase() || 'csv';
      formData.append('file_type', ext);

      const newFile = await searchFilesService.uploadSearchFile(project.id, formData);
      setSearchFiles((prev) => [newFile, ...prev]);

      // Cerrar modal y reiniciar campos
      setIsUploadModalOpen(false);
      setSelectedFile(null);
      setSearchEquation('');
      setFileNotes('');
      setReferentialName('');
    } catch (err: any) {
      console.error('Error al subir archivo:', err);
      alert('Error al subir el archivo: ' + (err.response?.data?.detail || err.message));
    } finally {
      setUploading(false);
    }
  };

  // Disparar extracción asíncrona Celery
  const handleTriggerExtraction = async (fileId: string) => {
    try {
      const res = await searchFilesService.triggerExtraction(fileId);
      setExtractingTaskMap((prev) => ({ ...prev, [fileId]: res.task_id }));

      // Polling para consultar estado de Celery
      pollTaskStatus(fileId, res.task_id);
    } catch (err: any) {
      console.error('Error al iniciar extracción Celery:', err);
    }
  };

  const pollTaskStatus = (fileId: string, taskId: string) => {
    const interval = setInterval(async () => {
      try {
        const taskRes = await searchFilesService.getTaskStatus(taskId);
        if (taskRes.status === 'SUCCESS' || taskRes.status === 'FAILURE') {
          clearInterval(interval);
          setExtractingTaskMap((prev) => {
            const updated = { ...prev };
            delete updated[fileId];
            return updated;
          });
          loadSearchFilesAndSession();
        }
      } catch {
        clearInterval(interval);
      }
    }, 2000);
  };

  // Eliminar archivo de búsqueda
  const handleDeleteFile = async (fileId: string) => {
    if (!window.confirm('¿Deseas eliminar este archivo y todos sus registros extraídos en cascada?')) return;
    try {
      await searchFilesService.deleteSearchFile(fileId);
      setSearchFiles((prev) => prev.filter((f) => f.id !== fileId));
      loadSearchFilesAndSession();
    } catch (err: any) {
      alert('Error al eliminar archivo: ' + (err.message || 'Error desconocido'));
    }
  };

  // Ver registros extraídos
  const handleViewRecords = (file: SearchResultFile) => {
    setViewingFileRecords(file);
  };

  // Disparar Desduplicación Celery (Hito 1)
  const handleRunDeduplication = async (forceRerun: boolean = false) => {
    setIsDeduplicating(true);
    try {
      await searchFilesService.triggerDeduplication(project.id, forceRerun);
      await loadSearchFilesAndSession();
      alert('Tarea de desduplicación iniciada');
    } catch (err: any) {
      console.error('Error al ejecutar desduplicación:', err);
      alert('No se pudo ejecutar la desduplicación: ' + (err.response?.data?.detail || err.message));
    } finally {
      setIsDeduplicating(false);
    }
  };

  return (
    <div className="space-y-6">
      {fileError && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between text-amber-800 text-xs">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>{fileError}</span>
          </div>
          <button
            onClick={loadSearchFilesAndSession}
            className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 font-semibold rounded-lg text-[11px]"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* PANEL SUPERIOR: ACCIONES Y RESUMEN PRISMA DE DESDUPLICACIÓN */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <Upload className="w-5 h-5 text-emerald-600" />
              <span>Importación y Desduplicación de Fuentes</span>
            </h2>
            <p className="text-xs text-slate-500">
              Carga de fuentes bibliográficas, extracción automática de metadatos y detección inteligente de duplicados.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto">
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="btn-green inline-flex items-center justify-center space-x-2 text-xs py-2 px-3.5 shadow-xs"
            >
              <FileUp className="w-4 h-4" />
              <span>Subir Archivo (.csv, .xlsx, .bib)</span>
            </button>

            <a
              href={searchFilesService.getExportUniqueExcelUrl(project.id)}
              download
              className="btn-outline-theme inline-flex items-center justify-center space-x-2 text-xs py-2 px-3.5"
              title="Descargar Excel de registros únicos"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Exportar Únicos (.xlsx)</span>
            </a>
          </div>
        </div>

        {/* REGLAS DE DESDUPLICACIÓN Y STATUS DE LA SESIÓN PRISMA */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Total Inicial Extraído</span>
            <div className="text-xl font-extrabold text-slate-900">
              {screeningSession?.total_initial_records ?? searchFiles.reduce((acc, f) => acc + (f.total_records || 0), 0)} Registros
            </div>
            <span className="text-[10px] text-slate-500">{searchFiles.length} Fuentes importadas</span>
          </div>

          <div className="p-4 rounded-xl bg-orange-50 border border-orange-200 space-y-1">
            <span className="text-[11px] font-bold text-orange-800 uppercase">Duplicados Removidos</span>
            <div className="text-xl font-extrabold text-orange-900">
              {screeningSession?.duplicate_records_count ?? 0} Duplicados
            </div>
            <span className="text-[10px] text-orange-700 font-medium">Desduplicados en BD</span>
          </div>

          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1.5 flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-bold text-emerald-800 uppercase">Únicos Resultantes</span>
              <div className="text-xl font-extrabold text-emerald-900">
                {screeningSession?.unique_records_count ?? (
                  (screeningSession?.total_initial_records ?? searchFiles.reduce((acc, f) => acc + (f.total_records || 0), 0)) -
                  (screeningSession?.duplicate_records_count ?? 0)
                )} Únicos
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="badge-green text-[10px]">Listos para Cribado</span>
              <button
                type="button"
                onClick={() => setIsUniqueModalOpen(true)}
                className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 hover:underline inline-flex items-center space-x-1"
                title="Ver tabla detallada de registros únicos"
              >
                <Eye className="w-3.5 h-3.5 text-emerald-600" />
                <span>Ver Detalles</span>
              </button>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2 flex flex-col justify-between shadow-2xs">
            <div>
              <span className="text-[11px] font-bold text-slate-700 uppercase">Desduplicación por DOI</span>
              <div className="text-xs font-semibold text-slate-800 truncate">
                {screeningSession?.session_status === 'AWAITING_DUPLICATE_REVIEW'
                ?'Revisión Manual Pendiente':null
                }
              </div>
            </div>

            <div className="flex gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => handleRunDeduplication(true)}
                disabled={isDeduplicating}
                className="btn-green text-[11px] py-1.5 px-2 inline-flex items-center justify-center space-x-1"
                title="Ejecutar algoritmo de desduplicación Celery"
              >
                {isDeduplicating ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Ejecutar</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setIsClusterModalOpen(true)}
                className="btn-orange flex-1 text-[11px] py-1.5 px-2 inline-flex items-center justify-center space-x-1"
                title="Abrir panel de revisión de duplicados y registros únicos"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Revisar Únicos {pendingClusters.length > 0 ? `(${pendingClusters.length})` : ''}</span>
              </button>
            </div>
          </div>
        </div>

        {/* DESGLOSE DE DESDUPLICACIÓN POR FUENTE BIBLIOGRÁFICA (GET /duplicates/summary) */}
        {sourceSummary?.by_database_source && sourceSummary.by_database_source.length > 0 && (
          <div className="bg-slate-50/80 rounded-2xl border border-slate-200 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center space-x-2">
                <Database className="w-4 h-4 text-emerald-600" />
                <span>Resumen de Desduplicación por Fuente Bibliográfica</span>
              </h3>
              <span className="text-[11px] font-semibold text-slate-500">
                {sourceSummary.total_records} Registros totales • {sourceSummary.unique_records} Únicos actuales
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {sourceSummary.by_database_source.map((src, idx) => (
                <div key={idx} className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="badge-green font-bold text-xs">{src.database_source}</span>
                    <span className="text-xs font-extrabold text-slate-900">{src.total_records} ítems</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-center pt-1.5 border-t border-slate-100 text-[11px]">
                    <div className="bg-emerald-50/60 p-1.5 rounded-lg border border-emerald-100">
                      <span className="text-[10px] text-emerald-700 font-bold block">Únicos</span>
                      <span className="font-extrabold text-emerald-900">{src.unique_records}</span>
                    </div>
                    <div className="bg-orange-50/60 p-1.5 rounded-lg border border-orange-100">
                      <span className="text-[10px] text-orange-700 font-bold block">Duplicados</span>
                      <span className="font-extrabold text-orange-900">{src.duplicate_records}</span>
                    </div>
                    <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-600 font-bold block">Pendientes</span>
                      <span className="font-extrabold text-slate-800">{src.pending_review_records}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TABLA DE ARCHIVOS DE BÚSQUEDA REGISTRADOS */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-2">
              <FileText className="w-4 h-4 text-emerald-600" />
              <span>Archivos y Fuentes Importadas</span>
            </h3>

            <button
              onClick={loadSearchFilesAndSession}
              className="text-xs text-emerald-700 hover:underline flex items-center space-x-1 font-semibold"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingFiles ? 'animate-spin' : ''}`} />
              <span>Actualizar lista</span>
            </button>
          </div>

          {loadingFiles ? (
            <div className="py-8 text-center space-y-2 bg-slate-50 rounded-xl border border-slate-200">
              <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin mx-auto" />
              <p className="text-xs text-slate-500">Cargando archivos de búsqueda...</p>
            </div>
          ) : searchFiles.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-slate-300 rounded-xl space-y-3 bg-slate-50/50">
              <Upload className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-800">No hay archivos de búsqueda registrados aún</p>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                  Sube los reportes exportados de Scopus, Web of Science, IEEE Xplore o PubMed para comenzar la extracción.
                </p>
              </div>
              <button
                onClick={() => setIsUploadModalOpen(true)}
                className="btn-green inline-flex items-center space-x-2 text-xs py-1.5 px-3"
              >
                <FileUp className="w-4 h-4" />
                <span>Subir Primer Archivo</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-3">Nombre Referencial</th>
                    <th className="p-3">Base de Datos</th>
                    <th className="p-3">Ecuación de Búsqueda</th>
                    <th className="p-3">Registros Extraídos</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {searchFiles.map((file) => (
                    <tr key={file.id} className="hover:bg-slate-50 transition">
                      <td className="p-3 font-semibold text-slate-900">
                        <div className="flex items-center space-x-2">
                          <FileText className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                          <div>
                            <div>{file.nombre || file.file_path.split('/').pop()}</div>
                            {file.notes && <div className="text-[10px] text-slate-400 font-normal">{file.notes}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="badge-green">{file.database_source}</span>
                      </td>
                      <td className="p-3 max-w-xs">
                        {file.search_equation ? (
                          <div className="flex items-center space-x-1.5">
                            <span
                              className="font-mono text-[11px] text-slate-600 truncate flex-1 block"
                              title={file.search_equation}
                            >
                              {file.search_equation}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyEquation(file.search_equation!, file.id)}
                              className={`p-1 rounded-lg border transition-all inline-flex items-center space-x-1 flex-shrink-0 ${
                                copiedFileId === file.id
                                  ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                                  : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300'
                              }`}
                              title="Copiar ecuación de búsqueda completa al portapapeles"
                            >
                              {copiedFileId === file.id ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  <span className="text-[10px] font-bold text-emerald-700">Copiado</span>
                                </>
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="font-mono text-[11px] text-slate-400">N/A</span>
                        )}
                      </td>
                      <td className="p-3 font-bold text-slate-900">
                        {file.total_records ? `${file.total_records} ítems` : 'Sin extraer'}
                      </td>
                      <td className="p-3">
                        {extractingTaskMap[file.id] ? (
                          <span className="inline-flex items-center text-orange-600 font-semibold text-[11px]">
                            <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Procesando extracción...
                          </span>
                        ) : file.total_records ? (
                          <span className="badge-green">Extraído</span>
                        ) : (
                          <span className="badge-orange text-[10px]">Pendiente</span>
                        )}
                      </td>
                      <td className="p-3 text-right space-x-1.5">
                        <button
                          onClick={() => handleTriggerExtraction(file.id)}
                          disabled={Boolean(extractingTaskMap[file.id])}
                          className="btn-green text-[11px] py-1 px-2.5 inline-flex items-center space-x-1 shadow-2xs"
                          title="Iniciar extracción de metadatos del archivo"
                        >
                          {extractingTaskMap[file.id] ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Extrayendo...</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>Iniciar Extracción</span>
                            </>
                          )}
                        </button>

                        {file.total_records ? (
                          <button
                            onClick={() => handleViewRecords(file)}
                            className="btn-outline-theme text-[11px] py-1 px-2.5 inline-flex items-center space-x-1"
                            title="Ver registros extraídos"
                          >
                            <Eye className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Ver Registros</span>
                          </button>
                        ) : null}

                        <button
                          onClick={() => handleDeleteFile(file.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition inline-block align-middle"
                          title="Eliminar archivo y sus registros"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* MODAL PARA SUBIR NUEVO ARCHIVO DE BÚSQUEDA */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4 my-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <FileUp className="w-5 h-5 text-emerald-600" />
                <span>Subir Archivo de Resultados</span>
              </h3>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Base de Datos de Origen *</label>
                <select
                  value={databaseSource}
                  onChange={(e) => setDatabaseSource(e.target.value)}
                  className="input-theme w-full text-xs"
                >
                  <option value="Scopus">Scopus</option>
                  <option value="Web of Science">Web of Science (WoS)</option>
                  <option value="IEEE Xplore">IEEE Xplore</option>
                  <option value="PubMed">PubMed / MEDLINE</option>
                  <option value="SciELO">SciELO</option>
                  <option value="Otro">Otro (BibTeX / RIS genérico)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Seleccionar Archivo Binario *</label>
                <input
                  type="file"
                  required
                  accept=".csv,.xls,.xlsx,.bib,.ris,.nbib"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="input-theme w-full text-xs"
                />
                <span className="text-[10px] text-slate-400">Soporta formatos .csv, .xlsx, .bib, .ris</span>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Nombre Referencial (Opcional)</label>
                <input
                  type="text"
                  placeholder="Ej: Scopus_IA_Educacion_2025.csv"
                  value={referentialName}
                  onChange={(e) => setReferentialName(e.target.value)}
                  className="input-theme w-full text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Ecuación de Búsqueda (Opcional)</label>
                <textarea
                  rows={2}
                  placeholder='Ej: ("Artificial Intelligence" OR "Machine Learning") AND "Systematic Review"'
                  value={searchEquation}
                  onChange={(e) => setSearchEquation(e.target.value)}
                  className="input-theme w-full text-xs font-mono"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="btn-outline-theme text-xs py-2 px-3.5"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="btn-green text-xs py-2 px-4 inline-flex items-center space-x-2"
                >
                  {uploading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Subiendo...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>Subir Archivo</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DESACOPLADO DE RESOLUCIÓN DE DUPLICADOS Y REGISTROS ÚNICOS */}
      <DeduplicationReviewModal
        projectId={project.id}
        isOpen={isClusterModalOpen}
        onClose={() => setIsClusterModalOpen(false)}
        onClusterResolved={loadSearchFilesAndSession}
      />

      {/* MODAL DESACOPLADO DE CONSULTA DE REGISTROS EXTRAÍDOS */}
      <ExtractedRecordsModal
        file={viewingFileRecords}
        isOpen={Boolean(viewingFileRecords)}
        onClose={() => setViewingFileRecords(null)}
      />

      {/* MODAL DESACOPLADO DE VER DETALLES DE REGISTROS ÚNICOS (GET /unique-records) */}
      <UniqueRecordsModal
        projectId={project.id}
        projectName={project.title}
        isOpen={isUniqueModalOpen}
        onClose={() => setIsUniqueModalOpen(false)}
      />
    </div>
  );
};

export default ImportacionesTab;
