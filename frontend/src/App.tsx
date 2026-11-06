import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { BackendTestView } from './pages/BackendTestView';
import { ProjectsView } from './pages/ProjectsView';
import { ProjectManageView } from './pages/ProjectManageView';
import { AuthorsView } from './pages/AuthorsView';
import { LoginView } from './pages/LoginView';
import { MainLayout } from './components/MainLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthProvider';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginView />} />

          {/* Redirección por defecto de la raíz '/' a '/projects' */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Navigate to="/projects" replace />
              </ProtectedRoute>
            }
          />

          {/* Rutas con Sidebar Layout (Proyectos y Autores) */}
          <Route
            path="/projects"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <ProjectsView />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/:id"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <ProjectManageView />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/authors"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <AuthorsView />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          {/* Health Check API Test View */}
          <Route
            path="/test/backend/salduo"
            element={
              <ProtectedRoute>
                <BackendTestView />
              </ProtectedRoute>
            }
          />
          <Route path="/test/backend/saludo" element={<Navigate to="/test/backend/salduo" replace />} />

          {/* Redirección por defecto para cualquier otra ruta desconocida */}
          <Route path="*" element={<Navigate to="/projects" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
