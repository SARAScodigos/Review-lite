import { api } from './api';

export interface SearchResultFile {
  id: string;
  project_id: string;
  nombre?: string | null;
  file_path: string;
  database_source: string;
  search_equation?: string | null;
  notes?: string | null;
  total_records?: number | null;
  file_type: string;
  created_at: string;
  updated_at: string;
}

export interface ExtractedRecord {
  id: string;
  file_id: string;
  title: string;
  authors?: string | null;
  publication_year?: number | null;
  doi?: string | null;
  source_title?: string | null;
  abstract?: string | null;
  raw_data?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface PaginatedExtractedRecordsResponse {
  total: number;
  skip: number;
  limit: number;
  items: ExtractedRecord[];
}

export interface CeleryTaskResponse {
  task_id: string;
  file_id?: string;
  status: 'PENDING' | 'STARTED' | 'SUCCESS' | 'FAILURE';
  message?: string;
  result?: {
    status: string;
    file_id?: string;
    extracted_records_count?: number;
  };
}

export interface ScreeningSessionStatus {
  status?: string;
  session_status?: string;
  celery_task_id?: string | null;
  total_initial_records: number;
  duplicate_records_count: number;
  unique_records_count: number;
  title_included_count?: number;
  title_excluded_count?: number;
  abstract_included_count?: number;
  abstract_excluded_count?: number;
  fulltext_included_count?: number;
  fulltext_excluded_count?: number;
}

export interface PendingDuplicateClusterRecord {
  id: string;
  title: string;
  doi?: string | null;
  authors?: string | null;
  publication_year?: number | null;
  journal?: string | null;
  abstract?: string | null;
  file_id: string;
  file_name?: string | null;
  database_source: string;
}

export interface PendingDuplicateCluster {
  cluster_id: string;
  similarity_percentage?: number;
  records: PendingDuplicateClusterRecord[];
}

export interface DatabaseSourceSummary {
  database_source: string;
  total_records: number;
  unique_records: number;
  duplicate_records: number;
  pending_review_records: number;
}

export interface DeduplicationSummaryResponse {
  project_id: string;
  session_status: string;
  total_records: number;
  unique_records: number;
  duplicate_records: number;
  pending_review_records: number;
  by_database_source: DatabaseSourceSummary[];
}

export interface UniqueRecordItem {
  record_id: string;
  file_id?: string;
  database_source: string;
  id_article?: string;
  title: string;
  authors?: string | null;
  publication_year?: number | null;
  doi?: string | null;
  source_title?: string | null;
  abstract?: string | null;
}

export interface PaginatedUniqueRecordsResponse {
  items: UniqueRecordItem[];
  total: number;
  skip: number;
  limit: number;
  returned: number;
  has_next: boolean;
  has_previous: boolean;
}

export const searchFilesService = {
  // 1. Obtener archivos de búsqueda de un proyecto
  async getSearchFiles(projectId: string): Promise<SearchResultFile[]> {
    const response = await api.get<SearchResultFile[]>(`/projects/${projectId}/search-files/`);
    return response.data;
  },

  // 2. Subir archivo de búsqueda (multipart/form-data)
  async uploadSearchFile(projectId: string, formData: FormData): Promise<SearchResultFile> {
    const response = await api.post<SearchResultFile>(
      `/projects/${projectId}/search-files/`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },

  // 3. Eliminar archivo de búsqueda
  async deleteSearchFile(fileId: string): Promise<void> {
    await api.delete(`/search-files/${fileId}`);
  },

  // 4. Disparar extracción asíncrona Celery
  async triggerExtraction(fileId: string): Promise<CeleryTaskResponse> {
    const response = await api.post<CeleryTaskResponse>(`/search-files/${fileId}/extract/`);
    return response.data;
  },

  // 5. Consultar estado de la tarea Celery
  async getTaskStatus(taskId: string): Promise<CeleryTaskResponse> {
    const response = await api.get<CeleryTaskResponse>(`/tasks/${taskId}/status`);
    return response.data;
  },

  // 6. Consultar registros extraídos de un archivo (PaginatedExtractedRecordsResponse)
  async getExtractedRecords(
    fileId: string,
    skip: number = 0,
    limit: number = 50
  ): Promise<PaginatedExtractedRecordsResponse> {
    const response = await api.get<any>(`/search-files/${fileId}/records/`, {
      params: { skip, limit },
    });
    if (response.data && Array.isArray(response.data.items)) {
      return response.data;
    }
    if (Array.isArray(response.data)) {
      return {
        total: response.data.length,
        skip: 0,
        limit: response.data.length,
        items: response.data,
      };
    }
    return { total: 0, skip: 0, limit, items: [] };
  },

  // 7. Consultar estado de sesión PRISMA y desduplicación
  async getScreeningSession(projectId: string): Promise<ScreeningSessionStatus> {
    const response = await api.get<ScreeningSessionStatus>(`/projects/${projectId}/screening/session`);
    return response.data;
  },

  // 8. Disparar desduplicación asíncrona
  async triggerDeduplication(projectId: string, forceRerun: boolean = false): Promise<any> {
    const response = await api.post(`/projects/${projectId}/screening/deduplicate`, {
      force_rerun: forceRerun,
    });
    return response.data;
  },

  // 9. Obtener clusters duplicados pendientes de revisión humana
  async getPendingDuplicates(projectId: string): Promise<PendingDuplicateCluster[]> {
    const response = await api.get<PendingDuplicateCluster[]>(`/projects/${projectId}/screening/duplicates/pending`);
    return response.data;
  },

  // 10. Resolver un cluster manual elegiendo registro maestro
  async resolveDuplicateCluster(
    projectId: string,
    payload: {
      cluster_id: string;
      selected_master_record_id: string;
      action?: 'CONFIRM_DUPLICATES' | 'IGNORE';
    }
  ): Promise<any> {
    const response = await api.post(`/projects/${projectId}/screening/resolve-cluster`, {
      action: 'CONFIRM_DUPLICATES',
      ...payload,
    });
    return response.data;
  },

  // 11. Obtener URL de descarga del Excel de registros únicos
  getExportUniqueExcelUrl(projectId: string): string {
    return `/api/v1/projects/${projectId}/screening/export/unique-excel`;
  },

  // 12. Obtener resumen de desduplicación desglojado por fuente bibliográfica (database_source)
  async getDeduplicationSummaryBySource(projectId: string): Promise<DeduplicationSummaryResponse> {
    const response = await api.get<DeduplicationSummaryResponse>(
      `/projects/${projectId}/screening/duplicates/summary`
    );
    return response.data;
  },

  // 13. Obtener registros únicos paginados (GET /screening/duplicates/unique-records)
  async getUniqueRecords(
    projectId: string,
    skip: number = 0,
    limit: number = 100
  ): Promise<PaginatedUniqueRecordsResponse> {
    const response = await api.get<PaginatedUniqueRecordsResponse>(
      `/projects/${projectId}/screening/duplicates/unique-records`,
      {
        params: { skip, limit },
      }
    );
    return response.data;
  },
};
