import { api } from './api';

export type ExportStatus = 'PENDING' | 'GENERATING' | 'COMPLETED' | 'ERROR';

export interface ExportVersion {
  id: string;
  project_id: string;
  version_number: number;
  version_label: string;
  file_name: string;
  file_size_bytes?: number | null;
  sha256_checksum?: string | null;
  export_status: ExportStatus;
  error_message?: string | null;
  created_at: string;
}

export interface QueuedExport {
  task_id: string;
  project_id: string;
  version_id: string;
  status: string;
  message: string;
}

export const exportsService = {
  async generateManuscript(projectId: string): Promise<QueuedExport> {
    const response = await api.post<QueuedExport>(`/projects/${projectId}/exports/generate`);
    return response.data;
  },

  async listVersions(projectId: string): Promise<ExportVersion[]> {
    const response = await api.get<ExportVersion[]>(`/projects/${projectId}/exports`);
    return response.data;
  },

  async getTaskStatus(projectId: string, taskId: string): Promise<{ status: string; result?: unknown; error?: string }> {
    const response = await api.get(`/projects/${projectId}/exports/tasks/${taskId}/status`);
    return response.data;
  },

  deleteVersion(projectId: string, versionId: string): Promise<void> {
    return api.delete(`/projects/${projectId}/exports/${versionId}`);
  },

  getDownloadUrl(projectId: string, versionId: string): string {
    return `${api.defaults.baseURL || '/api/v1'}/projects/${projectId}/exports/${versionId}/download`;
  },

  getPrismaUrl(projectId: string, format: 'pdf' | 'svg'): string {
    return `${api.defaults.baseURL || '/api/v1'}/projects/${projectId}/exports/prisma.${format}`;
  },
};
