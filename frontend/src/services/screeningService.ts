import { api } from './api';

export interface TitleScreeningRecord {
  record_id: string;
  file_id?: string;
  database_source: string;
  id_article?: string;
  title: string;
  authors?: string | null;
  publication_year?: number | null;
  doi?: string | null;
  source_title?: string | null;
  is_duplicate?: boolean;
  duplicate_review_status?: string;
  passes_title_filter?: boolean | null;
  title_status: 'PENDING' | 'EVALUATING' | 'INCLUDED' | 'EXCLUDED' | 'MAYBE';
  title_reason?: string | null;
  title_overridden?: boolean;
}

export interface PaginatedTitleScreeningRecordsResponse {
  items: TitleScreeningRecord[];
  total: number;
  skip: number;
  limit: number;
  returned: number;
  has_next: boolean;
  has_previous: boolean;
}

export interface AbstractScreeningRecord {
  record_id: string;
  file_id?: string;
  database_source: string;
  id_article?: string;
  title: string;
  abstract?: string | null;
  authors?: string | null;
  publication_year?: number | null;
  doi?: string | null;
  source_title?: string | null;
  title_status?: string;
  title_reason?: string | null;
  title_overridden?: boolean;
  passes_abstract_filter?: boolean | null;
  abstract_status: 'PENDING' | 'EVALUATING' | 'INCLUDED' | 'EXCLUDED' | 'MAYBE';
  abstract_reason?: string | null;
  abstract_overridden?: boolean;
}

export interface PaginatedAbstractScreeningRecordsResponse {
  items: AbstractScreeningRecord[];
  total: number;
  skip: number;
  limit: number;
  returned: number;
  has_next: boolean;
  has_previous: boolean;
}

export interface StartScreeningRequest {
  provider?: string; // 'google', 'openai', 'anthropic', 'deepseek'
  model?: string;    // e.g. 'deepseek-v4-pro'
  temperature?: number;
  re_run?: boolean;
  re_hacer?: boolean;
}

export interface OverrideDecisionPayload {
  record_id: string;
  stage: 'title' | 'abstract';
  new_status: 'INCLUDED' | 'EXCLUDED' | 'MAYBE';
  override_reason?: string;
}

export interface AIModelItem {
  id: string;
  name: string;
  description?: string;
  pricing_per_million_tokens?: {
    input_usd: number;
    output_usd: number;
    total_usd: number;
  };
  recommended_for?: string[];
  is_default_for_screening?: boolean;
}

export interface AIProviderCatalogItem {
  provider: string;
  display_name: string;
  is_configured: boolean;
  models: AIModelItem[];
}

export interface DefaultScreeningModelResponse {
  provider: string;
  model: string;
}

export interface TitleScreeningSourceMetrics {
  database_source: string;
  total_unique: number;
  included_title: number;
  excluded_title: number;
  maybe_title: number;
}

export interface TitleScreeningMetrics {
  total_unique: number;
  included_title: number;
  excluded_title: number;
  maybe_title: number;
  by_database_source?: TitleScreeningSourceMetrics[];
}

export interface AbstractScreeningSourceMetrics {
  database_source: string;
  total_unique: number;
  included_abstract: number;
  excluded_abstract: number;
  maybe_abstract: number;
}

export interface AbstractScreeningMetrics {
  total_unique: number;
  included_abstract: number;
  excluded_abstract: number;
  maybe_abstract: number;
  by_database_source?: AbstractScreeningSourceMetrics[];
}

export const screeningService = {
  // 1. Iniciar cribado por Título (Fase 1)
  async startTitleScreening(
    projectId: string,
    payload: StartScreeningRequest = { provider: 'google', model: 'gemini-2.0-flash', temperature: 0.2 }
  ): Promise<any> {
    const response = await api.post(`/projects/${projectId}/screening/title/run`, payload);
    return response.data;
  },

  // 1b. Obtener métricas específicas de título (GET /projects/{project_id}/screening/title/metrics)
  async getTitleScreeningMetrics(projectId: string): Promise<TitleScreeningMetrics> {
    const response = await api.get<TitleScreeningMetrics>(`/projects/${projectId}/screening/title/metrics`);
    return response.data;
  },

  // 2. Obtener registros paginados para cribado por Título
  async getTitleScreeningRecords(
    projectId: string,
    skip: number = 0,
    limit: number = 100
  ): Promise<PaginatedTitleScreeningRecordsResponse> {
    const response = await api.get<PaginatedTitleScreeningRecordsResponse>(
      `/projects/${projectId}/screening/title/records`,
      { params: { skip, limit } }
    );
    return response.data;
  },

  // 3. Obtener resultados de cribado por Título
  async getTitleScreeningResults(projectId: string): Promise<TitleScreeningRecord[]> {
    const response = await api.get<TitleScreeningRecord[]>(
      `/projects/${projectId}/screening/title/results`
    );
    return response.data;
  },

  // 4. Iniciar cribado por Abstract (Fase 2)
  async startAbstractScreening(
    projectId: string,
    payload: StartScreeningRequest = { provider: 'google', model: 'gemini-2.0-flash', temperature: 0.2 }
  ): Promise<any> {
    const response = await api.post(`/projects/${projectId}/screening/abstract/run`, payload);
    return response.data;
  },

  // 4b. Obtener métricas específicas de abstract (GET /projects/{project_id}/screening/abstract/metrics)
  async getAbstractScreeningMetrics(projectId: string): Promise<AbstractScreeningMetrics> {
    const response = await api.get<AbstractScreeningMetrics>(`/projects/${projectId}/screening/abstract/metrics`);
    return response.data;
  },

  // 5. Obtener registros paginados para cribado por Abstract
  async getAbstractScreeningRecords(
    projectId: string,
    skip: number = 0,
    limit: number = 100
  ): Promise<PaginatedAbstractScreeningRecordsResponse> {
    const response = await api.get<PaginatedAbstractScreeningRecordsResponse>(
      `/projects/${projectId}/screening/abstract/records`,
      { params: { skip, limit } }
    );
    return response.data;
  },

  // 6. Obtener resultados de cribado por Abstract
  async getAbstractScreeningResults(projectId: string): Promise<AbstractScreeningRecord[]> {
    const response = await api.get<AbstractScreeningRecord[]>(
      `/projects/${projectId}/screening/abstract/results`
    );
    return response.data;
  },

  // 7. Sobrescribir decisión manualmente (Override)
  async overrideDecision(projectId: string, payload: OverrideDecisionPayload): Promise<any> {
    const response = await api.post(`/projects/${projectId}/screening/override-decision`, payload);
    return response.data;
  },

  // 8. Cancelar proceso de cribado por IA en ejecución
  async cancelScreening(projectId: string): Promise<any> {
    const response = await api.post(`/projects/${projectId}/screening/cancel`);
    return response.data;
  },

  // 9. Consultar catálogo de modelos de IA soportados (GET /api/v1/ai/models)
  async getAIModelsCatalog(): Promise<AIProviderCatalogItem[]> {
    const response = await api.get<AIProviderCatalogItem[]>('/ai/models');
    return response.data;
  },

  // 10. Consultar modelo por defecto para cribado (GET /api/v1/ai/models/screening-default)
  async getDefaultScreeningModel(): Promise<DefaultScreeningModelResponse> {
    const response = await api.get<DefaultScreeningModelResponse>('/ai/models/screening-default');
    return response.data;
  },
};
