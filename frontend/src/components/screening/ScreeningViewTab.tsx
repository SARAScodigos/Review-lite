import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Filter, FileText } from 'lucide-react';
import type { RSLProject } from '../../types/project';
import { ScreeningStatus } from './ScreeningStatus';
import { ScreeningTitleTab } from './ScreeningTitleTab';
import { ScreeningAbstractTab } from './ScreeningAbstractTab';

interface ScreeningViewTabProps {
  project: RSLProject;
}

type ScreeningSubTab = 'title' | 'abstract';

export const ScreeningViewTab: React.FC<ScreeningViewTabProps> = ({ project }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [refreshKey, setRefreshKey] = useState<number>(0);

  const subTabFromUrl = searchParams.get('subtab') as ScreeningSubTab | null;
  const subTab: ScreeningSubTab = subTabFromUrl === 'abstract' ? 'abstract' : 'title';

  const setSubTab = (newSubTab: ScreeningSubTab) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('tab', 'cribado');
    newParams.set('subtab', newSubTab);
    setSearchParams(newParams);
  };

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="space-y-3">
      {/* HEADER Y ESTADO DE SESIÓN PRISMA (MÉTRICAS SEGÚN FASE: TÍTULO O ABSTRACT) */}
      <ScreeningStatus projectId={project.id} stage={subTab} onRefreshNeeded={handleRefresh} />

      {/* NAVEGACIÓN ENTRE FASES DE CRIBADO (SUB-TABS) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-xs">
        <div className="flex items-center space-x-2 border-b border-slate-100 pb-2">
          <button
            onClick={() => setSubTab('title')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              subTab === 'title'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Filter className="w-4 h-4" />
            <span>Fase 1: Cribado por Título</span>
          </button>

          <button
            onClick={() => setSubTab('abstract')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              subTab === 'abstract'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Fase 2: Cribado por Resumen (Abstract)</span>
          </button>
        </div>

        {/* CONTENIDO DE LA SUB-TAB SELECCIONADA */}
        <div className="pt-4">
          {subTab === 'title' && <ScreeningTitleTab key={`title-${refreshKey}`} projectId={project.id} />}
          {subTab === 'abstract' && <ScreeningAbstractTab key={`abstract-${refreshKey}`} projectId={project.id} />}
        </div>
      </div>
    </div>
  );
};

export default ScreeningViewTab;
