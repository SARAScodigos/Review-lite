import { api } from './api';

export type ExtractionSourceType = 'AI_GENERATED' | 'USER_IMPORTED' | 'MANUAL_SCREENING';
export type ExtractionReviewStatus = 'DRAFT' | 'CONFIRMED' | 'REJECTED';

export interface ExtractedMatrixRowItem {
  id: string;
  project_id: string;
  record_id?: string | null;
  source_type: ExtractionSourceType;
  article_custom_id?: string | null;
  extraction_data: Record<string, any>;
  confidence_score?: string | null;
  review_status: ExtractionReviewStatus;
  created_at: string;
  updated_at: string;
}

export interface PaginatedMatrixRowsResponse {
  items: ExtractedMatrixRowItem[];
  total: number;
  skip: number;
  limit: number;
  returned: number;
  has_next: boolean;
  has_previous: boolean;
}

export interface MatrixWorkbenchCandidateItem {
  position: number;
  record_id: string;
  file_id: string;
  database_source: string;
  article_custom_id: string;
  title?: string | null;
  authors?: string | null;
  publication_year?: number | null;
  doi?: string | null;
  title_status: string;
  abstract_status: string;
  fulltext_status: string;
  fulltext_reason?: string | null;
  pdf_download_status?: string | null;
  pdf_file_path?: string | null;
  matrix_row_id?: string | null;
  matrix_review_status?: ExtractionReviewStatus | null;
  can_extract: boolean;
}

export interface PaginatedMatrixWorkbenchResponse {
  items: MatrixWorkbenchCandidateItem[];
  total: number;
  skip: number;
  limit: number;
  returned: number;
  has_next: boolean;
  has_previous: boolean;
}

export interface MatrixWorkbenchMetrics {
  total_candidates: number;
  with_pdf: number;
  without_pdf: number;
  extracted_rows: number;
  draft_rows: number;
  confirmed_rows: number;
  fulltext_included: number;
  fulltext_excluded: number;
  fulltext_pending: number;
}

export interface StartMatrixExtractionPayload {
  provider?: string;
  model?: string;
  temperature?: number;
}

export interface MatrixExtractionTaskResponse {
  task_id: string;
  project_id?: string;
  status: string;
  message: string;
}

