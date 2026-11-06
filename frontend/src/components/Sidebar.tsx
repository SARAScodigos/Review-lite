import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { BookOpen, Users, LogOut, X, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface SidebarProps {
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpenMobile = false, onCloseMobile }) => {
  const { username, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('reviewflow.sidebar.collapsed') === 'true'; }
    catch { return false; }
  });
  const toggleSidebar = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem('reviewflow.sidebar.collapsed', String(next)); }
    catch { /* Keep the toggle working when storage is unavailable. */ }
  };
  const initials = (username || '').trim().split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'U';
  const labelClass = collapsed ? 'md:hidden' : '';
  const handleLogout = () => {
    onCloseMobile?.();
    logout();
  };

  return (
    <>
      {isOpenMobile && <div onClick={onCloseMobile} className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs md:hidden" />}
      <aside
        aria-label="Menú principal"
        className={`fixed md:sticky md:h-screen top-0 left-0 bottom-0 z-50 w-64 ${collapsed ? 'md:w-24 md:p-3' : 'md:w-64'} bg-white border-r border-slate-200 flex flex-col justify-between gap-4 overflow-y-auto p-4 shadow-sm transition-[width,transform,padding] duration-200 motion-reduce:transition-none flex-shrink-0 ${isOpenMobile ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        <div className="space-y-5">
          <div className={`flex items-center justify-between gap-2 px-1 py-1 ${collapsed ? 'md:px-0' : ''}`}>
            <h1 className="min-w-0 flex-1">
              <img src="/branding/LOGO.png" alt="A-Review" className={`h-auto max-h-16 w-full max-w-48 object-contain object-left ${labelClass}`} />
              {collapsed && <img src="/branding/ICONO.png" alt="A-Review" className="hidden md:block h-8 w-8 mx-auto object-contain" />}
            </h1>
            <button
            type="button"
            onClick={toggleSidebar}
            aria-label={collapsed ? 'Ampliar barra lateral' : 'Minimizar barra lateral'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Ampliar barra lateral' : 'Minimizar barra lateral'}
            className="hidden md:flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4 shrink-0" /> : <PanelLeftClose className="h-4 w-4 shrink-0" />}
          </button>
            {onCloseMobile && (
              <button type="button" onClick={onCloseMobile} aria-label="Cerrar menú" className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 md:hidden">
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          <nav aria-label="Navegación principal" className="space-y-1">
            <div className={`px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 ${labelClass}`}>Navegación principal</div>
            {[
              { to: '/projects', label: 'Proyectos', Icon: BookOpen },
              { to: '/authors', label: 'Autores', Icon: Users },
            ].map(({ to, label, Icon }) => (
              <NavLink key={to} to={to} onClick={onCloseMobile} aria-label={label} title={collapsed ? label : undefined}
                className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${collapsed ? 'md:justify-center md:px-0' : ''} ${isActive ? 'bg-emerald-50 text-emerald-800 border-emerald-200 shadow-xs' : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
              >
                <Icon className="w-4 h-4 shrink-0 text-emerald-600" />
                <span className={labelClass}>{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="space-y-2 border-t border-slate-200 pt-4">
          <div title={collapsed ? `${username} · Sesión activa` : undefined} className={`flex items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50/70 px-2.5 py-2.5 ${collapsed ? 'md:justify-center md:px-0' : ''}`}>
            <div aria-hidden="true" className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200/60">
              {initials}
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
            </div>
            <div className={`min-w-0 ${collapsed ? 'md:sr-only' : ''}`}>
              <p className="truncate text-xs font-semibold leading-5 text-slate-800">{username}</p>
              <p className="text-[10px] leading-4 text-slate-500">Sesión activa</p>
            </div>
          </div>
          <button type="button" onClick={handleLogout} aria-label="Cerrar sesión" title="Cerrar sesión"
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${collapsed ? 'md:justify-center md:px-0' : ''}`}>
            <LogOut className="h-4 w-4 shrink-0" />
            <span className={labelClass}>Cerrar sesión</span>
          </button>
        </div>
      </aside>
    </>
  );
};
