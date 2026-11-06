import { useEffect, useState } from 'react';
import { BookOpen, ChevronDown, Check } from 'lucide-react';
import type { RSLProject } from '../../types/project';

const GUIDED_SECTIONS = ['RESULTS_OBJECTIVE', 'DISCUSSION', 'CONCLUSIONS'];
export function isGuidedWritingSection(section: string): boolean {
  return GUIDED_SECTIONS.includes(section);
}

type GuideSection = 'RESULTS_OBJECTIVE' | 'DISCUSSION' | 'CONCLUSIONS';
interface GuideCard { title: string; points: string[]; prompt: string; }
const GUIDES: Record<GuideSection, { title: string; description: string; cards: GuideCard[] }> = {
  "RESULTS_OBJECTIVE": {
    "title": "Resultados",
    "description": "Presenta lo que encontraste, organizado por objetivo.",
    "cards": [
      {
        "title": "Organiza los hallazgos",
        "points": [
          "Agrupa las variables de la matriz que responden a este objetivo.",
          "Separa las características de los estudios de sus hallazgos cuando sea necesario."
        ],
        "prompt": "¿Qué categorías usarás y en qué orden?"
      },
      {
        "title": "Describe los patrones",
        "points": [
          "Abre cada párrafo con el hallazgo principal y precisa su alcance.",
          "Indica sobre cuántos estudios calculas cada porcentaje y si las categorías se solapan.",
          "Si un dato no se reporta, déjalo indicado."
        ],
        "prompt": "Anota el patrón, su frecuencia y alguna excepción."
      },
      {
        "title": "Prepara las tablas",
        "points": [
          "Agrupa los estudios en categorías que puedas comparar.",
          "Conserva las referencias o IDs para localizar cada dato.",
          "Incluye diferencias y contradicciones entre estudios."
        ],
        "prompt": "¿Qué compararás y qué estudios lo respaldan?"
      },
      {
        "title": "Revisa las figuras",
        "points": [
          "Menciona cada tabla o figura en el texto y explica su hallazgo.",
          "Indica datos de origen, criterios, software y significado de los elementos visuales. En redes, añade algoritmo y disposición.",
          "Contrasta los conteos con la matriz y PRISMA; revisa la legibilidad."
        ],
        "prompt": "Anota la figura que necesitas y cómo reproducirla."
      },
      {
        "title": "Revisa el apartado",
        "points": [
          "Comprueba el orden: hallazgo, alcance, evidencia y excepciones.",
          "Deja las explicaciones y las implicaciones para la Discusión.",
          "Verifica las cifras, las referencias y la respuesta al objetivo."
        ],
        "prompt": "¿Se entiende qué encontraste y con qué evidencia?"
      }
    ]
  },
  "DISCUSSION": {
    "title": "Discusión",
    "description": "Explica qué significan los hallazgos y cómo se relacionan con lo que ya se conoce.",
    "cards": [
      {
        "title": "Interpreta los hallazgos",
        "points": [
          "Centra cada bloque en un hallazgo relevante para tus objetivos.",
          "Relaciona los resultados entre objetivos sin repetir las tablas."
        ],
        "prompt": "¿Qué aporta este hallazgo a la comprensión del problema?"
      },
      {
        "title": "Compara con la literatura",
        "points": [
          "Contrasta coincidencias y diferencias con revisiones y estudios verificables.",
          "Relaciona esa comparación con el marco teórico y el problema inicial."
        ],
        "prompt": "¿Con qué estudios coincide o difiere tu revisión?"
      },
      {
        "title": "Explica las diferencias",
        "points": [
          "Revisa si cambian el contexto, la población, el diseño o las medidas.",
          "Distingue una explicación posible de una demostrada.",
          "Ten en cuenta la calidad de los estudios y la incertidumbre."
        ],
        "prompt": "¿Qué puede explicar la diferencia y qué sigue sin saberse?"
      },
      {
        "title": "Precisa el aporte",
        "points": [
          "Explica qué clasificación, relación o explicación añade tu revisión.",
          "Deriva recomendaciones que estén respaldadas por los estudios.",
          "Indica a quién se aplican y en qué condiciones."
        ],
        "prompt": "Relaciona cada recomendación con el hallazgo que la respalda."
      },
      {
        "title": "Plantea lo pendiente",
        "points": [
          "Convierte los vacíos en preguntas y estudios concretos.",
          "Explica cómo las fuentes, idiomas, fechas o codificación afectaron los hallazgos.",
          "Vincula cada propuesta con la evidencia o una limitación."
        ],
        "prompt": "¿Qué falta estudiar y cómo podría investigarse?"
      }
    ]
  },
  "CONCLUSIONS": {
    "title": "Conclusiones",
    "description": "Responde a los objetivos y cierra con el aporte principal de la revisión.",
    "cards": [
      {
        "title": "Responde la pregunta inicial",
        "points": [
          "Resume la respuesta a la pregunta principal o a los objetivos.",
          "Mantén el alcance de los estudios y lo argumentado en los apartados previos."
        ],
        "prompt": "¿Qué respuesta puedes sostener con esta revisión?"
      },
      {
        "title": "Elige los hallazgos clave",
        "points": [
          "Selecciona dos o tres hallazgos y relaciónalos con los objetivos.",
          "Usa solo datos y argumentos ya desarrollados."
        ],
        "prompt": "¿Qué hallazgos necesita recordar el lector?"
      },
      {
        "title": "Explica la utilidad",
        "points": [
          "Precisa qué añade la revisión a los trabajos anteriores.",
          "Señala una aplicación teórica o práctica respaldada por la evidencia."
        ],
        "prompt": "¿A quién le sirve este aporte y en qué condiciones?"
      },
      {
        "title": "Delimita el alcance",
        "points": [
          "Relaciona cada limitación con su efecto en los resultados.",
          "Considera fuentes, idiomas, acceso a textos, fechas y diferencias entre estudios.",
          "Explica las consecuencias concretas para tus conclusiones."
        ],
        "prompt": "¿Qué limitación cambia la forma de entender tu respuesta?"
      },
      {
        "title": "Cierra el trabajo",
        "points": [
          "Propón una línea de investigación ligada a un vacío identificado.",
          "Comprueba la relación entre problema, objetivos, hallazgos y respuesta final.",
          "Ajusta la extensión y la ubicación de las limitaciones a la revista."
        ],
        "prompt": "¿Qué pregunta queda pendiente y cómo se podría abordar?"
      }
    ]
  }
};

