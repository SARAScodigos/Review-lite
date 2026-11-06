import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Menu, Layers } from 'lucide-react';

interface MainLayoutProps {
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const [isMobileOpen, setIsMobileOpen] = useState<boolean>(false);

  return (
    <div className="system-background flex min-h-screen text-slate-900 font-sans">
      {/* Sidebar (Desktop estático, Móvil desplegable) */}
      <Sidebar
        isOpenMobile={isMobileOpen}
        onCloseMobile={() => setIsMobileOpen(false)}
      />

      {/* Área Principal */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header superior móvil con botón hamburguesa */}
        <header className="md:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-xs">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsMobileOpen(true)}
              className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition"
              aria-label="Abrir menú"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-emerald-600 text-white font-bold">
                <Layers className="w-4 h-4" />
              </div>
              <span className="text-sm font-extrabold text-slate-900">A-Review</span>
            </div>
          </div>
        </header>

        {/* Contenido de la vista */}
        <main className="system-content flex-1 min-w-0 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
};
