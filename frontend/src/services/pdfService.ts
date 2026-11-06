import { api } from './api';

export interface PDFCandidateItem {
  position: number;
  record_id: string;
  file_id?: string;
  database_source: string;
  id_article?: string;
  title: string;
  authors?: string;
  publication_year?: number;
  doi?: string;
  title_status?: string;
  title_reason?: string;
  abstract_status?: string;
  pdf_download_status: 'PENDING_AUTO_DOWNLOAD' | 'DOWNLOADING' | 'DOWNLOADED' | 'PENDING_MANUAL_UPLOAD' | 'MANUALLY_UPLOADED' | 'ERROR';
  pdf_file_path?: string | null;
  pdf_download_source?: string | null;
  pdf_error_message?: string | null;
  pdf_is_manually_uploaded?: boolean;
}

export interface PaginatedPDFCandidatesResponse {
  items: PDFCandidateItem[];
  total: number;
  skip: number;
  limit: number;
  returned: number;
  has_next: boolean;
  has_previous: boolean;
}

export interface PDFDownloadProcessStatus {
  project_id: string;
  task_id?: string | null;
  task_status?: string | null;
  total_eligible: number;
  pending_auto_download: number;
  downloading: number;
  downloaded: number;
  pending_manual_upload: number;
  manually_uploaded: number;
  errors: number;
}

export type PDFDownloadStatus =
  | 'PENDING_AUTO_DOWNLOAD'
  | 'DOWNLOADING'
  | 'DOWNLOADED'
  | 'PENDING_MANUAL_UPLOAD'
  | 'MANUALLY_UPLOADED'
  | 'ERROR';

export interface ArticlePDFRead {
  id: string;
  project_id: string;
  record_id: string;
  download_status: PDFDownloadStatus;
  file_path: string | null;
  download_source: string | null;
  file_size_bytes: number | null;
  sha256_checksum: string | null;
  pdf_url: string | null;
  error_message: string | null;
  is_manually_uploaded: boolean;
  created_at: string;
  updated_at: string;
}

export interface TestPDFDownloadResult {
  success: boolean;
  file_path?: string | null;
  download_source?: string | null;
  sha256_hash?: string | null;
  file_size_bytes?: number | null;
  error_message?: string | null;
}

export const pdfService = {
  // 1. Iniciar descarga masiva de PDFs en Celery (Unpaywall, Semantic Scholar, CrossRef)
  async downloadAllProjectPdfs(projectId: string): Promise<{ task_id: string; status: string; message: string }> {
    const response = await api.post(`/projects/${projectId}/pdfs/download-all`);
    return response.data;
  },

  // 2. Obtener estado del proceso de descarga y métricas de contadores
  async getPdfDownloadStatus(projectId: string, taskId?: string): Promise<PDFDownloadProcessStatus> {
    const response = await api.get<PDFDownloadProcessStatus>(`/projects/${projectId}/pdfs/download-status`, {
      params: taskId ? { task_id: taskId } : {},
    });
    return response.data;
  },

  // 3. Obtener mesa paginada de artículos aptos para PDF
  async getEligiblePdfCandidates(
    projectId: string,
    skip: number = 0,
    limit: number = 100
  ): Promise<PaginatedPDFCandidatesResponse> {
    const response = await api.get<PaginatedPDFCandidatesResponse>(`/projects/${projectId}/pdfs/eligible`, {
      params: { skip, limit },
    });
    return response.data;
  },

  // 4. Subida manual de PDF (POST /projects/{project_id}/records/{record_id}/pdf/upload)
  async uploadManualPdf(projectId: string, recordId: string, file: File): Promise<ArticlePDFRead> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post<ArticlePDFRead>(
      `/projects/${projectId}/records/${recordId}/pdf/upload`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },

  // 4b. Reemplazar PDF existente (PUT /projects/{project_id}/records/{record_id}/pdf)
  async replacePdf(projectId: string, recordId: string, file: File): Promise<ArticlePDFRead> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.put<ArticlePDFRead>(
      `/projects/${projectId}/records/${recordId}/pdf`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },

  // 4c. Eliminar PDF (DELETE /projects/{project_id}/records/{record_id}/pdf)
  async deletePdf(projectId: string, recordId: string): Promise<ArticlePDFRead> {
    const response = await api.delete<ArticlePDFRead>(`/projects/${projectId}/records/${recordId}/pdf`);
    return response.data;
  },

  // 5. Obtener URL directa para ver o descargar el binario del PDF
  getPdfFileUrl(projectId: string, recordId: string): string {
    const baseUrl = api.defaults.baseURL || '/api/v1';
    return `${baseUrl}/projects/${projectId}/records/${recordId}/pdf/file`;
  },

  // 6. Endpoint directo de prueba por DOI o URL
  async testDirectPdfDownload(doi?: string, url?: string): Promise<TestPDFDownloadResult> {
    const response = await api.post<TestPDFDownloadResult>('/pdfs/test-download', {
      doi: doi || null,
      url: url || null,
    });
    return response.data;
  },
};

export default pdfService;
