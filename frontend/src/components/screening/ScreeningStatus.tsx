import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  RefreshCw,
  AlertOctagon
} from 'lucide-react';
import { searchFilesService } from '../../services/searchFilesService';
import type { ScreeningSessionStatus } from '../../services/searchFilesService';
import { screeningService } from '../../services/screeningService';
import type { TitleScreeningMetrics, AbstractScreeningMetrics } from '../../services/screeningService';
import { ScreeningMetricsCards } from './ScreeningMetricsCards';

interface ScreeningStatusProps {
  projectId: string;
  stage?: 'title' | 'abstract';
  onRefreshNeeded?: () => void;
}

export const ScreeningStatus: React.FC<ScreeningStatusProps> = ({
  projectId,
  stage = 'title',
  onRefreshNeeded,
}) => {
  const [session, setSession] = useState<ScreeningSessionStatus | null>(null);
  const [titleMetrics, setTitleMetrics] = useState<TitleScreeningMetrics | null>(null);
  const [abstractMetrics, setAbstractMetrics] = useState<AbstractScreeningMetrics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [canceling, setCanceling] = useState<boolean>(false);

  const fetchMetricsAndSession = async () => {
    try {
      const [sessionData, titleData, abstractData] = await Promise.all([
        searchFilesService.getScreeningSession(projectId).catch(() => null),
        stage === 'title' ? screeningService.getTitleScreeningMetrics(projectId).catch(() => null) : null,
        stage === 'abstract' ? screeningService.getAbstractScreeningMetrics(projectId).catch(() => null) : null,
      ]);
      if (sessionData) setSession(sessionData);
      if (titleData) setTitleMetrics(titleData);
      if (abstractData) setAbstractMetrics(abstractData);
    } catch (err) {
      console.error('Error cargando métricas PRISMA:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetricsAndSession();
  }, [projectId, stage]);

  const isTaskRunning = Boolean(
    session?.celery_task_id ||
    (session?.status && session.status.startsWith('PROCESSING_')) ||
    (session?.session_status && session.session_status.startsWith('PROCESSING_'))
  );

  const handleCancelScreening = async () => {
    if (!confirm('¿Estás seguro de cancelar el proceso de IA en ejecución? Los artículos en evaluación volverán a estado Pendiente.')) {
      return;
    }
    setCanceling(true);
    try {
      await screeningService.cancelScreening(projectId);
      alert('Proceso de cribado cancelado exitosamente.');
      await fetchMetricsAndSession();
      if (onRefreshNeeded) onRefreshNeeded();
    } catch (err: any) {
      alert('Error al cancelar proceso: ' + (err.response?.data?.detail || err.message));
    } finally {
      setCanceling(false);
    }
  };

  const currentMetrics = stage === 'abstract'
    ? {
        total_unique: abstractMetrics?.total_unique ?? 0,
        included: abstractMetrics?.included_abstract ?? 0,
        excluded: abstractMetrics?.excluded_abstract ?? 0,
        maybe: abstractMetrics?.maybe_abstract ?? 0,
        stageLabel: 'Abstract',
        sourceMetrics: abstractMetrics?.by_database_source?.map((src) => ({
          database_source: src.database_source,
          total_unique: src.total_unique,
          included: src.included_abstract,
          excluded: src.excluded_abstract,
          maybe: src.maybe_abstract,
        })) || [],
      }
    : {
        total_unique: titleMetrics?.total_unique ?? 0,
        included: titleMetrics?.included_title ?? 0,
        excluded: titleMetrics?.excluded_title ?? 0,
        maybe: titleMetrics?.maybe_title ?? 0,
        stageLabel: 'Título',
        sourceMetrics: titleMetrics?.by_database_source?.map((src) => ({
          database_source: src.database_source,
          total_unique: src.total_unique,
          included: src.included_title,
          excluded: src.excluded_title,
          maybe: src.maybe_title,
        })) || [],
      };

  if (loading && !titleMetrics && !abstractMetrics && !session) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-4 animate-pulse flex items-center justify-between text-xs text-slate-400">
        <span>Cargando métricas del proceso PRISMA...</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-3 sm:p-4 shadow-xs space-y-3">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 flex items-center space-x-1.5">
              <span>Estado del Cribado por IA ({currentMetrics.stageLabel})</span>
            </h3>
            <p className="text-[11px] text-slate-500">
              Evaluación automatizada y trazabilidad PRISMA 2020.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 self-end sm:self-auto">
          <span className="badge-green font-mono text-[11px]">
            {session?.status || session?.session_status || 'PRISMA 2020'}
          </span>

          {/* EL BOTÓN SOLO SE MUESTRA SI HAY UNA TAREA DE IA EN EJECUCIÓN */}
          {isTaskRunning && (
            <button
              onClick={handleCancelScreening}
              disabled={canceling}
              className="btn-outline-theme text-[11px] py-1 px-2.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 inline-flex items-center space-x-1"
              title="Cancelar proceso en ejecución y resetear artículos en evaluación"
            >
              {canceling ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <>
                  <AlertOctagon className="w-3.5 h-3.5 text-rose-600" />
                  <span>Cancelar Tarea IA</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* COMPONENTE COMPARTIDO DE TARJETAS DE MÉTRICAS CON DESGLOSE POR BASE */}
      <ScreeningMetricsCards
        total_unique={currentMetrics.total_unique}
        included={currentMetrics.included}
        excluded={currentMetrics.excluded}
        maybe={currentMetrics.maybe}
        stageLabel={currentMetrics.stageLabel}
        by_database_source={currentMetrics.sourceMetrics}
      />
    </div>
  );
};

export default ScreeningStatus;
