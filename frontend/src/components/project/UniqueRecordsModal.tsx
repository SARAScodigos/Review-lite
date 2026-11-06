import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  RefreshCw,
  ExternalLink,
  Search,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  CheckCircle2,
  FileText
} from 'lucide-react';
import {
  searchFilesService
} from '../../services/searchFilesService';
import type {
  PaginatedUniqueRecordsResponse
} from '../../services/searchFilesService';

interface UniqueRecordsModalProps {
  projectId: string;
  projectName?: string;
  isOpen: boolean;
  onClose: () => void;
}

export const UniqueRecordsModal: React.FC<UniqueRecordsModalProps> = ({
  projectId,
  projectName,
  isOpen,
  onClose,
}) => {
  const [paginatedData, setPaginatedData] = useState<PaginatedUniqueRecordsResponse>({
    items: [],
    total: 0,
    skip: 0,
    limit: 100,
    returned: 0,
    has_next: false,
    has_previous: false,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(100);

  const fetchUniqueRecords = async (currentPage: number, currentLimit: number) => {
    setLoading(true);
    setError(null);
    try {
      const skip = (currentPage - 1) * currentLimit;
      const data = await searchFilesService.getUniqueRecords(projectId, skip, currentLimit);
      setPaginatedData(data);
    } catch (err: any) {
      console.error('Error al cargar registros únicos:', err);
      setError('No se pudieron consultar los registros únicos del servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setPage(1);
      fetchUniqueRecords(1, pageSize);
    }
  }, [isOpen, projectId]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchUniqueRecords(newPage, pageSize);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(1);
    fetchUniqueRecords(1, newSize);
  };

  if (!isOpen) return null;

  // Filtrar ítems localmente en la página actual
  const filteredItems = (paginatedData.items || []).filter((item) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      item.title.toLowerCase().includes(query) ||
      (item.authors && item.authors.toLowerCase().includes(query)) ||
      (item.doi && item.doi.toLowerCase().includes(query)) ||
      (item.source_title && item.source_title.toLowerCase().includes(query)) ||
      (item.id_article && item.id_article.toLowerCase().includes(query)) ||
      (item.database_source && item.database_source.toLowerCase().includes(query))
    );
  });

  const totalPages = Math.ceil((paginatedData.total || 1) / pageSize);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      {/* MODAL ANCHO ESPACIOSO (w-[96vw] max-w-7xl) */}
      <div className="bg-white border border-slate-200 rounded-2xl w-[96vw] max-w-7xl p-4 sm:p-6 shadow-2xl space-y-4 my-auto max-h-[92vh] flex flex-col justify-between">
        
        {/* ENCABEZADO DEL MODAL */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 flex-shrink-0">
          <div>
            <div className="flex items-center space-x-2">
              <span className="badge-green font-bold flex items-center space-x-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </span>
              {projectName && <span className="text-xs text-slate-400 font-medium">{projectName}</span>}
            </div>
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center space-x-2 leading-snug">
              <Sparkles className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <span>Registros Únicos Resultantes ({paginatedData.total})</span>
            </h3>
          </div>

          <div className="flex items-center space-x-2 self-end sm:self-auto">
            <a
              href={searchFilesService.getExportUniqueExcelUrl(projectId)}
              download
              className="btn-green text-xs py-1.5 px-3 inline-flex items-center space-x-1.5 shadow-2xs"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Exportar a Excel (.xlsx)</span>
            </a>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* BARRA DE BÚSQUEDA Y CONTROLES DE PAGINACIÓN */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs flex-shrink-0">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Filtrar únicos por título, autor, DOI, revista o ID artículo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-theme w-full pl-9 pr-8 text-xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between sm:justify-end space-x-3">
            <div className="flex items-center space-x-1.5 text-slate-600 font-medium">
              <span>Registros por página:</span>
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="input-theme py-1 px-2 text-xs"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
              </select>
            </div>

            <div className="text-slate-500 font-mono text-[11px]">
              Total: <strong className="text-emerald-700 font-extrabold">{paginatedData.total}</strong> artículos únicos
            </div>
          </div>
        </div>

        {/* TABLA ESPACIOSA DE REGISTROS ÚNICOS */}
        <div className="flex-1 overflow-auto border border-slate-200 rounded-xl min-h-[350px]">
          {loading ? (
            <div className="py-20 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
              <p className="text-xs text-slate-500 font-medium">Consultando registros únicos desduplicados...</p>
            </div>
          ) : error ? (
            <div className="py-12 text-center text-xs text-rose-600 font-medium">{error}</div>
          ) : filteredItems.length === 0 ? (
            <div className="py-16 text-center space-y-2 text-slate-500 text-xs">
              <FileText className="w-8 h-8 text-slate-400 mx-auto" />
              <p>No se encontraron registros únicos en este lote de búsqueda.</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs text-slate-700 border-collapse">
              <thead className="bg-slate-100 text-slate-800 uppercase font-bold text-[10px] tracking-wider sticky top-0 border-b border-slate-200 shadow-2xs">
                <tr>
                  <th className="p-3 border-r border-slate-200 w-12 text-center">#</th>
                  <th className="p-3 border-r border-slate-200 min-w-[110px]">ID Artículo</th>
                  <th className="p-3 border-r border-slate-200 min-w-[100px]">Fuente</th>
                  <th className="p-3 border-r border-slate-200 min-w-[280px]">Título del Artículo</th>
                  <th className="p-3 border-r border-slate-200 min-w-[180px]">Autores</th>
                  <th className="p-3 border-r border-slate-200 w-20 text-center">Año</th>
                  <th className="p-3 border-r border-slate-200 min-w-[160px]">Revista / Conferencia</th>
                  <th className="p-3 border-r border-slate-200 min-w-[170px]">DOI (Clickeable)</th>
                  <th className="p-3 min-w-[240px]">Abstract / Resumen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {filteredItems.map((rec, idx) => {
                  const rowIndex = (page - 1) * pageSize + idx + 1;
                  const doiUrl = rec.doi
                    ? rec.doi.startsWith('http')
                      ? rec.doi
                      : `https://doi.org/${rec.doi.replace(/^doi:/i, '').trim()}`
                    : null;

                  return (
                    <tr key={rec.record_id} className="hover:bg-slate-50/80 transition">
                      <td className="p-3 border-r border-slate-200 font-mono text-slate-400 text-center">
                        {rowIndex}
                      </td>

                      <td className="p-3 border-r border-slate-200 font-mono text-[11px] font-bold text-slate-800">
                        {rec.id_article ? (
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700">
                            {rec.id_article}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal">-</span>
                        )}
                      </td>

                      <td className="p-3 border-r border-slate-200">
                        <span className="badge-green">{rec.database_source}</span>
                      </td>

                      <td className="p-3 border-r border-slate-200 font-bold text-slate-900 leading-snug">
                        {rec.title}
                      </td>

                      <td className="p-3 border-r border-slate-200 text-slate-600">
                        {rec.authors || <span className="text-slate-400 italic">No especificado</span>}
                      </td>

                      <td className="p-3 border-r border-slate-200 font-mono text-center font-semibold text-slate-800">
                        {rec.publication_year || '-'}
                      </td>

                      <td className="p-3 border-r border-slate-200 text-slate-600">
                        {rec.source_title || <span className="text-slate-400 italic">-</span>}
                      </td>

                      {/* DOI CLICKEABLE CON ENLACE EXTERNO */}
                      <td className="p-3 border-r border-slate-200 font-mono text-[11px]">
                        {doiUrl ? (
                          <a
                            href={doiUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-700 hover:text-emerald-900 hover:underline inline-flex items-center space-x-1 font-semibold truncate max-w-[160px]"
                            title={`Abrir DOI: ${doiUrl}`}
                          >
                            <ExternalLink className="w-3 h-3 flex-shrink-0 text-emerald-600" />
                            <span className="truncate">{rec.doi}</span>
                          </a>
                        ) : (
                          <span className="text-slate-400 italic">Sin DOI</span>
                        )}
                      </td>

                      <td className="p-3 text-[11px] text-slate-600">
                        {rec.abstract ? (
                          <p className="line-clamp-2 hover:line-clamp-none transition-all leading-relaxed" title={rec.abstract}>
                            {rec.abstract}
                          </p>
                        ) : (
                          <span className="text-slate-400 italic">Sin resumen</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* PIE DE PÁGINA Y CONTROLES DE NAVEGACIÓN */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-100 flex-shrink-0 text-xs">
          <div className="text-slate-500">
            Mostrando página <strong className="text-slate-900">{page}</strong> de <strong className="text-slate-900">{totalPages || 1}</strong>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={!paginatedData.has_previous && page <= 1 || loading}
              className="btn-outline-theme text-xs py-1.5 px-3 inline-flex items-center space-x-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Anterior</span>
            </button>

            <span className="font-bold text-slate-700 px-2">{page}</span>

            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={!paginatedData.has_next && page >= totalPages || loading}
              className="btn-outline-theme text-xs py-1.5 px-3 inline-flex items-center space-x-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>Siguiente</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UniqueRecordsModal;
