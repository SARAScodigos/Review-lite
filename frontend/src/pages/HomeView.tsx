import React from 'react';
import { Link } from 'react-router-dom';
import { Activity, Layers, CheckCircle2, ArrowRight, Server, BookOpen } from 'lucide-react';

export const HomeView: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-center items-center p-6 relative selection:bg-emerald-200 selection:text-emerald-900">
      <div className="max-w-3xl w-full text-center space-y-8 z-10">
        <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-bold tracking-wide">
          <Layers className="w-3.5 h-3.5 text-emerald-700" />
          <span>SISTEMA A-REVIEW</span>
        </div>

        <div className="space-y-4">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 leading-tight">
            Frontend A-Review
          </h1>
          <p className="text-slate-600 max-w-xl mx-auto text-sm md:text-base leading-relaxed">
            Plataforma web para la automatización, gestión y ejecución de Revisiones Sistemáticas de la Literatura.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to="/projects"
            className="w-full sm:w-auto btn-green inline-flex items-center justify-center space-x-2 px-6 py-3 text-sm shadow-md"
          >
            <BookOpen className="w-4 h-4" />
            <span>Ir a Módulo de Proyectos RSL</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </Link>

          <Link
            to="/test/backend/salduo"
            className="w-full sm:w-auto btn-orange inline-flex items-center justify-center space-x-2 px-6 py-3 text-sm shadow-md"
          >
            <Activity className="w-4 h-4" />
            <span>Estado API Backend (/test/backend/salduo)</span>
          </Link>
        </div>

        {/* Stack Status Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-8 border-t border-slate-200 text-left">
          <div className="stat-card-green p-4 rounded-xl space-y-1">
            <div className="flex items-center space-x-2 text-emerald-800 font-bold text-sm">
              <Server className="w-4 h-4 text-emerald-700" />
              <span>Backend API</span>
            </div>
            <p className="text-xs text-slate-600">FastAPI & PostgreSQL en 127.0.0.1:8008</p>
          </div>

          <div className="stat-card-orange p-4 rounded-xl space-y-1">
            <div className="flex items-center space-x-2 text-orange-800 font-bold text-sm">
              <Layers className="w-4 h-4 text-orange-700" />
              <span>Frontend Core</span>
            </div>
            <p className="text-xs text-slate-600">React 19 + TypeScript + Vite + Tailwind</p>
          </div>

          <div className="stat-card-white p-4 rounded-xl space-y-1">
            <div className="flex items-center space-x-2 text-slate-800 font-bold text-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Tema de Colores</span>
            </div>
            <p className="text-xs text-slate-600">Azul dominante con acentos naranja y amarillo</p>
          </div>
        </div>
      </div>
    </div>
  );
};
