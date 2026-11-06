import React, { useState, useEffect } from 'react';
import { healthApi } from '../services/api';
import { CheckCircle2, AlertCircle, RefreshCw, Server, ArrowLeft, Terminal } from 'lucide-react';
import { Link } from 'react-router-dom';

interface HealthCheckResponse {
  message: string;
  docs: string;
  version: string;
}

export const BackendTestView: React.FC = () => {
  const [data, setData] = useState<HealthCheckResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [statusCode, setStatusCode] = useState<number | null>(null);

  const fetchHealthCheck = async () => {
    setLoading(true);
    setError(null);
    const start = performance.now();
    try {
      const response = await healthApi.get<HealthCheckResponse>('');
      const end = performance.now();
      setLatency(Math.round(end - start));
      setStatusCode(response.status);
      setData(response.data);
    } catch (err: any) {
      const end = performance.now();
      setLatency(Math.round(end - start));
      setStatusCode(err.response?.status || 500);
      setError(
        err.message || 'No se pudo conectar con el backend en 127.0.0.1:8003.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealthCheck();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-center items-center p-6 selection:bg-emerald-200 selection:text-emerald-900">
      <div className="max-w-2xl w-full space-y-6 z-10">
        {/* Navigation Header */}
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-emerald-600 text-white font-bold shadow-md shadow-emerald-600/20">
              <Server className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900">
                A-Review <span className="text-emerald-600 font-semibold">| Health Check API</span>
              </h1>
              <p className="text-xs text-slate-500 font-mono">
                Ruta activa: <span className="text-orange-600 font-bold">/test/backend/salduo</span>
              </p>
            </div>
          </div>

          <Link
            to="/projects"
            className="btn-outline-theme flex items-center space-x-2 text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver a Proyectos</span>
          </Link>
        </div>

        {/* Status Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-md space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center space-x-3">
              <span className="text-sm font-bold text-slate-800">Estado Backend (FastAPI)</span>
              {loading ? (
                <span className="badge-orange flex items-center">
                  <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Verificando...
                </span>
              ) : error ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                  <AlertCircle className="w-3 h-3 mr-1" /> Desconectado
                </span>
              ) : (
                <span className="badge-green flex items-center">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> En línea (200 OK)
                </span>
              )}
            </div>

            <button
              onClick={fetchHealthCheck}
              disabled={loading}
              className="btn-green inline-flex items-center space-x-2 text-xs py-1.5 px-3"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Re-probar</span>
            </button>
          </div>

          {/* Details Metadata Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <div className="text-xs text-slate-500 font-medium">Target Proxy</div>
              <div className="text-sm font-mono text-emerald-700 font-bold truncate mt-1">
                127.0.0.1:8003/
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <div className="text-xs text-slate-500 font-medium">Latencia Ping</div>
              <div className="text-sm font-mono text-orange-600 font-bold mt-1">
                {latency !== null ? `${latency} ms` : '--'}
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <div className="text-xs text-slate-500 font-medium">Código HTTP</div>
              <div className="text-sm font-mono text-emerald-700 font-bold mt-1">
                {statusCode !== null ? `${statusCode} ${statusCode === 200 ? 'OK' : ''}` : '--'}
              </div>
            </div>
          </div>

          {/* JSON Payload Viewer */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs text-slate-600 font-mono">
              <span className="flex items-center font-bold">
                <Terminal className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                Respuesta @app.get("/", tags=["Health Check"]):
              </span>
            </div>

            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 font-mono text-xs text-emerald-400 overflow-x-auto shadow-inner">
              {loading ? (
                <div className="text-slate-400 animate-pulse">Cargando respuesta del servidor backend...</div>
              ) : error ? (
                <div className="text-rose-400 font-sans text-xs space-y-1">
                  <div className="font-bold">Error de Conexión:</div>
                  <div>{error}</div>
                  <div className="text-slate-400 text-xs mt-2">
                    Asegúrate de que el backend FastAPI esté corriendo en <code>http://127.0.0.1:8003</code>.
                  </div>
                </div>
              ) : (
                <pre>{JSON.stringify(data, null, 2)}</pre>
              )}
            </div>
          </div>
        </div>

        {/* Stack Badges */}
        <div className="flex flex-wrap gap-2 justify-center text-xs text-slate-500 font-medium">
          <span className="badge-green">React 19 + TypeScript</span>
          <span className="badge-orange">Vite Proxy (port 3000 &rarr; 8003)</span>
          <span className="badge-green">Tailwind CSS (Fondo Blanco)</span>
        </div>
      </div>
    </div>
  );
};
