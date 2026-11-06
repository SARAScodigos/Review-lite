import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  Database,
  ChevronDown,
  ChevronUp,
  Layers
} from 'lucide-react';

export interface GenericSourceMetric {
  database_source: string;
  total_unique: number;
  included: number;
  excluded: number;
  maybe?: number;
}

export interface ScreeningMetricsCardsProps {
  total_unique: number;
  included: number;
  excluded: number;
  maybe?: number;
  stageLabel?: string; // 'Título' o 'Abstract'
  by_database_source?: GenericSourceMetric[];
}

export const ScreeningMetricsCards: React.FC<ScreeningMetricsCardsProps> = ({
  total_unique = 0,
  included = 0,
  excluded = 0,
  maybe = 0,
  stageLabel = 'Título',
  by_database_source = [],
}) => {
  const [showSourceBreakdown, setShowSourceBreakdown] = useState<boolean>(true);

  return (
    <div className="space-y-4">
      {/* TARJETAS PRINCIPALES DE TOTALES */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs">
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-500 flex items-center justify-center space-x-1">
            <Layers className="w-3 h-3 text-slate-400" />
            <span>Total Únicos</span>
          </span>
          <div className="text-xl font-extrabold text-slate-900">{total_unique}</div>
        </div>

        <div className="p-3 bg-emerald-50/80 rounded-xl border border-emerald-200 shadow-2xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-emerald-800 flex items-center justify-center space-x-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Incluidos {stageLabel}</span>
          </span>
          <div className="text-xl font-extrabold text-emerald-900">{included}</div>
        </div>

        <div className="p-3 bg-rose-50/80 rounded-xl border border-rose-200 shadow-2xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-rose-800 flex items-center justify-center space-x-1">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            <span>Excluidos {stageLabel}</span>
          </span>
          <div className="text-xl font-extrabold text-rose-900">{excluded}</div>
        </div>

        <div className="p-3 bg-orange-50/80 rounded-xl border border-orange-200 shadow-2xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-orange-800 flex items-center justify-center space-x-1">
            <HelpCircle className="w-3.5 h-3.5 text-orange-600" />
            <span>En Duda / Maybe</span>
          </span>
          <div className="text-xl font-extrabold text-orange-900">{maybe}</div>
        </div>
      </div>

      {/* SECCIÓN DESGLOSE POR FUENTE BIBLIOGRÁFICA (SCOPUS, WOS, IEEE, ETC.) */}
      {by_database_source && by_database_source.length > 0 && (
        <div className="bg-slate-50/60 rounded-xl border border-slate-200 p-3 text-xs space-y-3">
          <button
            onClick={() => setShowSourceBreakdown(!showSourceBreakdown)}
            className="w-full flex items-center justify-between font-bold text-slate-800 hover:text-emerald-700 transition"
          >
            <div className="flex items-center space-x-1.5">
              <Database className="w-3.5 h-3.5 text-emerald-600" />
              <span>Desglose por Fuente Bibliográfica ({by_database_source.length} fuentes)</span>
            </div>
            {showSourceBreakdown ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {showSourceBreakdown && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
              {by_database_source.map((src, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-lg p-2.5 border border-slate-200 shadow-2xs space-y-1.5"
                >
                  <div className="flex justify-between items-center pb-1 border-b border-slate-100">
                    <span className="badge-green font-bold text-[10px]">
                      {src.database_source || 'Sin Fuente'}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      <strong>{src.total_unique}</strong> únicos
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1 text-[11px] font-medium text-center pt-0.5">
                    <div className="bg-emerald-50 text-emerald-800 py-0.5 px-1 rounded-md border border-emerald-100">
                      <span className="block text-[9px] uppercase font-bold text-emerald-600">Inc.</span>
                      <strong>{src.included}</strong>
                    </div>

                    <div className="bg-rose-50 text-rose-800 py-0.5 px-1 rounded-md border border-rose-100">
                      <span className="block text-[9px] uppercase font-bold text-rose-600">Exc.</span>
                      <strong>{src.excluded}</strong>
                    </div>

                    <div className="bg-orange-50 text-orange-800 py-0.5 px-1 rounded-md border border-orange-100">
                      <span className="block text-[9px] uppercase font-bold text-orange-600">Duda</span>
                      <strong>{src.maybe ?? 0}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ScreeningMetricsCards;
