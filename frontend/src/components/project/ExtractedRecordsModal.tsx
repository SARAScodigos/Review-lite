import React, { useState, useEffect } from 'react';
import {
  X,
  Database,
  RefreshCw,
  ExternalLink,
  Search,
  ChevronLeft,
  ChevronRight,
  FileText,
  Code
} from 'lucide-react';
import { searchFilesService } from '../../services/searchFilesService';
import type {
  SearchResultFile,
  ExtractedRecord,
  PaginatedExtractedRecordsResponse
} from '../../services/searchFilesService';

interface ExtractedRecordsModalProps {
  file: SearchResultFile | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ExtractedRecordsModal: React.FC<ExtractedRecordsModalProps> = ({
  file,
  isOpen,
  onClose,
}) => {
  const [paginatedData, setPaginatedData] = useState<PaginatedExtractedRecordsResponse>({
    total: 0,
    skip: 0,
    limit: 50,
    items: [],
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Ver metadatos raw_data de un registro individual en modal/drawer
  const [selectedRecordRaw, setSelectedRecordRaw] = useState<ExtractedRecord | null>(null);

  const fetchRecords = async (currentPage: number, currentLimit: number) => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const skip = (currentPage - 1) * currentLimit;
      const data = await searchFilesService.getExtractedRecords(file.id, skip, currentLimit);
      setPaginatedData(data);
    } catch (err: any) {
      console.error('Error al cargar registros extraídos:', err);
      setError('No se pudieron consultar los registros del servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && file) {
      setPage(1);
      fetchRecords(1, pageSize);
    }
  }, [isOpen, file]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchRecords(newPage, pageSize);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(1);
    fetchRecords(1, newSize);
  };

  if (!isOpen || !file) return null;

  // Filtrar ítems localmente si hay búsqueda
  const filteredItems = paginatedData.items.filter((item) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      item.title.toLowerCase().includes(query) ||
      (item.authors && item.authors.toLowerCase().includes(query)) ||
      (item.doi && item.doi.toLowerCase().includes(query)) ||
      (item.source_title && item.source_title.toLowerCase().includes(query))
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
              <span className="badge-green">{file.database_source}</span>
              <span className="text-xs text-slate-400 font-mono">{file.file_type.toUpperCase()}</span>
            </div>
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center space-x-2 leading-snug">
              <Database className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <span>Registros Extraídos: {file.nombre || file.file_path.split('/').pop()}</span>
            </h3>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition self-end sm:self-auto"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* BARRA DE BÚSQUEDA Y CONTROLES DE PAGINACIÓN */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs flex-shrink-0">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Filtrar por título, autor, revista o DOI en esta página..."
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
              </select>
            </div>

            <div className="text-slate-500 font-mono text-[11px]">
              Total: <strong className="text-slate-900">{paginatedData.total}</strong> artículos
            </div>
          </div>
        </div>

        {/* TABLA DE ANCHO COMPLETO PARA MOSTRAR TODOS LOS CAMPOS */}
        <div className="flex-1 overflow-auto border border-slate-200 rounded-xl min-h-[350px]">
          {loading ? (
            <div className="py-20 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
              <p className="text-xs text-slate-500 font-medium">Cargando registros desde PostgreSQL...</p>
            </div>
          ) : error ? (
            <div className="py-12 text-center text-xs text-rose-600 font-medium">{error}</div>
          ) : filteredItems.length === 0 ? (
            <div className="py-16 text-center space-y-2 text-slate-500 text-xs">
              <FileText className="w-8 h-8 text-slate-400 mx-auto" />
              <p>No se encontraron registros extraídos en esta página.</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs text-slate-700 border-collapse">
              <thead className="bg-slate-100 text-slate-800 uppercase font-bold text-[10px] tracking-wider sticky top-0 border-b border-slate-200 shadow-2xs">
                <tr>
                  <th className="p-3 border-r border-slate-200 w-12 text-center">#</th>
                  <th className="p-3 border-r border-slate-200 min-w-[280px]">Título del Artículo</th>
                  <th className="p-3 border-r border-slate-200 min-w-[180px]">Autores</th>
                  <th className="p-3 border-r border-slate-200 w-20 text-center">Año</th>
                  <th className="p-3 border-r border-slate-200 min-w-[160px]">Revista / Conferencia</th>
                  <th className="p-3 border-r border-slate-200 min-w-[170px]">DOI (Clickeable)</th>
                  <th className="p-3 border-r border-slate-200 min-w-[240px]">Abstract / Resumen</th>
                  <th className="p-3 text-center w-24">Raw Data</th>
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
                    <tr key={rec.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-3 border-r border-slate-200 font-mono text-slate-400 text-center">
                        {rowIndex}
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

                      <td className="p-3 border-r border-slate-200 text-[11px] text-slate-600">
                        {rec.abstract ? (
                          <p className="line-clamp-2 hover:line-clamp-none transition-all leading-relaxed" title={rec.abstract}>
                            {rec.abstract}
                          </p>
                        ) : (
                          <span className="text-slate-400 italic">Sin resumen</span>
                        )}
                      </td>

                      <td className="p-3 text-center">
                        {rec.raw_data && Object.keys(rec.raw_data).length > 0 ? (
                          <button
                            onClick={() => setSelectedRecordRaw(rec)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200 transition inline-flex items-center space-x-1 text-[10px] font-bold"
                            title="Ver columnas originales JSONB"
                          >
                            <Code className="w-3.5 h-3.5 text-emerald-600" />
                            <span>JSON</span>
                          </button>
                        ) : (
                          <span className="text-slate-300">-</span>
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
              disabled={page <= 1 || loading}
              className="btn-outline-theme text-xs py-1.5 px-3 inline-flex items-center space-x-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Anterior</span>
            </button>

            <span className="font-bold text-slate-700 px-2">{page}</span>

            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages || loading}
              className="btn-outline-theme text-xs py-1.5 px-3 inline-flex items-center space-x-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>Siguiente</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* MODAL / DRAWER PARA INSPECCIONAR RAW DATA (JSONB) */}
      {selectedRecordRaw && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-5 shadow-2xl space-y-4 my-auto max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h4 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                <Code className="w-4 h-4 text-emerald-600" />
                <span>Columnas Originales (`raw_data` JSONB)</span>
              </h4>
              <button
                onClick={() => setSelectedRecordRaw(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1 text-xs">
              <p className="font-bold text-slate-900">{selectedRecordRaw.title}</p>
              <p className="text-[11px] text-slate-500 font-mono">ID: {selectedRecordRaw.id}</p>
            </div>

            <div className="flex-1 overflow-auto bg-slate-900 text-slate-100 p-4 rounded-xl font-mono text-[11px]">
              <pre>{JSON.stringify(selectedRecordRaw.raw_data, null, 2)}</pre>
            </div>

            <div className="pt-2 text-right">
              <button
                onClick={() => setSelectedRecordRaw(null)}
                className="btn-outline-theme text-xs py-1.5 px-4"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExtractedRecordsModal;
