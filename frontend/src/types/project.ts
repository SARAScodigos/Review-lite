export interface Author {
  id: number;
  first_name: string;
  last_name: string;
  orcid?: string | null;
  university_affiliation?: string | null;
  institutional_email?: string | null;
  address?: string | null;
  dni?: string | null;
  signature_url?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AuthorCreate {
  first_name: string;
  last_name: string;
  orcid?: string;
  university_affiliation?: string;
  institutional_email?: string;
  address?: string;
  dni?: string;
}

export interface AuthorUpdate {
  first_name?: string;
  last_name?: string;
  orcid?: string;
  university_affiliation?: string;
  institutional_email?: string;
  address?: string;
  dni?: string;
}

export interface AuthorWithProjects extends Author {
  projects?: RSLProject[];
}

export interface ProjectObjectives {
  [key: string]: string; // e.g. "OB1": "...", "OB2": "..."
}

export interface ProjectEligibilityCriteria {
  inclusion?: string[];
  exclusion?: string[];
}

export interface JournalInfo {
  journal_name?: string;
  journal_link?: string;
  is_special_issue?: boolean;
  special_issue_details?: string;
}

export interface ProjectExtraMetadata {
  journal_info?: JournalInfo;
  project_comment?: string;
  objectives?: ProjectObjectives;
  eligibility_criteria?: ProjectEligibilityCriteria;
  [key: string]: any;
}

export interface RSLProject {
  id: string;
  title: string;
  variables?: string[] | null;
  geographic_scope?: string | null;
  extra_metadata?: ProjectExtraMetadata | null;
  created_at: string;
  updated_at: string;
  authors?: Author[];
}

export interface RSLProjectCreate {
  title: string;
  variables?: string[];
  geographic_scope?: string;
  extra_metadata?: ProjectExtraMetadata;
  author_ids?: number[];
}

export interface RSLProjectUpdate {
  title?: string;
  variables?: string[];
  geographic_scope?: string;
  extra_metadata?: ProjectExtraMetadata;
  author_ids?: number[];
}
