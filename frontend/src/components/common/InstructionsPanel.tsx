import { useId, useState } from 'react';
import { ChevronDown, CircleHelp } from 'lucide-react';

export interface InstructionStep {
  title: string;
  description: string;
}

export interface InstructionsPanelContent {
  title: string;
  description: string;
  steps: InstructionStep[];
  note?: string;
}

interface InstructionsPanelProps extends InstructionsPanelContent {
  compact?: boolean;
}

export const InstructionsPanel = ({ title, description, steps, note, compact = false }: InstructionsPanelProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();

  return (
    <div className={`overflow-hidden rounded-xl border border-emerald-200 border-l-4 border-l-emerald-500 bg-white ${compact ? 'max-w-3xl' : ''}`}>
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="flex w-full items-center gap-2 px-3 py-3 text-left text-xs text-emerald-900 bg-emerald-50/80 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600"
      >
        <CircleHelp aria-hidden="true" className="h-5 w-5 shrink-0 text-emerald-700" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold">Instrucciones</span>
          </span>
          <span className="mt-0.5 block text-[11px] leading-4 text-emerald-800/80">Revisa los pasos de esta actividad.</span>
        </span>
        <span className="hidden max-w-[40%] truncate text-[11px] text-emerald-700 sm:block">{title}</span>
        <ChevronDown aria-hidden="true" className={`ml-auto h-3.5 w-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <section id={panelId} aria-label={title} hidden={!isOpen} className="border-t border-slate-100 px-3 pb-3 pt-2.5 sm:px-4">
        <h2 className="text-xs font-semibold text-slate-800 sm:hidden">{title}</h2>
        <p className="mb-2 text-xs leading-5 text-slate-500">{description}</p>
        <ol key={title} className="divide-y divide-slate-100">
          {steps.map((step, index) => (
            <li key={`${step.title}-${index}`}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-2 py-2 text-xs text-slate-700 transition-colors hover:text-emerald-700 focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 [&::-webkit-details-marker]:hidden">
                  <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-100 text-[10px] font-medium text-slate-500 group-open:bg-emerald-50 group-open:text-emerald-700">{index + 1}</span>
                  <h3 className="font-medium">{step.title}</h3>
                  <ChevronDown aria-hidden="true" className="ml-auto h-3 w-3 shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" />
                </summary>
                <p className="pb-2 pl-7 pr-4 text-xs leading-5 text-slate-500">{step.description}</p>
              </details>
            </li>
          ))}
        </ol>
        {note && <p className="mt-2 border-l-2 border-emerald-200 pl-2.5 text-[11px] leading-5 text-slate-500">{note}</p>}
      </section>
    </div>
  );
};
