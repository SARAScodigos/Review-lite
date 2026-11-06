import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  FolderPlus,
  Search,
  RefreshCw,
  Edit3,
  Trash2,
  Eye,
  UserPlus,
  Users,
  Globe,
  Calendar,
  Layers,
  CheckCircle2,
  AlertCircle,
  X,
  Plus,
  BookOpen,
  Check,
  Target,
  FileCheck,
  FileX,
  IdCard,
  Newspaper,
  ExternalLink,
  MessageSquare,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from 'lucide-react';
import { projectsService } from '../services/projectsService';
import { authorsService } from '../services/authorsService';
import type { RSLProject, Author, ProjectExtraMetadata } from '../types/project';

interface ObjectiveItem {
  key: string;
  value: string;
}

export const ProjectsView: React.FC = () => {
  // State for Projects & Authors data
  const [projects, setProjects] = useState<RSLProject[]>([]);
  const [authors, setAuthors] = useState<Author[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterScope] = useState<string>('ALL');

  // Modal states: Create/Edit & View Details
  const [isFormModalOpen, setIsFormModalOpen] = useState<boolean>(false);
  const [editingProject, setEditingProject] = useState<RSLProject | null>(null);
  const [viewingProject, setViewingProject] = useState<RSLProject | null>(null);
  const [loadingProjectDetails, setLoadingProjectDetails] = useState<boolean>(false);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [projectToDelete, setProjectToDelete] = useState<RSLProject | null>(null);

  // Accordion Collapsible Sections State in Form Modal (Solo el primero abierto por defecto)
  const [openFormSections, setOpenFormSections] = useState<Record<string, boolean>>({
    general: true,
    journal: false,
    objectives: false,
    criteria: false,
    authors: false,
  });

  const toggleFormSection = (sectionKey: string) => {
    setOpenFormSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

  // Form Fields State
  const [formTitle, setFormTitle] = useState<string>('');
  const [formGeographicScope, setFormGeographicScope] = useState<string>('');
  const [formVariableInput, setFormVariableInput] = useState<string>('');
  const [formVariables, setFormVariables] = useState<string[]>([]);
  const [formSelectedAuthorIds, setFormSelectedAuthorIds] = useState<number[]>([]);

  // Extra Metadata State (Revista, Comentarios, Objetivos, Criterios)
  const [journalName, setJournalName] = useState<string>('');
  const [journalLink, setJournalLink] = useState<string>('');
  const [isSpecialIssue, setIsSpecialIssue] = useState<boolean>(false);
  const [specialIssueDetails, setSpecialIssueDetails] = useState<string>('');
  const [projectComment, setProjectComment] = useState<string>('');

  const [formObjectives, setFormObjectives] = useState<ObjectiveItem[]>([
    { key: 'OB1', value: '' },
  ]);
  const [formInclusionInput, setFormInclusionInput] = useState<string>('');
  const [formInclusionCriteria, setFormInclusionCriteria] = useState<string[]>([]);
  const [formExclusionInput, setFormExclusionInput] = useState<string>('');
  const [formExclusionCriteria, setFormExclusionCriteria] = useState<string[]>([]);

  const [formSaving, setFormSaving] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Author Creation Quick Modal State
  const [isAuthorModalOpen, setIsAuthorModalOpen] = useState<boolean>(false);
  const [authorFirstName, setAuthorFirstName] = useState<string>('');
  const [authorLastName, setAuthorLastName] = useState<string>('');
  const [authorOrcid, setAuthorOrcid] = useState<string>('');
  const [authorAffiliation, setAuthorAffiliation] = useState<string>('');
  const [authorEmail, setAuthorEmail] = useState<string>('');
  const [authorSaving, setAuthorSaving] = useState<boolean>(false);

  // Fetch initial data
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [projData, authData] = await Promise.all([
        projectsService.getProjects(),
        authorsService.getAuthors().catch(() => []),
      ]);
      setProjects(projData);
      setAuthors(authData);
    } catch (err: any) {
      console.error('Error cargando proyectos:', err);
      setError(
        'No se pudo conectar con el backend (FastAPI en 127.0.0.1:8008). Verifica que esté encendido.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Open Form Modal for Creating a new project
  const handleOpenCreateModal = () => {
    setEditingProject(null);
    setFormTitle('');
    setFormGeographicScope('');
    setFormVariables([]);
    setFormVariableInput('');
    setFormSelectedAuthorIds([]);

    setJournalName('');
    setJournalLink('');
    setIsSpecialIssue(false);
    setSpecialIssueDetails('');
    setProjectComment('');

    setFormObjectives([
      { key: 'OB1', value: 'Identificar las principales técnicas de IA usadas.' },
      { key: 'OB2', value: 'Evaluar las limitaciones reportadas en la literatura.' },
    ]);
    setFormInclusionCriteria([
      'Artículos revisados por pares.',
      'Publicaciones entre 2020 y 2026.',
    ]);
    setFormExclusionCriteria(['Literatura gris.', 'Estudios sin texto completo.']);
    setFormInclusionInput('');
    setFormExclusionInput('');

    setOpenFormSections({
      general: true,
      journal: false,
      objectives: false,
      criteria: false,
      authors: false,
    });

    setFormError(null);
    setIsFormModalOpen(true);
  };

  // Open Form Modal for Editing existing project
  const handleOpenEditModal = async (project: RSLProject) => {
    try {
      const fullProject = await projectsService.getProjectById(project.id);
      setEditingProject(fullProject);
      setFormTitle(fullProject.title);
      setFormGeographicScope(fullProject.geographic_scope || '');
      setFormVariables(fullProject.variables || []);
      setFormVariableInput('');
      setFormSelectedAuthorIds(
        fullProject.authors ? fullProject.authors.map((a) => a.id) : []
      );

      // Parse Extra Metadata
      const extra = fullProject.extra_metadata;

      // Journal Info
      if (extra?.journal_info) {
        setJournalName(extra.journal_info.journal_name || '');
        setJournalLink(extra.journal_info.journal_link || '');
        setIsSpecialIssue(Boolean(extra.journal_info.is_special_issue));
        setSpecialIssueDetails(extra.journal_info.special_issue_details || '');
      } else {
        setJournalName('');
        setJournalLink('');
        setIsSpecialIssue(false);
        setSpecialIssueDetails('');
      }

      // Project Comment
      setProjectComment(extra?.project_comment || '');

      // Objectives
      if (extra?.objectives && Object.keys(extra.objectives).length > 0) {
        const objArray = Object.entries(extra.objectives).map(([key, value]) => ({
          key,
          value,
        }));
        setFormObjectives(objArray);
      } else {
        setFormObjectives([{ key: 'OB1', value: '' }]);
      }

      // Eligibility Criteria
      if (extra?.eligibility_criteria?.inclusion) {
        setFormInclusionCriteria(extra.eligibility_criteria.inclusion);
      } else {
        setFormInclusionCriteria([]);
      }

      if (extra?.eligibility_criteria?.exclusion) {
        setFormExclusionCriteria(extra.eligibility_criteria.exclusion);
      } else {
        setFormExclusionCriteria([]);
      }

      setFormInclusionInput('');
      setFormExclusionInput('');

      setOpenFormSections({
        general: true,
        journal: false,
        objectives: false,
        criteria: false,
        authors: false,
      });

      setFormError(null);
      setIsFormModalOpen(true);
    } catch (err: any) {
      alert('Error cargando el detalle del proyecto para editar.');
    }
  };

  // Open Detailed View Modal
  const handleOpenDetailModal = async (projectId: string) => {
    setLoadingProjectDetails(true);
    setViewingProject(null);
    try {
      const fullProject = await projectsService.getProjectById(projectId);
      setViewingProject(fullProject);
    } catch (err: any) {
      alert('Error al obtener los detalles completos del proyecto.');
    } finally {
      setLoadingProjectDetails(false);
    }
  };

  // Variables Management
  const handleAddVariable = () => {
    const trimmed = formVariableInput.trim();
    if (trimmed && !formVariables.includes(trimmed)) {
      setFormVariables([...formVariables, trimmed]);
      setFormVariableInput('');
    }
  };

  const handleRemoveVariable = (varToRemove: string) => {
    setFormVariables(formVariables.filter((v) => v !== varToRemove));
  };

  // Objectives Management
  const handleAddObjective = () => {
    const nextNum = formObjectives.length + 1;
    setFormObjectives([...formObjectives, { key: `OB${nextNum}`, value: '' }]);
  };

  const handleObjectiveChange = (index: number, field: 'key' | 'value', val: string) => {
    const updated = [...formObjectives];
    updated[index][field] = val;
    setFormObjectives(updated);
  };

  const handleRemoveObjective = (index: number) => {
    setFormObjectives(formObjectives.filter((_, i) => i !== index));
  };

  // Inclusion Criteria Management
  const handleAddInclusion = () => {
    const trimmed = formInclusionInput.trim();
    if (trimmed && !formInclusionCriteria.includes(trimmed)) {
      setFormInclusionCriteria([...formInclusionCriteria, trimmed]);
      setFormInclusionInput('');
    }
  };

  const handleRemoveInclusion = (item: string) => {
    setFormInclusionCriteria(formInclusionCriteria.filter((i) => i !== item));
  };

  // Exclusion Criteria Management
  const handleAddExclusion = () => {
    const trimmed = formExclusionInput.trim();
    if (trimmed && !formExclusionCriteria.includes(trimmed)) {
      setFormExclusionCriteria([...formExclusionCriteria, trimmed]);
      setFormExclusionInput('');
    }
  };

  const handleRemoveExclusion = (item: string) => {
    setFormExclusionCriteria(formExclusionCriteria.filter((i) => i !== item));
  };

  // Save Project
  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      setFormError('El título del proyecto es obligatorio.');
      setOpenFormSections((prev) => ({ ...prev, general: true }));
      return;
    }

    setFormSaving(true);
    setFormError(null);

    // Build objectives map
    const objectivesMap: Record<string, string> = {};
    formObjectives.forEach((obj, idx) => {
      if (obj.value.trim()) {
        const keyName = obj.key.trim() || `OB${idx + 1}`;
        objectivesMap[keyName] = obj.value.trim();
      }
    });

    // Build extra_metadata structure
    const extraMetadataPayload: ProjectExtraMetadata = {
      journal_info: {
        journal_name: journalName.trim() || undefined,
        journal_link: journalLink.trim() || undefined,
        is_special_issue: isSpecialIssue,
        special_issue_details: isSpecialIssue ? specialIssueDetails.trim() || undefined : undefined,
      },
      project_comment: projectComment.trim() || undefined,
      objectives: objectivesMap,
      eligibility_criteria: {
        inclusion: formInclusionCriteria,
        exclusion: formExclusionCriteria,
      },
    };

    const payload = {
      title: formTitle.trim(),
      geographic_scope: formGeographicScope.trim() || undefined,
      variables: formVariables,
      author_ids: formSelectedAuthorIds,
      extra_metadata: extraMetadataPayload,
    };

    try {
      if (editingProject) {
        await projectsService.updateProject(editingProject.id, payload);
      } else {
        await projectsService.createProject(payload);
      }
      setIsFormModalOpen(false);
      await loadData();
    } catch (err: any) {
      console.error('Error guardando proyecto:', err);
      setFormError(err.response?.data?.detail || 'Error al guardar el proyecto.');
    } finally {
      setFormSaving(false);
    }
  };

  // Delete Project
  const handleDeleteConfirm = async () => {
    if (!projectToDelete) return;
    try {
      await projectsService.deleteProject(projectToDelete.id);
      setIsDeleteModalOpen(false);
      setProjectToDelete(null);
      await loadData();
    } catch (err: any) {
      alert('Error al eliminar el proyecto: ' + (err.message || 'Error desconocido'));
    }
  };

  // Create Quick Author
  const handleSaveAuthor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authorFirstName.trim() || !authorLastName.trim()) {
      alert('Nombre y Apellido son obligatorios');
      return;
    }
    setAuthorSaving(true);
    try {
      const newAuth = await authorsService.createAuthor({
        first_name: authorFirstName.trim(),
        last_name: authorLastName.trim(),
        orcid: authorOrcid.trim() || undefined,
        university_affiliation: authorAffiliation.trim() || undefined,
        institutional_email: authorEmail.trim() || undefined,
      });
      setAuthors([...authors, newAuth]);
      setFormSelectedAuthorIds([...formSelectedAuthorIds, newAuth.id]);
      setIsAuthorModalOpen(false);
      setAuthorFirstName('');
      setAuthorLastName('');
      setAuthorOrcid('');
      setAuthorAffiliation('');
      setAuthorEmail('');
    } catch (err: any) {
      alert('Error al crear autor: ' + (err.message || 'Error'));
    } finally {
      setAuthorSaving(false);
    }
  };

  // Filtered & Sorted Projects
  const filteredProjects = projects
    .filter((p) => {
      const matchesQuery =
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.geographic_scope && p.geographic_scope.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.variables && p.variables.some((v) => v.toLowerCase().includes(searchQuery.toLowerCase()))) ||
        (p.extra_metadata?.journal_info?.journal_name &&
          p.extra_metadata.journal_info.journal_name.toLowerCase().includes(searchQuery.toLowerCase()));

      if (filterScope === 'ALL') return matchesQuery;
      return matchesQuery && p.geographic_scope === filterScope;
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const uniqueScopes = Array.from(
    new Set(projects.map((p) => p.geographic_scope).filter(Boolean))
  ) as string[];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-emerald-200 selection:text-emerald-900">
      {/* HEADER / BARRA DE NAVEGACIÓN */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-emerald-600 text-white font-bold shadow-md shadow-emerald-600/20">
              <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900">
                  Proyectos RSL
                </h1>
              </div>
              <p className="text-xs text-slate-500">
                Gestión de Revisiones Sistemáticas de la Literatura
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-3 w-full sm:w-auto justify-end">
            <button
              onClick={handleOpenCreateModal}
              className="btn-green inline-flex items-center space-x-2 text-xs py-2 px-3.5 shadow-md"
            >
              <FolderPlus className="w-4 h-4" />
              <span>Nuevo Proyecto</span>
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER RESPONSIVO */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6 sm:space-y-8">

        {/* METRICS & STATS CARDS */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="stat-card-green rounded-2xl p-4 sm:p-5 shadow-sm space-y-2 relative overflow-hidden">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                Total Proyectos
              </span>
              <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
                <Layers className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900">{projects.length}</div>
            <p className="text-xs text-emerald-700 font-medium flex items-center">
              <Check className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Registrados en backend
            </p>
          </div>

          <div className="stat-card-orange rounded-2xl p-4 sm:p-5 shadow-sm space-y-2 relative overflow-hidden">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wider text-orange-700">
                Ámbitos Geográficos
              </span>
              <div className="p-2 rounded-xl bg-orange-100 text-orange-700">
                <Globe className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900">{uniqueScopes.length}</div>
            <p className="text-xs text-orange-700 font-medium flex items-center">
              <Globe className="w-3.5 h-3.5 mr-1 text-orange-600" /> Regiones analizadas
            </p>
          </div>

          <div className="stat-card-white rounded-2xl p-4 sm:p-5 shadow-sm space-y-2 relative overflow-hidden">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Autores Registrados
              </span>
              <div className="p-2 rounded-xl bg-slate-100 text-slate-700">
                <Users className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900">{authors.length}</div>
            <p className="text-xs text-slate-500 font-medium flex items-center">
              <UserPlus className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Investigadores del estudio
            </p>
          </div>

          <div className="stat-card-green rounded-2xl p-4 sm:p-5 shadow-sm space-y-2 relative overflow-hidden">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                Protocolo Estándar
              </span>
              <span className="badge-green">Verificado</span>
            </div>
            <p className="text-xs text-slate-600">
              Flujo sistemático de cribado, extracción y síntesis.
            </p>
          </div>
        </section>

        {/* SEARCH BAR RESPONSIVA */}
        <section className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-sm">
          <div className="relative flex-1">
            <Search aria-hidden="true" className="pointer-events-none w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              aria-label="Buscar proyectos por título, variable, revista o ámbito"
              placeholder="Buscar por título, variable, revista o ámbito..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-theme w-full text-xs"
              style={{ paddingInlineStart: '2.5rem', paddingInlineEnd: '2.5rem' }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                type="button"
                aria-label="Limpiar búsqueda"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="btn-outline-theme p-2 text-xs self-end sm:self-auto"
            title="Recargar datos de la API"
          >
            <RefreshCw className={`w-4 h-4 text-emerald-600 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </section>

        {/* NOTIFICACIÓN DE ERROR */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-center justify-between text-rose-700 text-xs">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
            <button
              onClick={loadData}
              className="px-3 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg font-semibold text-[11px]"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* GRID DE PROYECTOS */}
        {loading ? (
          <div className="py-16 text-center space-y-3 bg-white rounded-2xl border border-slate-200">
            <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
            <p className="text-xs text-slate-500 font-medium">Cargando proyectos desde PostgreSQL / FastAPI...</p>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-8 sm:p-12 text-center space-y-4 shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-orange-100 border border-orange-200 text-orange-600 flex items-center justify-center mx-auto">
              <BookOpen className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">No se encontraron proyectos RSL</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {searchQuery
                  ? 'No hay proyectos que coincidan con tu búsqueda.'
                  : 'Crea tu primer proyecto RSL para iniciar el proceso de revisión bajo el flujo PRISMA 2020.'}
              </p>
            </div>
            <button
              onClick={handleOpenCreateModal}
              className="btn-green inline-flex items-center space-x-2 text-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Crear Primer Proyecto</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {filteredProjects.map((project) => (
              <div
                key={project.id}
                className="card-theme p-5 sm:p-6 flex flex-col justify-between space-y-4 sm:space-y-5 relative group"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="badge-green inline-flex items-center truncate max-w-[180px]">
                      <Globe className="w-3 h-3 mr-1 text-emerald-700 flex-shrink-0" />
                      {project.geographic_scope || 'Ámbito Global'}
                    </span>
                    <span className="text-slate-400 font-mono flex items-center text-[11px] flex-shrink-0">
                      <Calendar className="w-3 h-3 mr-1 text-slate-400" />
                      {new Date(project.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 group-hover:text-emerald-700 transition-colors leading-snug line-clamp-2">
                    {project.title}
                  </h3>

                  {/* Nombre de la revista si existe */}
                  {project.extra_metadata?.journal_info?.journal_name && (
                    <div className="text-[11px] text-slate-600 font-medium flex items-center space-x-1 truncate">
                      <Newspaper className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                      <span className="truncate">{project.extra_metadata.journal_info.journal_name}</span>
                    </div>
                  )}

                  {/* Variables */}
                  {project.variables && project.variables.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                        Variables Analizadas:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {project.variables.map((v, idx) => (
                          <span key={idx} className="badge-orange">
                            {v}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                  <Link
                    to={`/projects/${project.id}`}
                    className="btn-green inline-flex items-center justify-center space-x-1.5 py-1.5 px-3.5 text-xs font-bold shadow-xs flex-shrink-0 hover:shadow-md transition"
                    title="Administrar proyecto"
                  >
                    <span>Ir</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>

                  <button
                    onClick={() => handleOpenDetailModal(project.id)}
                    className="flex-1 btn-outline-theme inline-flex items-center justify-center space-x-1.5 py-1.5 text-xs"
                  >
                    <Eye className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Ver Detalles</span>
                  </button>

                  <button
                    onClick={() => handleOpenEditModal(project)}
                    className="p-2 rounded-xl bg-slate-50 hover:bg-orange-50 text-slate-600 hover:text-orange-700 border border-slate-200 hover:border-orange-200 transition flex-shrink-0"
                    title="Editar proyecto"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => {
                      setProjectToDelete(project);
                      setIsDeleteModalOpen(true);
                    }}
                    className="p-2 rounded-xl bg-slate-50 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 hover:border-rose-200 transition flex-shrink-0"
                    title="Eliminar proyecto"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* MODAL CREAR / EDITAR PROYECTO (CON COLAPSADORES POR SECCIÓN) */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl space-y-5 my-auto max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-slate-100 text-slate-800 border border-slate-200">
                  <FolderPlus className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">
                    {editingProject ? 'Editar Proyecto RSL' : 'Nuevo Proyecto RSL'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Configuración del protocolo de revisión sistemática
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsFormModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProject} className="space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* SECCIÓN 1: INFORMACIÓN GENERAL DEL PROYECTO */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                <button
                  type="button"
                  onClick={() => toggleFormSection('general')}
                  className="w-full flex items-center justify-between p-3.5 bg-slate-50/80 hover:bg-slate-100/80 transition text-left"
                >
                  <div className="flex items-center space-x-2.5">
                    <BookOpen className="w-4 h-4 text-emerald-600" />
                    <span className="font-bold text-xs uppercase tracking-wider text-slate-800">
                      1. Información General del Proyecto
                    </span>
                  </div>
                  {openFormSections.general ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </button>

                {openFormSections.general && (
                  <div className="p-4 space-y-4 border-t border-slate-200">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">
                        Título del Proyecto <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ej: Uso de Inteligencia Artificial en Revisiones Sistemáticas..."
                        value={formTitle}
                        onChange={(e) => setFormTitle(e.target.value)}
                        className="input-theme w-full text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">
                        Ámbito Geográfico
                      </label>
                      <input
                        type="text"
                        placeholder="Ej: Global, América Latina, Perú, Europa..."
                        value={formGeographicScope}
                        onChange={(e) => setFormGeographicScope(e.target.value)}
                        className="input-theme w-full text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-700">
                        Variables o Conceptos Clave
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Escribe una variable y presiona Agregar..."
                          value={formVariableInput}
                          onChange={(e) => setFormVariableInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddVariable();
                            }
                          }}
                          className="input-theme flex-1 text-xs"
                        />
                        <button
                          type="button"
                          onClick={handleAddVariable}
                          className="btn-outline-theme text-xs py-2 px-3.5"
                        >
                          Agregar
                        </button>
                      </div>

                      {formVariables.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {formVariables.map((v, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-800 text-xs font-medium"
                            >
                              {v}
                              <button
                                type="button"
                                onClick={() => handleRemoveVariable(v)}
                                className="ml-1.5 text-slate-400 hover:text-rose-600"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* SECCIÓN 2: INFORMACIÓN DE REVISTA Y COMENTARIOS */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                <button
                  type="button"
                  onClick={() => toggleFormSection('journal')}
                  className="w-full flex items-center justify-between p-3.5 bg-slate-50/80 hover:bg-slate-100/80 transition text-left"
                >
                  <div className="flex items-center space-x-2.5">
                    <Newspaper className="w-4 h-4 text-emerald-600" />
                    <span className="font-bold text-xs uppercase tracking-wider text-slate-800">
                      2. Revista Publicación & Comentarios
                    </span>
                  </div>
                  {openFormSections.journal ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </button>

                {openFormSections.journal && (
                  <div className="p-4 space-y-4 border-t border-slate-200">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-700">
                          Nombre de la Revista
                        </label>
                        <input
                          type="text"
                          placeholder="Ej: IEEE Transactions on Software Engineering..."
                          value={journalName}
                          onChange={(e) => setJournalName(e.target.value)}
                          className="input-theme w-full text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-700">
                          Link / URL de la Revista
                        </label>
                        <input
                          type="url"
                          placeholder="https://ieeexplore.ieee.org/..."
                          value={journalLink}
                          onChange={(e) => setJournalLink(e.target.value)}
                          className="input-theme w-full text-xs"
                        />
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-200 space-y-2">
                      <label className="flex items-center space-x-2 cursor-pointer text-xs font-semibold text-slate-800">
                        <input
                          type="checkbox"
                          checked={isSpecialIssue}
                          onChange={(e) => setIsSpecialIssue(e.target.checked)}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>¿Es un Número o Edición Especial?</span>
                      </label>

                      {isSpecialIssue && (
                        <input
                          type="text"
                          placeholder="Ej: Special Issue: AI in Literature Reviews 2026"
                          value={specialIssueDetails}
                          onChange={(e) => setSpecialIssueDetails(e.target.value)}
                          className="input-theme w-full text-xs bg-white"
                        />
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">
                        Comentario u Observaciones
                      </label>
                      <textarea
                        rows={2}
                        placeholder="Notas sueltas sobre el proyecto o metodología..."
                        value={projectComment}
                        onChange={(e) => setProjectComment(e.target.value)}
                        className="input-theme w-full text-xs resize-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* SECCIÓN 3: OBJETIVOS DE INVESTIGACIÓN */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                <button
                  type="button"
                  onClick={() => toggleFormSection('objectives')}
                  className="w-full flex items-center justify-between p-3.5 bg-slate-50/80 hover:bg-slate-100/80 transition text-left"
                >
                  <div className="flex items-center space-x-2.5">
                    <Target className="w-4 h-4 text-emerald-600" />
                    <span className="font-bold text-xs uppercase tracking-wider text-slate-800">
                      3. Objetivos de Investigación ({formObjectives.length})
                    </span>
                  </div>
                  {openFormSections.objectives ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </button>

                {openFormSections.objectives && (
                  <div className="p-4 space-y-3 border-t border-slate-200">
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleAddObjective}
                        className="inline-flex items-center space-x-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ Agregar Objetivo</span>
                      </button>
                    </div>

                    <div className="space-y-2">
                      {formObjectives.map((obj, idx) => (
                        <div key={idx} className="flex items-center space-x-2">
                          <input
                            type="text"
                            placeholder="OB1"
                            value={obj.key}
                            onChange={(e) => handleObjectiveChange(idx, 'key', e.target.value)}
                            className="input-theme w-20 text-xs font-mono font-bold text-center uppercase"
                          />
                          <input
                            type="text"
                            placeholder="Descripción del objetivo de estudio..."
                            value={obj.value}
                            onChange={(e) => handleObjectiveChange(idx, 'value', e.target.value)}
                            className="input-theme flex-1 text-xs"
                          />
                          {formObjectives.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveObjective(idx)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* SECCIÓN 4: CRITERIOS DE ELEGIBILIDAD (PRISMA 2020) */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                <button
                  type="button"
                  onClick={() => toggleFormSection('criteria')}
                  className="w-full flex items-center justify-between p-3.5 bg-slate-50/80 hover:bg-slate-100/80 transition text-left"
                >
                  <div className="flex items-center space-x-2.5">
                    <FileCheck className="w-4 h-4 text-emerald-600" />
                    <span className="font-bold text-xs uppercase tracking-wider text-slate-800">
                      4. Criterios de Elegibilidad
                    </span>
                  </div>
                  {openFormSections.criteria ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </button>

                {openFormSections.criteria && (
                  <div className="p-4 space-y-4 border-t border-slate-200">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Inclusión */}
                      <div className="space-y-2 bg-slate-50/60 p-3.5 rounded-xl border border-slate-200">
                        <label className="text-xs font-semibold text-slate-800 flex items-center">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                          Criterios de Inclusión
                        </label>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            placeholder="Añadir criterio..."
                            value={formInclusionInput}
                            onChange={(e) => setFormInclusionInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddInclusion();
                              }
                            }}
                            className="input-theme flex-1 text-xs bg-white"
                          />
                          <button
                            type="button"
                            onClick={handleAddInclusion}
                            className="btn-outline-theme text-xs py-1 px-2.5"
                          >
                            +
                          </button>
                        </div>
                        {formInclusionCriteria.length > 0 && (
                          <ul className="space-y-1 pt-1">
                            {formInclusionCriteria.map((item, i) => (
                              <li
                                key={i}
                                className="flex items-center justify-between text-xs text-slate-700 bg-white p-2 rounded-lg border border-slate-200"
                              >
                                <span className="truncate pr-1">• {item}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveInclusion(item)}
                                  className="text-slate-400 hover:text-rose-600"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {/* Exclusión */}
                      <div className="space-y-2 bg-slate-50/60 p-3.5 rounded-xl border border-slate-200">
                        <label className="text-xs font-semibold text-slate-800 flex items-center">
                          <FileX className="w-3.5 h-3.5 mr-1.5 text-orange-600" />
                          Criterios de Exclusión
                        </label>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            placeholder="Añadir criterio..."
                            value={formExclusionInput}
                            onChange={(e) => setFormExclusionInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddExclusion();
                              }
                            }}
                            className="input-theme flex-1 text-xs bg-white"
                          />
                          <button
                            type="button"
                            onClick={handleAddExclusion}
                            className="btn-outline-theme text-xs py-1 px-2.5"
                          >
                            +
                          </button>
                        </div>
                        {formExclusionCriteria.length > 0 && (
                          <ul className="space-y-1 pt-1">
                            {formExclusionCriteria.map((item, i) => (
                              <li
                                key={i}
                                className="flex items-center justify-between text-xs text-slate-700 bg-white p-2 rounded-lg border border-slate-200"
                              >
                                <span className="truncate pr-1">• {item}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveExclusion(item)}
                                  className="text-slate-400 hover:text-rose-600"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* SECCIÓN 5: AUTORES INVESTIGADORES */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                <button
                  type="button"
                  onClick={() => toggleFormSection('authors')}
                  className="w-full flex items-center justify-between p-3.5 bg-slate-50/80 hover:bg-slate-100/80 transition text-left"
                >
                  <div className="flex items-center space-x-2.5">
                    <Users className="w-4 h-4 text-emerald-600" />
                    <span className="font-bold text-xs uppercase tracking-wider text-slate-800">
                      5. Autores Investigadores ({formSelectedAuthorIds.length} seleccionados)
                    </span>
                  </div>
                  {openFormSections.authors ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </button>

                {openFormSections.authors && (
                  <div className="p-4 space-y-3 border-t border-slate-200">
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => setIsAuthorModalOpen(true)}
                        className="inline-flex items-center space-x-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>+ Crear Autor</span>
                      </button>
                    </div>

                    {authors.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-1">
                        No hay autores registrados. Puedes crear uno rápido arriba.
                      </p>
                    ) : (
                      <div className="max-h-36 overflow-y-auto bg-slate-50/60 border border-slate-200 rounded-xl p-2 space-y-1">
                        {authors.map((author) => {
                          const isSelected = formSelectedAuthorIds.includes(author.id);
                          return (
                            <label
                              key={author.id}
                              className={`flex items-center justify-between p-2 rounded-lg cursor-pointer text-xs border transition ${
                                isSelected
                                  ? 'bg-white border-emerald-400 text-slate-900 font-semibold shadow-2xs'
                                  : 'bg-white/60 border-slate-200 text-slate-600 hover:bg-white'
                              }`}
                            >
                              <div className="flex items-center space-x-2 truncate">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setFormSelectedAuthorIds([...formSelectedAuthorIds, author.id]);
                                    } else {
                                      setFormSelectedAuthorIds(
                                        formSelectedAuthorIds.filter((id) => id !== author.id)
                                      );
                                    }
                                  }}
                                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                />
                                <span className="truncate">
                                  {author.first_name} {author.last_name}
                                </span>
                              </div>
                              {author.university_affiliation && (
                                <span className="text-[10px] text-slate-400 truncate max-w-[140px]">
                                  {author.university_affiliation}
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Botones de Acción Final */}
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
                  className="btn-green inline-flex items-center space-x-2 text-xs py-2 px-5 shadow-sm"
                >
                  {formSaving ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>{editingProject ? 'Guardar Cambios' : 'Crear Proyecto'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CREAR AUTOR RÁPIDO */}
      {isAuthorModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-4 sm:p-6 shadow-2xl space-y-4 my-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                <UserPlus className="w-4 h-4 text-emerald-600" />
                <span>Registrar Nuevo Autor</span>
              </h3>
              <button onClick={() => setIsAuthorModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAuthor} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase">Nombres *</label>
                  <input
                    type="text"
                    required
                    value={authorFirstName}
                    onChange={(e) => setAuthorFirstName(e.target.value)}
                    className="input-theme w-full mt-1 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase">Apellidos *</label>
                  <input
                    type="text"
                    required
                    value={authorLastName}
                    onChange={(e) => setAuthorLastName(e.target.value)}
                    className="input-theme w-full mt-1 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase">ORCID</label>
                <input
                  type="text"
                  placeholder="0000-0002-1825-0097"
                  value={authorOrcid}
                  onChange={(e) => setAuthorOrcid(e.target.value)}
                  className="input-theme w-full mt-1 text-xs font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase">Afiliación Universitaria</label>
                <input
                  type="text"
                  placeholder="Universidad Nacional..."
                  value={authorAffiliation}
                  onChange={(e) => setAuthorAffiliation(e.target.value)}
                  className="input-theme w-full mt-1 text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase">Correo Institucional</label>
                <input
                  type="email"
                  placeholder="autor@universidad.edu"
                  value={authorEmail}
                  onChange={(e) => setAuthorEmail(e.target.value)}
                  className="input-theme w-full mt-1 text-xs"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAuthorModalOpen(false)}
                  className="btn-outline-theme text-xs py-1.5 px-3"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={authorSaving}
                  className="btn-green text-xs py-1.5 px-4"
                >
                  {authorSaving ? 'Guardando...' : 'Guardar Autor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL VISTA DETALLADA COMPLETA DEL PROYECTO */}
      {(viewingProject || loadingProjectDetails) && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full p-4 sm:p-6 shadow-2xl space-y-6 my-auto max-h-[90vh] overflow-y-auto">
            {loadingProjectDetails ? (
              <div className="py-12 text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
                <p className="text-xs text-slate-500 font-medium">
                  Cargando detalle del proyecto y autores desde GET /api/v1/projects/...
                </p>
              </div>
            ) : viewingProject ? (
              <>
                <div className="flex justify-between items-start pb-4 border-b border-slate-100">
                  <div className="space-y-1">
                    <span className="badge-green">
                      {viewingProject.geographic_scope || 'Ámbito Global'}
                    </span>
                    <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 leading-tight">
                      {viewingProject.title}
                    </h2>
                  </div>
                  <button onClick={() => setViewingProject(null)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-5 text-xs">

                  {/* Información de la Revista (extra_metadata.journal_info) */}
                  {viewingProject.extra_metadata?.journal_info?.journal_name && (
                    <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-200 space-y-2">
                      <div className="font-bold text-emerald-900 text-xs uppercase flex items-center space-x-1.5">
                        <Newspaper className="w-4 h-4 text-emerald-700" />
                        <span>Revista de Publicación Objetivo</span>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="font-bold text-slate-900 text-sm">
                            {viewingProject.extra_metadata.journal_info.journal_name}
                          </div>
                          {viewingProject.extra_metadata.journal_info.journal_link && (
                            <a
                              href={viewingProject.extra_metadata.journal_info.journal_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-700 hover:underline flex items-center text-[11px] mt-0.5"
                            >
                              <ExternalLink className="w-3 h-3 mr-1" />
                              <span>{viewingProject.extra_metadata.journal_info.journal_link}</span>
                            </a>
                          )}
                        </div>

                        {viewingProject.extra_metadata.journal_info.is_special_issue && (
                          <span className="badge-orange inline-flex items-center text-[10px] self-start sm:self-auto">
                            <Sparkles className="w-3 h-3 mr-1 text-orange-600" />
                            {viewingProject.extra_metadata.journal_info.special_issue_details || 'Número Especial'}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Comentario / Notas Sueltas (extra_metadata.project_comment) */}
                  {viewingProject.extra_metadata?.project_comment && (
                    <div className="p-4 bg-orange-50/50 rounded-xl border border-orange-200 space-y-1">
                      <div className="font-bold text-orange-900 text-xs uppercase flex items-center space-x-1.5">
                        <MessageSquare className="w-4 h-4 text-orange-700" />
                        <span>Comentario / Notas del Proyecto</span>
                      </div>
                      <p className="text-slate-700 text-xs leading-relaxed italic">
                        "{viewingProject.extra_metadata.project_comment}"
                      </p>
                    </div>
                  )}

                  {/* Variables */}
                  <div className="space-y-1.5">
                    <div className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">
                      Variables Analizadas:
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {viewingProject.variables && viewingProject.variables.length > 0 ? (
                        viewingProject.variables.map((v, i) => (
                          <span key={i} className="badge-orange">
                            {v}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-400 italic">No especificadas</span>
                      )}
                    </div>
                  </div>

                  {/* Autores Vinculados */}
                  <div className="space-y-2 pt-3 border-t border-slate-100">
                    <div className="font-bold text-slate-600 uppercase tracking-wider text-[10px] flex items-center">
                      <Users className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                      Autores Vinculados ({viewingProject.authors?.length || 0}):
                    </div>
                    {viewingProject.authors && viewingProject.authors.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {viewingProject.authors.map((auth) => (
                          <div key={auth.id} className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
                            <div className="font-bold text-slate-900 flex items-center space-x-2">
                              <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-[10px]">
                                {auth.first_name[0]}{auth.last_name[0]}
                              </span>
                              <span>{auth.first_name} {auth.last_name}</span>
                            </div>
                            {auth.university_affiliation && (
                              <div className="text-slate-600 text-[11px] font-medium">{auth.university_affiliation}</div>
                            )}
                            {auth.orcid && (
                              <div className="text-emerald-700 text-[10px] font-mono flex items-center">
                                <IdCard className="w-3 h-3 mr-1" /> ORCID: {auth.orcid}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 italic">
                        Sin autores asociados a este proyecto RSL.
                      </div>
                    )}
                  </div>

                  {/* Objetivos de Investigación */}
                  {viewingProject.extra_metadata?.objectives &&
                    Object.keys(viewingProject.extra_metadata.objectives).length > 0 && (
                      <div className="space-y-2 pt-3 border-t border-slate-100">
                        <div className="font-bold text-slate-600 uppercase tracking-wider text-[10px] flex items-center">
                          <Target className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                          Objetivos de Investigación:
                        </div>
                        <div className="space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
                          {Object.entries(viewingProject.extra_metadata.objectives).map(([key, val]) => (
                            <div key={key} className="flex items-start space-x-2 text-slate-700">
                              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono font-bold text-[10px]">
                                {key}
                              </span>
                              <span className="leading-snug">{val}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Criterios de Elegibilidad PRISMA 2020 */}
                  {viewingProject.extra_metadata?.eligibility_criteria && (
                    <div className="space-y-3 pt-3 border-t border-slate-100">
                      <div className="font-bold text-slate-600 uppercase tracking-wider text-[10px] flex items-center">
                        <FileCheck className="w-3.5 h-3.5 mr-1.5 text-orange-600" />
                        Criterios de Elegibilidad:
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-200 space-y-1.5">
                          <div className="font-bold text-emerald-800 text-[11px] uppercase flex items-center">
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                            Criterios de Inclusión
                          </div>
                          {viewingProject.extra_metadata.eligibility_criteria.inclusion &&
                          viewingProject.extra_metadata.eligibility_criteria.inclusion.length > 0 ? (
                            <ul className="list-disc list-inside space-y-1 text-slate-700 text-[11px]">
                              {viewingProject.extra_metadata.eligibility_criteria.inclusion.map((item, i) => (
                                <li key={i}>{item}</li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-slate-400 italic text-[10px]">Sin especificar</span>
                          )}
                        </div>

                        <div className="bg-orange-50/60 p-3 rounded-xl border border-orange-200 space-y-1.5">
                          <div className="font-bold text-orange-800 text-[11px] uppercase flex items-center">
                            <FileX className="w-3.5 h-3.5 mr-1 text-orange-600" />
                            Criterios de Exclusión
                          </div>
                          {viewingProject.extra_metadata.eligibility_criteria.exclusion &&
                          viewingProject.extra_metadata.eligibility_criteria.exclusion.length > 0 ? (
                            <ul className="list-disc list-inside space-y-1 text-slate-700 text-[11px]">
                              {viewingProject.extra_metadata.eligibility_criteria.exclusion.map((item, i) => (
                                <li key={i}>{item}</li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-slate-400 italic text-[10px]">Sin especificar</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* System Metadata */}
                  <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-4 text-slate-500 font-mono text-[11px]">
                    <div>
                      <span className="text-slate-400">UUID Proyecto:</span>
                      <div className="text-slate-800 truncate font-semibold">{viewingProject.id}</div>
                    </div>
                    <div>
                      <span className="text-slate-400">Fecha de Creación:</span>
                      <div className="text-slate-800 font-semibold">{new Date(viewingProject.created_at).toLocaleString()}</div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end">
                  <button
                    onClick={() => setViewingProject(null)}
                    className="btn-outline-theme text-xs py-2 px-4"
                  >
                    Cerrar
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* MODAL ELIMINAR PROYECTO */}
      {isDeleteModalOpen && projectToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-rose-200 rounded-2xl max-w-md w-full p-4 sm:p-6 shadow-2xl space-y-4 my-auto">
            <div className="flex items-center space-x-3 text-rose-700">
              <AlertCircle className="w-6 h-6 flex-shrink-0 text-rose-600" />
              <h3 className="text-base font-bold">¿Eliminar Proyecto RSL?</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Esta acción eliminará permanentemente el proyecto{' '}
              <strong className="text-slate-900">"{projectToDelete.title}"</strong> y sus asociaciones.
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
