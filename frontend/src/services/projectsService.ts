import { api } from './api';
import type { RSLProject, RSLProjectCreate, RSLProjectUpdate } from '../types/project';

export const projectsService = {
  // Obtener lista paginada de proyectos RSL
  async getProjects(skip: number = 0, limit: number = 100): Promise<RSLProject[]> {
    const response = await api.get<RSLProject[]>('/projects/', {
      params: { skip, limit },
    });
    return response.data;
  },

  // Obtener detalle de un proyecto por UUID
  async getProjectById(id: string): Promise<RSLProject> {
    const response = await api.get<RSLProject>(`/projects/${id}`);
    return response.data;
  },

  // Crear un nuevo proyecto RSL
  async createProject(data: RSLProjectCreate): Promise<RSLProject> {
    const response = await api.post<RSLProject>('/projects/', data);
    return response.data;
  },

  // Actualizar un proyecto RSL (PATCH)
  async updateProject(id: string, data: RSLProjectUpdate): Promise<RSLProject> {
    const response = await api.patch<RSLProject>(`/projects/${id}`, data);
    return response.data;
  },

  // Eliminar un proyecto RSL
  async deleteProject(id: string): Promise<void> {
    await api.delete(`/projects/${id}`);
  },
};
