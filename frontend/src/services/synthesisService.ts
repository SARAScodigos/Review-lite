import { api } from './api';

export type StatusWriting =
  | 'PENDING'
  | 'SELECTING_IDS'
  | 'TRIMER_COLUMNS'
  | 'WRITING_BY_AI'
  | 'COMPLETED'
  | 'ERROR';

export type SynthesisSectionType =
  | 'INTRODUCTION'
  | 'THEORETICAL_FRAMEWORK'
  | 'RESULTS_OBJECTIVE'
  | 'METHODOLOGY_PRISMA'
  | 'DISCUSSION'
  | 'CONCLUSIONS';

export interface CandidateArticleInfo {
  article_id: string;
  title: string;
}

export interface SynthesisSectionItem {
  id: string;
  project_id: string;
  section_type: SynthesisSectionType;
  section_title: string;
  objective_key?: string | null;
  objective_title?: string | null;
  objective_description?: string | null;
  status: StatusWriting;
  candidate_article_ids: string[];
  candidate_articles?: CandidateArticleInfo[] | null;
  selection_justifications: Record<string, string>;
  trimmed_columns_used: string[];
  generated_table?: Record<string, any>[] | null;
  generated_draft?: string | null;
  custom_instructions?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SynthesisTaskResponse {
  task_id: string;
  section_id: string;
  status: string;
  message: string;
}

export interface StartSynthesisTaskPayload {
  objective_code?: string;
  selected_custom_columns?: string[];
  user_chosen_columns?: string[];
  provider?: string;
  model?: string;
  temperature?: number;
  custom_prompt?: string;
  force?: boolean;
}

export const synthesisService = {
  // 1. Obtener todas las secciones de síntesis del proyecto (GET /synthesis/sections)
  async getSections(projectId: string): Promise<SynthesisSectionItem[]> {
    const response = await api.get<SynthesisSectionItem[]>(`/projects/${projectId}/synthesis/sections`);
    return response.data;
  },

  // 1.5. Obtener artículos con matriz de extracción disponibles (GET /synthesis/available-matrix-articles)
  async getAvailableMatrixArticles(projectId: string): Promise<CandidateArticleInfo[]> {
    const response = await api.get<CandidateArticleInfo[]>(`/projects/${projectId}/synthesis/available-matrix-articles`);
    return response.data;
  },

  // 2. Crear o sobrescribir una sección (POST /synthesis/sections)
  async createOrOverwriteSection(
    projectId: string,
    payload: {
      section_type: SynthesisSectionType;
      objective_title?: string;
      objective_description?: string;
      order_index?: number;
    }
  ): Promise<SynthesisSectionItem> {
    const response = await api.post<SynthesisSectionItem>(`/projects/${projectId}/synthesis/sections`, payload);
    return response.data;
  },

  // 3. Obtener detalle de una sección específica (GET /synthesis/sections/{section_id})
  async getSectionDetail(projectId: string, sectionId: string): Promise<SynthesisSectionItem> {
    const response = await api.get<SynthesisSectionItem>(`/projects/${projectId}/synthesis/sections/${sectionId}`);
    return response.data;
  },

  // 4. Actualizar datos de una sección (PUT /synthesis/sections/{section_id})
  async updateSection(
    projectId: string,
    sectionId: string,
    payload: {
      candidate_article_ids?: string[];
      selection_justifications?: Record<string, string>;
      trimmed_columns_used?: string[];
      generated_table?: Record<string, any>[];
      generated_draft?: string;
      custom_instructions?: string;
      status?: StatusWriting;
    }
  ): Promise<SynthesisSectionItem> {
    const response = await api.put<SynthesisSectionItem>(
      `/projects/${projectId}/synthesis/sections/${sectionId}`,
      payload
    );
    return response.data;
  },

  // 5. Eliminar sección (DELETE /synthesis/sections/{section_id})
  async deleteSection(projectId: string, sectionId: string): Promise<{ deleted: boolean }> {
    const response = await api.delete<{ deleted: boolean }>(
      `/projects/${projectId}/synthesis/sections/${sectionId}`
    );
    return response.data;
  },

  // 6. Evaluar Elegibilidad de Artículos (Fase 1) (POST /synthesis/sections/{section_id}/evaluate-eligibility)
  async evaluateEligibility(
    projectId: string,
    sectionId: string,
    payload: StartSynthesisTaskPayload = {}
  ): Promise<SynthesisTaskResponse> {
    const response = await api.post<SynthesisTaskResponse>(
      `/projects/${projectId}/synthesis/sections/${sectionId}/evaluate-eligibility`,
      payload
    );
    return response.data;
  },

  // 6.5. Identificar IDs Candidatos (POST /synthesis/sections/{section_id}/identify-ids)
  async identifyIds(
    projectId: string,
    sectionId: string,
    payload: StartSynthesisTaskPayload = {}
  ): Promise<SynthesisTaskResponse> {
    const response = await api.post<SynthesisTaskResponse>(
      `/projects/${projectId}/synthesis/sections/${sectionId}/identify-ids`,
      payload
    );
    return response.data;
  },

  // 7. Generar Tabla Sintética Comparativa JSONB (POST /synthesis/sections/{section_id}/generate-table)
  async generateTable(
    projectId: string,
    sectionId: string,
    payload: StartSynthesisTaskPayload = {}
  ): Promise<SynthesisTaskResponse> {
    const response = await api.post<SynthesisTaskResponse>(
      `/projects/${projectId}/synthesis/sections/${sectionId}/generate-table`,
      payload
    );
    return response.data;
  },

  // 8. Generar Redacción en Markdown (POST /synthesis/sections/{section_id}/generate-draft)
  async generateDraft(
    projectId: string,
    sectionId: string,
    payload: StartSynthesisTaskPayload = {}
  ): Promise<SynthesisTaskResponse> {
    const response = await api.post<SynthesisTaskResponse>(
      `/projects/${projectId}/synthesis/sections/${sectionId}/generate-draft`,
      payload
    );
    return response.data;
  },

  // 9. Consultar Estado de Tarea Celery (GET /synthesis/tasks/{task_id}/status)
  async getTaskStatus(
    projectId: string,
    taskId: string
  ): Promise<{ task_id: string; status: string; result?: unknown; error?: string }> {
    const response = await api.get(`/projects/${projectId}/synthesis/tasks/${taskId}/status`);
    return response.data;
  },
};

export default synthesisService;
