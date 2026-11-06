"""
Paquete de Servicios de Síntesis y Redacción Científica asistida por IA (Hito 5).
"""
from app.api.services.synthesis.discussion_conclusions_service import (
    draft_discussion_or_conclusions_section_with_ai,
)
from app.api.services.synthesis.prisma_methodology_service import (
    draft_prisma_methodology_section_with_ai,
    gather_prisma_inputs_from_db,
)
from app.api.services.synthesis.results_objective_service import (
    evaluate_results_objective_eligibility_and_columns_with_ai,
    draft_objective_results_from_table_with_ai,
    identify_objective_candidate_ids_with_ai,
    recommend_objective_columns_with_ai,
    generate_objective_results_unified_with_ai,
)
from app.api.services.synthesis.section_drafting_service import (
    draft_intro_or_theory_section_with_ai,
)
from app.api.services.synthesis.section_eligibility_service import (
    evaluate_section_eligibility_with_ai,
    get_matrix_columns_for_eligibility,
    prepare_trimmed_matrix_for_eligibility,
)

__all__ = [
    "get_matrix_columns_for_eligibility",
    "prepare_trimmed_matrix_for_eligibility",
    "evaluate_section_eligibility_with_ai",
    "draft_intro_or_theory_section_with_ai",
    "evaluate_results_objective_eligibility_and_columns_with_ai",
    "draft_objective_results_from_table_with_ai",
    "recommend_objective_columns_with_ai",
    "identify_objective_candidate_ids_with_ai",
    "generate_objective_results_unified_with_ai",
    "gather_prisma_inputs_from_db",
    "draft_prisma_methodology_section_with_ai",
    "draft_discussion_or_conclusions_section_with_ai",
]