interface GuideProgress { checked: Record<string, boolean>; notes: Record<string, string>; }
function readProgress(key: string): GuideProgress {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    return { checked: saved?.checked || {}, notes: saved?.notes || {} };
  } catch { return { checked: {}, notes: {} }; }
}

export function ManualWritingGuide({ project, section, objectives, objectiveCode, onObjectiveChange }: {
  project: RSLProject;
  section: string;
  objectives: { code: string; description: string }[];
  objectiveCode: string;
  onObjectiveChange: (code: string) => void;
}) {
  const guide = GUIDES[section as GuideSection];
  const isResults = section === 'RESULTS_OBJECTIVE';
  const storageKey = `manual-writing-v1:${project.id}:${section}:${isResults ? objectiveCode : 'all'}`;
  const [progress, setProgress] = useState<GuideProgress>(() => readProgress(storageKey));
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(progress)); setStorageError(false); }
    catch { setStorageError(true); }
  }, [storageKey, progress]);
  const total = guide.cards.reduce((sum, card) => sum + card.points.length, 0);
  const completed = guide.cards.reduce((sum, card, index) => sum + card.points.filter((_, pointIndex) => progress.checked[`${index}-${pointIndex}`]).length, 0);
  const objective = objectives.find((item) => item.code === objectiveCode);

  return (
    <section aria-label={guide.title} className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><BookOpen aria-hidden="true" className="h-4 w-4 text-emerald-700" />Guía de {guide.title.toLowerCase()}</h3>
          <span className="text-xs tabular-nums text-slate-500">{completed} de {total} revisados</span>
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-500">{guide.description}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">Usa este checklist para comprobar que {section === 'RESULTS_OBJECTIVE' ? 'tus resultados siguen' : section === 'DISCUSSION' ? 'tu discusión sigue' : 'tus conclusiones siguen'} los lineamientos de redacción. Las notas te sirven para apuntar ideas clave mientras revisas.</p>
        <progress aria-label="Recomendaciones revisadas" value={completed} max={total} className="mt-2 block h-1 w-full accent-emerald-600" />
      </div>

      {isResults ? (
        <div className="space-y-1.5">
          <label htmlFor="manual-writing-objective" className="block text-xs font-medium text-slate-700">Objetivo</label>
          <select id="manual-writing-objective" value={objectiveCode} onChange={(event) => onObjectiveChange(event.target.value)} className="input-theme w-full px-3 py-2 text-xs">
            {objectives.map((item) => <option key={item.code} value={item.code}>{item.code}: {item.description}</option>)}
          </select>
          {!objective && <p className="text-xs text-slate-500">Añade un objetivo en la configuración del proyecto.</p>}
        </div>
      ) : (
        <details className="group rounded-lg border border-slate-200 bg-white px-3 py-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs text-slate-600 [&::-webkit-details-marker]:hidden">Consultar objetivos<ChevronDown aria-hidden="true" className="h-3.5 w-3.5 transition-transform group-open:rotate-180 motion-reduce:transition-none" /></summary>
          <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-500">{objectives.map((item) => <li key={item.code}><span className="font-medium text-slate-700">{item.code}.</span> {item.description}</li>)}</ul>
        </details>
      )}

      <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {guide.cards.map((card, index) => {
          const reviewed = card.points.filter((_, pointIndex) => progress.checked[`${index}-${pointIndex}`]).length;
          const done = reviewed === card.points.length;
          return (
            <details key={card.title} className="group">
              <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3 py-3 text-xs hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 sm:px-4 [&::-webkit-details-marker]:hidden">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] ${done ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {done ? <Check aria-label="Revisado" className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span className="flex-1 font-medium text-slate-800">{card.title}</span>
                <span aria-label={`${reviewed} de ${card.points.length} recomendaciones revisadas`} className="text-[11px] tabular-nums text-slate-400">{reviewed}/{card.points.length}</span>
                {progress.notes[String(index)]?.trim() && <span className="hidden text-[10px] text-slate-400 sm:inline">Con notas</span>}
                <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
              </summary>
              <div className="px-3 pb-4 sm:pl-12 sm:pr-4">
                <ul className="space-y-2">{card.points.map((point, pointIndex) => {
                  const id = `${index}-${pointIndex}`;
                  return <li key={id}><label className="flex cursor-pointer items-start gap-2 text-xs leading-5 text-slate-600"><input type="checkbox" checked={!!progress.checked[id]} onChange={(event) => setProgress((current) => ({ ...current, checked: { ...current.checked, [id]: event.target.checked } }))} className="mt-1 shrink-0 accent-emerald-600" /><span>{point}</span></label></li>;
                })}</ul>
                <label className="mt-3 block text-xs font-medium text-slate-700">Tus notas
                  <span className="mt-1 block font-normal leading-5 text-slate-500">{card.prompt}</span>
                  <textarea rows={2} value={progress.notes[String(index)] || ''} onChange={(event) => setProgress((current) => ({ ...current, notes: { ...current.notes, [String(index)]: event.target.value } }))} placeholder="Escribe aquí…" className="input-theme mt-1.5 w-full resize-y p-2.5 text-xs font-normal leading-5" />
                </label>
              </div>
            </details>
          );
        })}
      </div>
      <p className="border-l-2 border-emerald-200 pl-2.5 text-[11px] leading-5 text-slate-500">Si falta información, vuelve a la matriz y al artículo original. La IA puede apoyar la revisión; la interpretación y las decisiones corresponden al investigador.</p>
      <p role="status" className={`text-[11px] leading-5 ${storageError ? 'text-amber-800' : 'text-slate-400'}`}>{storageError ? 'No se pudieron guardar tus notas. Copia el contenido antes de salir.' : 'Notas y avances guardados en este navegador, por sección y objetivo. No se sincronizan entre dispositivos.'}</p>
    </section>
  );
}
