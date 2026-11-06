"""Secciones que se desarrollan mediante guías, sin acciones automáticas de IA."""
GUIDED_SYNTHESIS_SECTIONS = frozenset({"RESULTS_OBJECTIVE", "DISCUSSION", "CONCLUSIONS"})


def is_guided_synthesis_section(section_type: str) -> bool:
    return section_type in GUIDED_SYNTHESIS_SECTIONS
