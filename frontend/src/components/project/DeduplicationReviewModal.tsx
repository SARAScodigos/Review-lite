import React, { useState, useEffect } from 'react';
import {
  X,
  AlertCircle,
  CheckCircle2,
  Check,
  RefreshCw,
  FileSpreadsheet,
  Sparkles,
  Info,
  Database
} from 'lucide-react';
import {
  searchFilesService
} from '../../services/searchFilesService';
import type {
  PendingDuplicateCluster,
  ScreeningSessionStatus,
  DeduplicationSummaryResponse
} from '../../services/searchFilesService';

interface DeduplicationReviewModalProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onClusterResolved?: () => void;
}

export const DeduplicationReviewModal: React.FC<DeduplicationReviewModalProps> = ({
  projectId,
  isOpen,
  onClose,
  onClusterResolved,
}) => {
  const [sessionStatus, setSessionStatus] = useState<ScreeningSessionStatus | null>(null);
  const [sourceSummary, setSourceSummary] = useState<DeduplicationSummaryResponse | null>(null);
  const [clusters, setClusters] = useState<PendingDuplicateCluster[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeClusterIndex, setActiveClusterIndex] = useState<number>(0);
  const [selectedMasterId, setSelectedMasterId] = useState<string | null>(null);
  const [resolving, setResolving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar sesión PRISMA y clusters pendientes del backend
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sessionRes, pendingRes, summaryBySource] = await Promise.all([
        searchFilesService.getScreeningSession(projectId).catch(() => null),
        searchFilesService.getPendingDuplicates(projectId).catch(() => []),
        searchFilesService.getDeduplicationSummaryBySource(projectId).catch(() => null),
      ]);
      if (sessionRes) setSessionStatus(sessionRes);
      setClusters(pendingRes);
      if (summaryBySource) setSourceSummary(summaryBySource);
    } catch (err: any) {
      console.error('Error al cargar clusters pendientes:', err);
      setError('No se pudieron consultar los duplicados del servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
      setActiveClusterIndex(0);
      setSelectedMasterId(null);
    }
  }, [isOpen, projectId]);

  if (!isOpen) return null;

  // Resolver cluster actual indicando el Registro Maestro (Ganador)
  const handleConfirmMasterRecord = async () => {
    if (clusters.length === 0) return;
    const currentCluster = clusters[activeClusterIndex];
    if (!selectedMasterId) {
      alert('Por favor selecciona cuál de los registros conservar como el Registro Maestro ("Ganador").');
      return;
    }

    setResolving(true);
    try {
      await searchFilesService.resolveDuplicateCluster(projectId, {
        cluster_id: currentCluster.cluster_id,
        selected_master_record_id: selectedMasterId,
        action: 'CONFIRM_DUPLICATES',
      });

      // Actualizar lista eliminando el cluster resuelto
      const updated = clusters.filter((_, idx) => idx !== activeClusterIndex);
      setClusters(updated);
      setSelectedMasterId(null);

      if (updated.length > 0) {
        setActiveClusterIndex((prev) => (prev >= updated.length ? 0 : prev));
      }

      if (onClusterResolved) onClusterResolved();
      await loadData();
    } catch (err: any) {
      alert('Error resolviendo coincidencia: ' + (err.response?.data?.detail || err.message));
    } finally {
      setResolving(false);
    }
  };

  const currentCluster = clusters[activeClusterIndex];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full p-5 sm:p-6 shadow-2xl space-y-5 my-auto max-h-[90vh] overflow-y-auto">
        {/* Encabezado del Modal */}
        <div className="flex justify-between items-center pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-emerald-600" />
              <span>Determinación de Registros Únicos y Revisión de Duplicados</span>
            </h3>
            <p className="text-xs text-slate-500">
              Evaluación de coincidencias difusas sospechosas (75%-94%) y selección del registro maestro.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Resumen de Sesión PRISMA */}
        {sessionStatus && (
          <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-center">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">Total Inicial</span>
              <div className="text-base font-extrabold text-slate-900">{sessionStatus.total_initial_records}</div>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-orange-600">Duplicados</span>
              <div className="text-base font-extrabold text-orange-700">{sessionStatus.duplicate_records_count}</div>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-emerald-600">Únicos Resultantes</span>
              <div className="text-base font-extrabold text-emerald-700">{sessionStatus.unique_records_count}</div>
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center space-y-2">
            <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin mx-auto" />
            <p className="text-xs text-slate-500">Consultando coincidencias pendientes...</p>
          </div>
        ) : clusters.length === 0 ? (
          /* Estado sin duplicados pendientes */
          <div className="space-y-4">
            <div className="py-6 text-center space-y-3 bg-emerald-50/50 border border-emerald-200 rounded-2xl p-6">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-2xs">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-slate-900">¡No hay duplicados pendientes por revisar!</h4>
                <p className="text-xs text-slate-600 max-w-md mx-auto">
                  Todos los registros sospechosos han sido resueltos o clasificados. Ya puedes descargar el informe consolidado con los artículos únicos.
                </p>
              </div>

              <div className="pt-1">
                <a
                  href={searchFilesService.getExportUniqueExcelUrl(projectId)}
                  download
                  className="btn-green inline-flex items-center space-x-2 text-xs py-2.5 px-4 shadow-sm"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Descargar Excel de Registros Únicos</span>
                </a>
              </div>
            </div>

            {/* DESGLOSE POR BASE DE DATOS FUENTE (`by_database_source`) */}
            {sourceSummary?.by_database_source && sourceSummary.by_database_source.length > 0 && (
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center space-x-2">
                  <Database className="w-4 h-4 text-emerald-600" />
                  <span>Desglose Final por Fuente Bibliográfica</span>
                </h4>

                <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-100 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="p-3">Fuente Bibliográfica</th>
                        <th className="p-3">Total Extraído</th>
                        <th className="p-3">Únicos Conservados</th>
                        <th className="p-3">Duplicados Filtrados</th>
                        <th className="p-3">Pendientes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sourceSummary.by_database_source.map((src, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="p-3 font-bold text-slate-900">{src.database_source}</td>
                          <td className="p-3 font-mono font-semibold text-slate-700">{src.total_records}</td>
                          <td className="p-3 font-mono font-bold text-emerald-700">{src.unique_records}</td>
                          <td className="p-3 font-mono font-bold text-orange-700">{src.duplicate_records}</td>
                          <td className="p-3 font-mono text-slate-500">{src.pending_review_records}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Lista de coincidencias para resolución manual */
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-orange-50/80 border border-orange-200 p-3 rounded-xl text-xs">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-orange-600 flex-shrink-0" />
                <span className="font-semibold text-orange-900">
                  Grupo {activeClusterIndex + 1} de {clusters.length}
                </span>
              </div>
              <span className="badge-orange">
                Coincidencia difusa: {currentCluster?.similarity_percentage || 85}%
              </span>
            </div>

            <p className="text-xs text-slate-600">
              Selecciona cuál de los siguientes artículos es la versión principal (<strong className="text-emerald-700">Registro Maestro</strong>). Los demás se marcarán como duplicados vinculados.
            </p>

            {/* Registros del Cluster actual */}
            <div className="space-y-3">
              {currentCluster?.records.map((rec) => {
                const isSelected = selectedMasterId === rec.id;
                return (
                  <div
                    key={rec.id}
                    onClick={() => setSelectedMasterId(rec.id)}
                    className={`p-4 rounded-2xl border cursor-pointer transition space-y-2 ${
                      isSelected
                        ? 'bg-emerald-50/90 border-emerald-500 ring-2 ring-emerald-500/20'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                          <span className="badge-green">{rec.database_source}</span>
                          {rec.file_name && <span className="text-slate-400 font-mono">Archivo: {rec.file_name}</span>}
                          {rec.publication_year && (
                            <span className="font-mono text-slate-500 font-semibold">Año: {rec.publication_year}</span>
                          )}
                          {rec.doi && <span className="font-mono text-slate-600">DOI: {rec.doi}</span>}
                        </div>
                        <h4 className="text-xs font-extrabold text-slate-900 leading-snug">{rec.title}</h4>
                        <p className="text-[11px] text-slate-600">
                          <strong>Autores:</strong> {rec.authors || 'No registrados'}
                        </p>
                        {rec.journal && (
                          <p className="text-[11px] text-slate-500">
                            <strong>Fuente/Journal:</strong> {rec.journal}
                          </p>
                        )}
                      </div>

                      <div className="pt-1 flex-shrink-0">
                        {isSelected ? (
                          <span className="px-3 py-1 rounded-xl bg-emerald-600 text-white font-bold text-[10px] uppercase flex items-center space-x-1 shadow-xs">
                            <Check className="w-3.5 h-3.5" />
                            <span>Maestro</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-xl bg-white border border-slate-300 text-slate-700 text-[10px] font-semibold">
                            Elegir Este
                          </span>
                        )}
                      </div>
                    </div>

                    {rec.abstract && (
                      <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-3 pt-2 border-t border-slate-200/60">
                        {rec.abstract}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer del Modal */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
          <div className="text-xs text-slate-400 flex items-center space-x-1">
            <Info className="w-3.5 h-3.5" />
            <span>Decisión guardada con trazabilidad por cluster.</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-outline-theme text-xs py-2 px-3.5"
            >
              Cerrar
            </button>

            {clusters.length > 0 && (
              <button
                type="button"
                onClick={handleConfirmMasterRecord}
                disabled={resolving || !selectedMasterId}
                className="btn-green text-xs py-2 px-4 inline-flex items-center space-x-1.5 shadow-sm"
              >
                {resolving ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirmar Registro Maestro</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeduplicationReviewModal;
