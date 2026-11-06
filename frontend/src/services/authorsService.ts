import { api } from './api';
import type { Author, AuthorCreate, AuthorUpdate, AuthorWithProjects } from '../types/project';

export const authorsService = {
  // Listar autores paginados
  async getAuthors(skip: number = 0, limit: number = 100): Promise<Author[]> {
    const response = await api.get<Author[]>('/authors/', {
      params: { skip, limit },
    });
    return response.data;
  },

  // Obtener autor por ID con sus proyectos RSL
  async getAuthorById(id: number): Promise<AuthorWithProjects> {
    const response = await api.get<AuthorWithProjects>(`/authors/${id}`);
    return response.data;
  },

  // Obtener la URL del archivo de firma del autor (endpoint FileResponse)
  getSignatureFileUrl(authorId: number): string {
    return `/api/v1/authors/${authorId}/signature/file`;
  },

  // Crear nuevo autor enviando multipart/form-data
  async createAuthor(data: AuthorCreate, signatureFile?: File | null): Promise<Author> {
    const formData = new FormData();
    formData.append('first_name', data.first_name);
    formData.append('last_name', data.last_name);
    if (data.orcid) formData.append('orcid', data.orcid);
    if (data.university_affiliation) formData.append('university_affiliation', data.university_affiliation);
    if (data.institutional_email) formData.append('institutional_email', data.institutional_email);
    if (data.address) formData.append('address', data.address);
    if (data.dni) formData.append('dni', data.dni);
    if (signatureFile) formData.append('signature_file', signatureFile);

    const response = await api.post<Author>('/authors/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Actualizar parcialmente un autor enviando multipart/form-data (PATCH)
  async updateAuthor(id: number, data: AuthorUpdate, signatureFile?: File | null): Promise<Author> {
    const formData = new FormData();
    if (data.first_name) formData.append('first_name', data.first_name);
    if (data.last_name) formData.append('last_name', data.last_name);
    if (data.orcid) formData.append('orcid', data.orcid);
    if (data.university_affiliation) formData.append('university_affiliation', data.university_affiliation);
    if (data.institutional_email) formData.append('institutional_email', data.institutional_email);
    if (data.address) formData.append('address', data.address);
    if (data.dni) formData.append('dni', data.dni);
    if (signatureFile) formData.append('signature_file', signatureFile);

    const response = await api.patch<Author>(`/authors/${id}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Eliminar autor por ID
  async deleteAuthor(id: number): Promise<void> {
    await api.delete(`/authors/${id}`);
  },
};