export const matrixService = {
  // 1. Iniciar extracción masiva con Celery (POST /matrix/extract-all)
  async extractAllPdfs(
    projectId: string,
    payload: StartMatrixExtractionPayload = {}
  ): Promise<{ task_id: string; status: string; message: string }> {
    const response = await api.post(`/projects/${projectId}/matrix/extract-all`, payload);
    return response.data;
  },

  // 2. Extraer fila individual a demanda (POST /matrix/records/{record_id}/extract)
  async extractSingleRecord(
    projectId: string,
    recordId: string,
    payload: StartMatrixExtractionPayload = {}
  ): Promise<MatrixExtractionTaskResponse> {
    const response = await api.post<MatrixExtractionTaskResponse>(
      `/projects/${projectId}/matrix/records/${recordId}/extract`,
      payload
    );
    return response.data;
  },

  async getMatrixExtractionTaskStatus(
    projectId: string,
    taskId: string
  ): Promise<{ task_id: string; status: string; result?: unknown }> {
    const response = await api.get(`/projects/${projectId}/matrix/tasks/${taskId}/status`);
    return response.data;
  },

  // 3. Obtener todas las filas de la matriz
  async getMatrixRows(projectId: string): Promise<ExtractedMatrixRowItem[]> {
    const response = await api.get<ExtractedMatrixRowItem[]>(`/projects/${projectId}/matrix/rows`);
    return response.data;
  },

  // 4. Obtener filas paginadas de la matriz (GET /matrix/rows/paginated)
  async getPaginatedMatrixRows(
    projectId: string,
    skip: number = 0,
    limit: number = 100
  ): Promise<PaginatedMatrixRowsResponse> {
    const response = await api.get<PaginatedMatrixRowsResponse>(`/projects/${projectId}/matrix/rows/paginated`, {
      params: { skip, limit },
    });
    return response.data;
  },

  // 5. Obtener mesa de control paginada (Workbench GET /matrix/workbench)
  async getWorkbenchCandidates(
    projectId: string,
    skip: number = 0,
    limit: number = 100
  ): Promise<PaginatedMatrixWorkbenchResponse> {
    const response = await api.get<PaginatedMatrixWorkbenchResponse>(`/projects/${projectId}/matrix/workbench`, {
      params: { skip, limit },
    });
    return response.data;
  },

  // 6. Obtener métricas agregadas del workbench (GET /matrix/metrics)
  async getMatrixMetrics(projectId: string): Promise<MatrixWorkbenchMetrics> {
    const response = await api.get<MatrixWorkbenchMetrics>(`/projects/${projectId}/matrix/metrics`);
    return response.data;
  },

  // 7. Crear fila manual desacoplada (POST /matrix/rows)
  async createManualRow(
    projectId: string,
    payload: { article_custom_id?: string; extraction_data: Record<string, any>; review_status?: ExtractionReviewStatus }
  ): Promise<ExtractedMatrixRowItem> {
    const response = await api.post<ExtractedMatrixRowItem>(`/projects/${projectId}/matrix/rows`, payload);
    return response.data;
  },

  // 8. Reemplazar fila JSONB completa (PUT /matrix/rows/{row_id})
  async updateMatrixRow(
    projectId: string,
    rowId: string,
    payload: { extraction_data: Record<string, any>; review_status?: ExtractionReviewStatus }
  ): Promise<ExtractedMatrixRowItem> {
    const response = await api.put<ExtractedMatrixRowItem>(`/projects/${projectId}/matrix/rows/${rowId}`, payload);
    return response.data;
  },

  // 9. Modificación parcial de celdas (PATCH /matrix/rows/{row_id})
  async patchMatrixRow(
    projectId: string,
    rowId: string,
    payload: { extraction_data_patch: Record<string, any>; review_status?: ExtractionReviewStatus }
  ): Promise<ExtractedMatrixRowItem> {
    const response = await api.patch<ExtractedMatrixRowItem>(`/projects/${projectId}/matrix/rows/${rowId}`, payload);
    return response.data;
  },

  // 10. Eliminar fila de la matriz (DELETE /matrix/rows/{row_id})
  async deleteMatrixRow(projectId: string, rowId: string): Promise<{ row_id: string; deleted: boolean }> {
    const response = await api.delete<{ row_id: string; deleted: boolean }>(`/projects/${projectId}/matrix/rows/${rowId}`);
    return response.data;
  },

  // 11. Obtener URL para descargar plantilla limpia Excel (.xlsx)
  getExcelTemplateUrl(projectId: string): string {
    const baseUrl = api.defaults.baseURL || '/api/v1';
    return `${baseUrl}/projects/${projectId}/matrix/template/excel`;
  },

  // 11b. Obtener URL para exportar matriz real llena en Excel (.xlsx) (GET /export/excel)
  getExportExcelUrl(projectId: string): string {
    const baseUrl = api.defaults.baseURL || '/api/v1';
    return `${baseUrl}/projects/${projectId}/matrix/export/excel`;
  },

  // 12. Importación masiva desde Excel / CSV (POST /matrix/import-excel)
  async importMatrixExcel(projectId: string, file: File): Promise<ExtractedMatrixRowItem[]> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post<ExtractedMatrixRowItem[]>(
      `/projects/${projectId}/matrix/import-excel`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },

  // 13. Confirmación Humana de Texto Completo (POST /matrix/confirm-fulltext)
  async confirmFulltextDecision(
    projectId: string,
    recordId: string,
    finalStatus: 'INCLUDED' | 'EXCLUDED',
    decisionReason?: string
  ): Promise<any> {
    const response = await api.post(`/projects/${projectId}/matrix/confirm-fulltext`, {
      record_id: recordId,
      final_status: finalStatus,
      decision_reason: decisionReason || null,
    });
    return response.data;
  },

  // 14. Columnas Personalizadas de la Matriz (CRUD /matrix/columns)
  async getMatrixColumns(projectId: string): Promise<MatrixColumnItem[]> {
    const response = await api.get<MatrixColumnItem[]>(`/projects/${projectId}/matrix/columns`);
    return response.data;
  },

  async createMatrixColumn(projectId: string, name: string): Promise<MatrixColumnItem> {
    const response = await api.post<MatrixColumnItem>(`/projects/${projectId}/matrix/columns`, { name });
    return response.data;
  },

  async updateMatrixColumn(
    projectId: string,
    columnId: string,
    payload: { name?: string; position?: number }
  ): Promise<MatrixColumnItem> {
    const response = await api.patch<MatrixColumnItem>(`/projects/${projectId}/matrix/columns/${columnId}`, payload);
    return response.data;
  },

  async toggleColumnAiInclusion(
    projectId: string,
    name: string,
    includeInAi: boolean
  ): Promise<MatrixColumnItem> {
    const response = await api.patch<MatrixColumnItem>(`/projects/${projectId}/matrix/columns/ai-inclusion`, {
      name,
      include_in_ai: includeInAi,
    });
    return response.data;
  },

  async deleteMatrixColumn(projectId: string, columnId: string): Promise<void> {
    await api.delete(`/projects/${projectId}/matrix/columns/${columnId}`);
  },
};

export interface MatrixColumnItem {
  id?: string | null;
  project_id?: string;
  name: string;
  position: number;
  is_predefined?: boolean;
  is_ai_extractable?: boolean;
  include_in_ai?: boolean;
}

export default matrixService;
