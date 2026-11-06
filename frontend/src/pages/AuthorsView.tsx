import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  RefreshCw,
  Edit3,
  Trash2,
  Eye,
  Building,
  Mail,
  FileText,
  IdCard,
  CheckCircle2,
  AlertCircle,
  X,
  Plus,
  BookOpen,
  LayoutGrid,
  List as ListIcon,
  Award,
  PenTool,
  Download,
  ArrowUpDown,
} from 'lucide-react';
import { authorsService } from '../services/authorsService';
import { FileUpload } from '../components/common/FileUpload';
import type { Author, AuthorCreate, AuthorWithProjects } from '../types/project';

export const AuthorsView: React.FC = () => {
  // State for Authors
  const [authors, setAuthors] = useState<Author[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Display Mode: Grid vs Table
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterAffiliation, setFilterAffiliation] = useState<string>('ALL');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Modal States: Create/Edit, Details Profile, Delete
  const [isFormModalOpen, setIsFormModalOpen] = useState<boolean>(false);
  const [editingAuthor, setEditingAuthor] = useState<Author | null>(null);
  const [viewingAuthor, setViewingAuthor] = useState<AuthorWithProjects | null>(null);
  const [, setLoadingDetails] = useState<boolean>(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [authorToDelete, setAuthorToDelete] = useState<Author | null>(null);

  // Form Input States
  const [firstName, setFirstName] = useState<string>('');
  const [lastName, setLastName] = useState<string>('');
  const [orcid, setOrcid] = useState<string>('');
  const [universityAffiliation, setUniversityAffiliation] = useState<string>('');
  const [institutionalEmail, setInstitutionalEmail] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [dni, setDni] = useState<string>('');

  // Reusable Signature File State
  const [signatureFile, setSignatureFile] = useState<File | null>(null);

  const [formSaving, setFormSaving] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Fetch initial authors list
  const loadAuthors = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await authorsService.getAuthors();
      setAuthors(data);
    } catch (err: any) {
      console.error('Error cargando autores:', err);
      setError(
        'No se pudo conectar con el backend (FastAPI 127.0.0.1:8008) para listar autores.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAuthors();
  }, []);

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setEditingAuthor(null);
    setFirstName('');
    setLastName('');
    setOrcid('');
    setUniversityAffiliation('');
    setInstitutionalEmail('');
    setAddress('');
    setDni('');
    setSignatureFile(null);
    setFormError(null);
    setIsFormModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (author: Author) => {
    setEditingAuthor(author);
    setFirstName(author.first_name);
    setLastName(author.last_name);
    setOrcid(author.orcid || '');
    setUniversityAffiliation(author.university_affiliation || '');
    setInstitutionalEmail(author.institutional_email || '');
    setAddress(author.address || '');
    setDni(author.dni || '');
    setSignatureFile(null);
    setFormError(null);
    setIsFormModalOpen(true);
  };

  // Open Detailed Profile Modal
  const handleOpenProfileModal = async (authorId: number) => {
    setLoadingDetails(true);
    setViewingAuthor(null);
    try {
      const details = await authorsService.getAuthorById(authorId);
      setViewingAuthor(details);
    } catch (err: any) {
      alert('Error cargando los detalles del autor.');
    } finally {
      setLoadingDetails(false);
    }
  };

  // Save Author (Create or Update with FileUpload)
  const handleSaveAuthor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setFormError('Los nombres y apellidos son campos obligatorios.');
      return;
    }

    setFormSaving(true);
    setFormError(null);

    const payload = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      orcid: orcid.trim() || undefined,
      university_affiliation: universityAffiliation.trim() || undefined,
      institutional_email: institutionalEmail.trim() || undefined,
      address: address.trim() || undefined,
      dni: dni.trim() || undefined,
    };

    try {
      if (editingAuthor) {
        await authorsService.updateAuthor(editingAuthor.id, payload, signatureFile);
      } else {
        await authorsService.createAuthor(payload as AuthorCreate, signatureFile);
      }
      setIsFormModalOpen(false);
      await loadAuthors();
    } catch (err: any) {
      console.error('Error guardando autor:', err);
      setFormError(err.response?.data?.detail || 'Error al guardar la información del autor.');
    } finally {
      setFormSaving(false);
    }
  };

  // Delete Author
  const handleDeleteConfirm = async () => {
    if (!authorToDelete) return;
    try {
      await authorsService.deleteAuthor(authorToDelete.id);
      setIsDeleteModalOpen(false);
      setAuthorToDelete(null);
      await loadAuthors();
    } catch (err: any) {
      alert('Error al eliminar el autor: ' + (err.message || 'Error desconocido'));
    }
  };

  // Filter & Alphabetical Sorting of Authors
  const sortedAndFilteredAuthors = authors
    .filter((a) => {
      const fullName = `${a.first_name} ${a.last_name}`.toLowerCase();
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        fullName.includes(query) ||
        (a.orcid && a.orcid.toLowerCase().includes(query)) ||
        (a.university_affiliation && a.university_affiliation.toLowerCase().includes(query)) ||
        (a.institutional_email && a.institutional_email.toLowerCase().includes(query)) ||
        (a.dni && a.dni.toLowerCase().includes(query));

      if (filterAffiliation === 'ALL') return matchesSearch;
      return matchesSearch && a.university_affiliation === filterAffiliation;
    })
    .sort((a, b) => {
      const nameA = `${a.first_name} ${a.last_name}`.toLowerCase();
      const nameB = `${b.first_name} ${b.last_name}`.toLowerCase();
      return sortOrder === 'asc'
        ? nameA.localeCompare(nameB, 'es', { sensitivity: 'base' })
        : nameB.localeCompare(nameA, 'es', { sensitivity: 'base' });
    });

  // Extract unique affiliations for filter dropdown
  const uniqueAffiliations = Array.from(
    new Set(authors.map((a) => a.university_affiliation).filter(Boolean))
  ) as string[];

  // Counts for Stats Cards
  const authorsWithOrcid = authors.filter((a) => a.orcid && a.orcid.trim() !== '').length;
  const authorsWithSignature = authors.filter((a) => a.signature_url && a.signature_url.trim() !== '').length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-emerald-200 selection:text-emerald-900">
      {/* HEADER / BARRA DE NAVEGACIÓN */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-emerald-600 text-white font-bold shadow-md shadow-emerald-600/20">
              <Users className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900">
                  Gestión de Autores
                </h1>
                
              </div>
              <p className="text-xs text-slate-500">
                Investigadores, colaboradores, firmas y afiliaciones universitarias
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-3 w-full sm:w-auto justify-between sm:justify-end">
            <button
              onClick={handleOpenCreateModal}
              className="btn-green inline-flex items-center space-x-2 text-xs py-2 px-4 shadow-md"
            >
              <UserPlus className="w-4 h-4" />
              <span>Registrar Nuevo Autor</span>
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER RESPONSIVO */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6 sm:space-y-8">

        {/* METRICS & STATS CARDS (Fondo Blanco con acentos Verde y Naranja) */}
        <section className="grid grid-cols-1 sm:grid-cols-4 gap-3 sm:gap-4">
          {/* Card 1: Total Autores */}
          <div className="stat-card-green rounded-2xl p-4 sm:p-5 shadow-sm space-y-2 relative overflow-hidden">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                Total Autores
              </span>
              <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
                <Users className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900">{authors.length}</div>
            <p className="text-xs text-emerald-700 font-medium flex items-center">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Investigadores registrados
            </p>
          </div>

          {/* Card 2: ORCID Verificados */}
          <div className="stat-card-orange rounded-2xl p-4 sm:p-5 shadow-sm space-y-2 relative overflow-hidden">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wider text-orange-700">
                ORCID Verificados
              </span>
              <div className="p-2 rounded-xl bg-orange-100 text-orange-700">
                <Award className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900">{authorsWithOrcid}</div>
            <p className="text-xs text-orange-700 font-medium flex items-center">
              <IdCard className="w-3.5 h-3.5 mr-1 text-orange-600" /> Con código iD activo
            </p>
          </div>

          {/* Card 3: Firmas Registradas */}
          <div className="stat-card-green rounded-2xl p-4 sm:p-5 shadow-sm space-y-2 relative overflow-hidden">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                Firmas Adjuntas
              </span>
              <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
                <PenTool className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900">{authorsWithSignature}</div>
            <p className="text-xs text-emerald-700 font-medium flex items-center">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Archivos de firma validados
            </p>
          </div>

          {/* Card 4: Afiliaciones Universitarias */}
          <div className="stat-card-white rounded-2xl p-4 sm:p-5 shadow-sm space-y-2 relative overflow-hidden">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Universidades / Instituciones
              </span>
              <div className="p-2 rounded-xl bg-slate-100 text-slate-700">
                <Building className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900">{uniqueAffiliations.length}</div>
            <p className="text-xs text-slate-500 font-medium flex items-center">
              <Building className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Entidades vinculadas
            </p>
          </div>
        </section>

        {/* SEARCH & FILTERS BAR */}
        <section className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-sm">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, ORCID, universidad o correo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-theme w-full pl-10 pr-8 text-xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2 sm:space-x-3 justify-between sm:justify-end">
            {/* Orden Alfabético Toggle */}
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="btn-outline-theme inline-flex items-center space-x-1.5 text-xs py-2 px-3"
              title={`Orden alfabético: ${sortOrder === 'asc' ? 'A-Z (Ascendente)' : 'Z-A (Descendente)'}`}
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Orden:</span>
              <span className="font-bold text-slate-900">{sortOrder === 'asc' ? 'A-Z' : 'Z-A'}</span>
            </button>

            {/* Filter by Affiliation */}
            <div className="flex items-center space-x-1.5 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 flex-1 sm:flex-initial">
              <Filter className="w-3.5 h-3.5 text-orange-600 flex-shrink-0" />
              <select
                value={filterAffiliation}
                onChange={(e) => setFilterAffiliation(e.target.value)}
                className="bg-transparent text-xs text-slate-700 font-medium focus:outline-none cursor-pointer w-full"
              >
                <option value="ALL">Todas las instituciones</option>
                {uniqueAffiliations.map((aff) => (
                  <option key={aff} value={aff}>
                    {aff}
                  </option>
                ))}
              </select>
            </div>

            {/* Toggle View Mode (Grid vs Table) */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg text-xs font-semibold transition ${
                  viewMode === 'grid'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Vista de cuadrícula"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg text-xs font-semibold transition ${
                  viewMode === 'table'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Vista de tabla"
              >
                <ListIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Reload button */}
            <button
              onClick={loadAuthors}
              disabled={loading}
              className="btn-outline-theme p-2 text-xs"
              title="Recargar autores de la API"
            >
              <RefreshCw className={`w-4 h-4 text-emerald-600 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </section>

        {/* NOTIFICACIÓN DE ERROR */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-center justify-between text-rose-700 text-xs">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
            <button
              onClick={loadAuthors}
              className="px-3 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg font-semibold text-[11px]"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* CONTENIDO DE AUTORES ORDENADOS ALFABÉTICAMENTE */}
        {loading ? (
          <div className="py-16 text-center space-y-3 bg-white rounded-2xl border border-slate-200">
            <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
            <p className="text-xs text-slate-500 font-medium">Cargando directorio de autores desde FastAPI...</p>
          </div>
        ) : sortedAndFilteredAuthors.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-8 sm:p-12 text-center space-y-4 shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 border border-emerald-200 text-emerald-700 flex items-center justify-center mx-auto">
              <Users className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">No se encontraron autores</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {searchQuery
                  ? 'No hay autores que coincidan con los términos buscados.'
                  : 'Registra a tus colaboradores o investigadores para poder asociarlos a proyectos RSL.'}
              </p>
            </div>
            <button
              onClick={handleOpenCreateModal}
              className="btn-green inline-flex items-center space-x-2 text-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Registrar Primer Autor</span>
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          /* VISTA DE CUADRÍCULA (CARDS) */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {sortedAndFilteredAuthors.map((author) => (
              <div
                key={author.id}
                className="card-theme p-5 sm:p-6 flex flex-col justify-between space-y-4 relative group"
              >
                <div className="space-y-3">
                  {/* Author Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-white flex items-center justify-center font-bold text-sm shadow-sm flex-shrink-0">
                        {author.first_name[0]}{author.last_name[0]}
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-slate-900 group-hover:text-emerald-700 transition-colors leading-snug">
                          {author.first_name} {author.last_name}
                        </h3>
                        {author.university_affiliation ? (
                          <span className="text-[11px] text-slate-500 flex items-center mt-0.5">
                            <Building className="w-3 h-3 mr-1 text-slate-400 flex-shrink-0" />
                            {author.university_affiliation}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Sin afiliación</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Badges de ORCID y Firma con Botón de Descarga Rápida */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {author.orcid && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 text-[11px] font-mono border border-emerald-200">
                        <IdCard className="w-3 h-3 mr-1 text-emerald-600" />
                        {author.orcid}
                      </span>
                    )}

                    {author.signature_url ? (
                      <a
                        href={authorsService.getSignatureFileUrl(author.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        download
                        className="badge-orange inline-flex items-center text-[10px] hover:bg-orange-100 transition"
                        title="Hacer clic para descargar firma"
                      >
                        <PenTool className="w-3 h-3 mr-1 text-orange-600" />
                        Descargar Firma
                      </a>
                    ) : (
                      <span className="text-[10px] text-slate-400 italic px-2 py-0.5 bg-slate-100 rounded-md">
                        Sin firma
                      </span>
                    )}
                  </div>

                  {/* Details metadata (Email, DNI) */}
                  <div className="space-y-1 pt-2 border-t border-slate-100 text-xs text-slate-600">
                    {author.institutional_email && (
                      <div className="flex items-center text-slate-600 text-[11px] truncate">
                        <Mail className="w-3.5 h-3.5 mr-1.5 text-orange-600 flex-shrink-0" />
                        <span className="truncate">{author.institutional_email}</span>
                      </div>
                    )}
                    {author.dni && (
                      <div className="flex items-center text-slate-500 text-[11px]">
                        <FileText className="w-3.5 h-3.5 mr-1.5 text-slate-400 flex-shrink-0" />
                        <span>DNI: {author.dni}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleOpenProfileModal(author.id)}
                    className="flex-1 btn-outline-theme inline-flex items-center justify-center space-x-1.5 py-1.5 text-xs"
                  >
                    <Eye className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Perfil & Proyectos</span>
                  </button>

                  <button
                    onClick={() => handleOpenEditModal(author)}
                    className="p-2 rounded-xl bg-slate-50 hover:bg-orange-50 text-slate-600 hover:text-orange-700 border border-slate-200 hover:border-orange-200 transition"
                    title="Editar autor"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => {
                      setAuthorToDelete(author);
                      setIsDeleteModalOpen(true);
                    }}
                    className="p-2 rounded-xl bg-slate-50 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 hover:border-rose-200 transition"
                    title="Eliminar autor"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* VISTA DE TABLA TABULAR */
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-bold text-[10px] tracking-wider">
                  <tr>
                    <th className="p-4">Autor / Investigador</th>
                    <th className="p-4">Afiliación Universitaria</th>
                    <th className="p-4">Código ORCID</th>
                    <th className="p-4">Archivo de Firma</th>
                    <th className="p-4">Correo Institucional</th>
                    <th className="p-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedAndFilteredAuthors.map((author) => (
                    <tr key={author.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-4 font-bold text-slate-900">
                        <div className="flex items-center space-x-2.5">
                          <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                            {author.first_name[0]}{author.last_name[0]}
                          </div>
                          <span>{author.first_name} {author.last_name}</span>
                        </div>
                      </td>
                      <td className="p-4 text-slate-600">
                        {author.university_affiliation || <span className="text-slate-400 italic">--</span>}
                      </td>
                      <td className="p-4 font-mono text-emerald-800 font-medium">
                        {author.orcid ? (
                          <span className="badge-green">{author.orcid}</span>
                        ) : (
                          <span className="text-slate-400 italic">--</span>
                        )}
                      </td>
                      <td className="p-4">
                        {author.signature_url ? (
                          <a
                            href={authorsService.getSignatureFileUrl(author.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            download
                            className="badge-orange inline-flex items-center text-[10px] hover:bg-orange-100 transition"
                          >
                            <Download className="w-3 h-3 mr-1 text-orange-600" /> Descargar
                          </a>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Sin firma</span>
                        )}
                      </td>
                      <td className="p-4 text-slate-600">
                        {author.institutional_email || <span className="text-slate-400 italic">--</span>}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            onClick={() => handleOpenProfileModal(author.id)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 transition"
                            title="Ver detalles"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenEditModal(author)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-orange-50 text-slate-600 hover:text-orange-700 transition"
                            title="Editar"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setAuthorToDelete(author);
                              setIsDeleteModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 transition"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* MODAL CREAR / EDITAR AUTOR (CON FILEUPLOAD REUTILIZABLE) */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-4 sm:p-6 shadow-2xl space-y-5 my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-xl bg-orange-50 text-orange-700 border border-orange-200">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">
                    {editingAuthor ? 'Editar Datos del Autor' : 'Registrar Nuevo Autor'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Información académica y archivo de firma
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsFormModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAuthor} className="space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Nombres <span className="text-emerald-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: María José..."
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="input-theme w-full text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Apellidos <span className="text-emerald-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Rodríguez Pérez..."
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="input-theme w-full text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Código ORCID
                </label>
                <input
                  type="text"
                  placeholder="0000-0002-1825-0097"
                  value={orcid}
                  onChange={(e) => setOrcid(e.target.value)}
                  className="input-theme w-full text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Afiliación Universitaria / Institucional
                </label>
                <input
                  type="text"
                  placeholder="Ej: Universidad Nacional Mayor de San Marcos..."
                  value={universityAffiliation}
                  onChange={(e) => setUniversityAffiliation(e.target.value)}
                  className="input-theme w-full text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Correo Institucional
                </label>
                <input
                  type="email"
                  placeholder="autor@universidad.edu.pe"
                  value={institutionalEmail}
                  onChange={(e) => setInstitutionalEmail(e.target.value)}
                  className="input-theme w-full text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    DNI / Cédula
                  </label>
                  <input
                    type="text"
                    placeholder="72849102"
                    value={dni}
                    onChange={(e) => setDni(e.target.value)}
                    className="input-theme w-full text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Dirección de Contacto
                  </label>
                  <input
                    type="text"
                    placeholder="Av. Universitaria 1800..."
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="input-theme w-full text-xs"
                  />
                </div>
              </div>

              {/* COMPONENTE REUTILIZABLE FILEUPLOAD PARA FIRMA */}
              <div className="pt-2 border-t border-slate-100">
                <FileUpload
                  label="Archivo de Firma del Autor (signature_file)"
                  hint="Arrastra aquí el archivo de firma (Imagen PNG/JPG o PDF) o haz clic"
                  accept="image/*,application/pdf"
                  selectedFile={signatureFile}
                  onFileSelect={(file) => setSignatureFile(file)}
                  currentFileUrl={editingAuthor?.signature_url}
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="btn-outline-theme text-xs py-2 px-4"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="btn-green inline-flex items-center space-x-2 text-xs py-2 px-5"
                >
                  {formSaving ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>{editingAuthor ? 'Guardar Cambios' : 'Registrar Autor'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PERFIL, FIRMA VISIBLE Y PROYECTOS VINCULADOS */}
      {viewingAuthor && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-4 sm:p-6 shadow-2xl space-y-5 my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center font-black text-lg">
                  {viewingAuthor.first_name[0]}{viewingAuthor.last_name[0]}
                </div>
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900">
                    {viewingAuthor.first_name} {viewingAuthor.last_name}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {viewingAuthor.university_affiliation || 'Sin afiliación registrada'}
                  </p>
                </div>
              </div>
              <button onClick={() => setViewingAuthor(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-500 font-medium">ORCID:</span>
                  <div className="font-mono text-emerald-800 font-bold">{viewingAuthor.orcid || 'N/A'}</div>
                </div>
                <div>
                  <span className="text-slate-500 font-medium">Correo:</span>
                  <div className="text-slate-800 truncate font-semibold">{viewingAuthor.institutional_email || 'N/A'}</div>
                </div>
              </div>

              {/* VISTA PREVIA Y DESCARGA DE LA FIRMA CON EL ENDPOINT GET /api/v1/authors/{id}/signature/file */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 font-bold text-slate-800">
                    <PenTool className="w-4 h-4 text-orange-600" />
                    <span>Firma Registrada del Autor</span>
                  </div>

                  {viewingAuthor.signature_url && (
                    <a
                      href={authorsService.getSignatureFileUrl(viewingAuthor.id)}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-green inline-flex items-center space-x-1.5 text-xs py-1 px-3 shadow-xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Descargar Firma</span>
                    </a>
                  )}
                </div>

                {viewingAuthor.signature_url ? (
                  <div className="bg-white p-3 rounded-lg border border-slate-200 flex flex-col items-center justify-center space-y-2">
                    {/* Render visual preview of the signature image */}
                    <img
                      src={authorsService.getSignatureFileUrl(viewingAuthor.id)}
                      alt={`Firma de ${viewingAuthor.first_name} ${viewingAuthor.last_name}`}
                      className="max-h-36 object-contain rounded-md border border-slate-100 shadow-2xs"
                      onError={(e) => {
                        // Fallback in case the signature is a non-image document (e.g. PDF)
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  </div>
                ) : (
                  <div className="text-slate-400 italic text-xs text-center py-2">
                    Este autor no posee una firma registrada en el sistema.
                  </div>
                )}
              </div>

              {/* Lista de Proyectos RSL donde colabora el autor */}
              <div className="space-y-2 pt-2">
                <div className="font-bold text-slate-600 uppercase tracking-wider text-[10px] flex items-center">
                  <BookOpen className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                  Proyectos RSL Asociados:
                </div>

                {viewingAuthor.projects && viewingAuthor.projects.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {viewingAuthor.projects.map((proj) => (
                      <div key={proj.id} className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-1">
                        <div className="font-bold text-slate-900">{proj.title}</div>
                        <div className="text-[10px] text-slate-500 flex justify-between">
                          <span>Ámbito: {proj.geographic_scope || 'Global'}</span>
                          <span>{new Date(proj.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 text-center bg-slate-50 rounded-xl border border-slate-200 text-slate-500 italic">
                    Este autor no está vinculado actualmente a ningún proyecto RSL.
                  </div>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setViewingAuthor(null)}
                className="btn-outline-theme text-xs py-2 px-4"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ELIMINAR AUTOR */}
      {isDeleteModalOpen && authorToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-rose-200 rounded-2xl max-w-md w-full p-4 sm:p-6 shadow-2xl space-y-4 my-auto">
            <div className="flex items-center space-x-3 text-rose-700">
              <AlertCircle className="w-6 h-6 flex-shrink-0 text-rose-600" />
              <h3 className="text-base font-bold">¿Eliminar Autor?</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Esta acción eliminará al autor{' '}
              <strong className="text-slate-900">"{authorToDelete.first_name} {authorToDelete.last_name}"</strong> del sistema.
            </p>
            <div className="flex justify-end space-x-3 pt-2">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="btn-outline-theme text-xs py-2 px-4"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md transition"
              >
                Eliminar Definitivamente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
