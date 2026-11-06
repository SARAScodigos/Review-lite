import React, { useEffect, useState } from 'react';
import { Download, FileDown, FileSpreadsheet, FileText, Layers, RefreshCw, Trash2 } from 'lucide-react';
import type { RSLProject } from '../../types/project';
import { matrixService } from '../../services/matrixService';
import { exportsService } from '../../services/exportsService';
import type { ExportVersion } from '../../services/exportsService';

interface ExportsTabProps {
  project: RSLProject;
}

const fileSize = (bytes?: number | null) => {
  if (!bytes) return 'Sin tamaño disponible';
  return `${(bytes / 1024).toFixed(1)} KB`;
};

export const ExportsTab: React.FC<ExportsTabProps> = ({ project }) => {
  const [versions, setVersions] = useState<ExportVersion[]>([]);
  const [generating, setGenerating] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadVersions = async () => {
    try {
      setVersions(await exportsService.listVersions(project.id));
    } catch (err: any) {
      setError(err.response?.data?.detail || 'No fue posible cargar las versiones exportadas.');
    }
  };

  useEffect(() => {
    void loadVersions();
  }, [project.id]);

  useEffect(() => {
    if (!versions.some((version) => version.export_status === 'PENDING' || version.export_status === 'GENERATING')) return;
    const interval = window.setInterval(() => void loadVersions(), 2500);
    return () => window.clearInterval(interval);
  }, [versions, project.id]);

  useEffect(() => {
    if (!activeTaskId) return;
    const interval = window.setInterval(async () => {
      try {
        const task = await exportsService.getTaskStatus(project.id, activeTaskId);
        if (task.status === 'SUCCESS' || task.status === 'FAILURE') {
          setActiveTaskId(null);
          setMessage(task.status === 'SUCCESS' ? 'El manuscrito se generó y ya está disponible para descarga.' : null);
          if (task.status === 'FAILURE') setError(task.error || 'La generación del manuscrito falló.');
          await loadVersions();
        }
      } catch {
        // El historial conserva el estado de la versión aun si falla una consulta transitoria de Celery.
      }
    }, 2500);
    return () => window.clearInterval(interval);
  }, [activeTaskId, project.id]);

  const generateManuscript = async () => {
    setGenerating(true);
    setError(null);
    try {
      const queued = await exportsService.generateManuscript(project.id);
      setMessage(`${queued.message} La descarga se habilitará al completarse.`);
      setActiveTaskId(queued.task_id);
      await loadVersions();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'No fue posible encolar la exportación del manuscrito.');
    } finally {
      setGenerating(false);
    }
  };

  const deleteVersion = async (version: ExportVersion) => {
    if (!window.confirm(`Eliminar ${version.version_label}? Esta acción elimina su archivo.`)) return;
    try {
      await exportsService.deleteVersion(project.id, version.id);
      await loadVersions();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'No fue posible eliminar la versión.');
    }
  };

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <h2 className="text-base font-bold text-slate-900">Exportación de Reportes y Entregables</h2>
            <p className="text-xs text-slate-500 mt-1">Genera el manuscrito consolidado, el diagrama PRISMA y la matriz actual.</p>
          </div>
          <button onClick={() => void loadVersions()} className="btn-outline-theme inline-flex items-center gap-2 text-xs py-2" title="Actualizar historial">
            <RefreshCw className="w-4 h-4" /> Actualizar
          </button>
        </div>

        {message && <p className="mb-4 text-xs text-emerald-700">{message}</p>}
        {error && <p className="mb-4 text-xs text-red-700">{error}</p>}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <div className="border border-slate-200 p-4 space-y-3">
            <Layers className="w-5 h-5 text-emerald-700" />
            <div><h3 className="text-sm font-bold">Diagrama PRISMA 2020</h3><p className="text-xs text-slate-500">Basado en los contadores actuales del cribado.</p></div>
            <div className="flex gap-2">
              <a href={exportsService.getPrismaUrl(project.id, 'pdf')} className="btn-green inline-flex flex-1 justify-center gap-2 text-xs py-2"><FileDown className="w-4 h-4" /> PDF</a>
              <a href={exportsService.getPrismaUrl(project.id, 'svg')} className="btn-outline-theme inline-flex flex-1 justify-center gap-2 text-xs py-2"><Download className="w-4 h-4" /> SVG</a>
            </div>
          </div>

          <div className="border border-slate-200 p-4 space-y-3">
            <FileSpreadsheet className="w-5 h-5 text-orange-700" />
            <div><h3 className="text-sm font-bold">Matriz de extracción</h3><p className="text-xs text-slate-500">Libro Excel con las columnas y filas actuales.</p></div>
            <a href={matrixService.getExportExcelUrl(project.id)} className="btn-orange inline-flex w-full justify-center gap-2 text-xs py-2"><FileSpreadsheet className="w-4 h-4" /> Exportar Excel</a>
          </div>

          <div className="border border-slate-200 p-4 space-y-3">
            <FileText className="w-5 h-5 text-slate-700" />
            <div><h3 className="text-sm font-bold">Manuscrito RSL (.docx)</h3><p className="text-xs text-slate-500">Une los borradores y tablas confirmadas en orden académico.</p></div>
            <button onClick={() => void generateManuscript()} disabled={generating} className="btn-green inline-flex w-full justify-center gap-2 text-xs py-2 disabled:opacity-50">
              {generating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} Generar nueva versión
            </button>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900 mb-4">Versiones del manuscrito</h2>
        {versions.length === 0 ? <p className="text-xs text-slate-500">Todavía no hay versiones generadas.</p> : (
          <div className="divide-y divide-slate-100">
            {versions.map((version) => (
              <div key={version.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div><p className="text-sm font-semibold text-slate-900">{version.version_label} <span className="text-xs font-normal text-slate-500">{version.file_name}</span></p><p className="text-xs text-slate-500">{version.export_status} · {fileSize(version.file_size_bytes)} · {new Date(version.created_at).toLocaleString()}</p>{version.error_message && <p className="text-xs text-red-700">{version.error_message}</p>}</div>
                <div className="flex items-center gap-2">
                  {version.export_status === 'COMPLETED' && <a href={exportsService.getDownloadUrl(project.id, version.id)} className="btn-green inline-flex gap-2 text-xs py-2"><Download className="w-4 h-4" /> Descargar</a>}
                  <button onClick={() => void deleteVersion(version)} className="btn-outline-theme p-2" title="Eliminar versión"><Trash2 className="w-4 h-4 text-red-600" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
