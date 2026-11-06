import React, { useState, useEffect } from 'react';
import { Sparkles, Cpu, Sliders, CheckCircle2, Lock } from 'lucide-react';
import { screeningService } from '../../services/screeningService';
import type { AIProviderCatalogItem } from '../../services/screeningService';
import { DEFAULT_AI_MODEL, filterAiModelCatalog } from './aiModelSelection';
import type { AiModelSelectionUsage } from './aiModelSelection';

interface AiModelSelectorBlockProps {
  provider: string;
  model: string;
  temperature: number;
  onChange: (config: { provider: string; model: string; temperature: number }) => void;
  usage?: AiModelSelectionUsage;
  disabled?: boolean;
  compact?: boolean;
  displayOnly?: boolean;
  title?: string;
  description?: string;
}

export interface TemperatureRange {
  min: number;
  max: number;
  step: number;
  isFixed: boolean;
  fixedValue?: number;
  isDeprecated?: boolean;
  description: string;
}

/**
 * Matriz Oficial de Restricciones de Temperatura por Proveedor y Modelo.
 * Evita errores HTTP 400/502 en:
 *  - Anthropic: "`temperature` is deprecated for this model"
 *  - OpenAI: "Unsupported value: 'temperature' does not support 0.1 with this model. Only default (1) supported"
 *  - DeepSeek: Rangos recomendados para R1 / Reasoner vs V3 / Chat
 *  - Gemini: Modelos de razonamiento Thinking vs Estándar
 */
export function getTemperatureRangeForModel(provider: string, modelId: string): TemperatureRange {
  const prov = (provider || '').toLowerCase();
  const id = (modelId || '').toLowerCase();

  // 1. ANTHROPIC (CLAUDE)
  // Anthropic ha marcado 'temperature' como deprecada en sus modelos recientes.
  // Enviar cualquier valor como 0.1 / 0.2 devuelve HTTP 400 "`temperature` is deprecated for this model".
  if (prov === 'anthropic' || prov === 'claude') {
    return {
      min: 1.0,
      max: 1.0,
      step: 0.1,
      isFixed: true,
      fixedValue: 1.0,
      isDeprecated: true,
      description: 'Temperatura desaconsejada/fija (1.0) por Anthropic API para este modelo',
    };
  }

  // 2. OPENAI
  // Modelos de razonamiento (o1, o3) y modelos/alias personalizados (Luna, Terra, Sol, etc.) rechazan temperatura != 1.0
  // devolviendo HTTP 400 "Unsupported value: 'temperature' does not support 0.1 with this model. Only default (1) supported".
  if (prov === 'openai') {
    const isStandardGpt = (id === 'gpt-4o' || id === 'gpt-4o-mini' || id === 'gpt-4' || id === 'gpt-3.5-turbo');

    if (!isStandardGpt) {
      return {
        min: 1.0,
        max: 1.0,
        step: 0.1,
        isFixed: true,
        fixedValue: 1.0,
        description: 'Temperatura fija (1.0) requerida por OpenAI para este modelo',
      };
    }

    return {
      min: 0.0,
      max: 2.0,
      step: 0.05,
      isFixed: false,
      description: 'OpenAI GPT-4o / GPT-4 (Rango 0.0 - 2.0. Predeterminado 1.0)',
    };
  }

  // 3. DEEPSEEK
  if (prov === 'deepseek') {
    if (id.includes('reasoner') || id.includes('r1')) {
      return {
        min: 0.5,
        max: 0.7,
        step: 0.05,
        isFixed: false,
        description: 'DeepSeek R1 / Reasoner (Recomendado 0.5 - 0.7)',
      };
    }
    return {
      min: 0.0,
      max: 1.5,
      step: 0.05,
      isFixed: false,
      description: 'DeepSeek V4 Pro (Recomendado 0.1 - 0.3 para extracción)',
    };
  }

  // 4. GOOGLE GEMINI
  if (prov === 'google' || prov === 'gemini') {
    if (id.includes('thinking') || id.includes('reasoning')) {
      return {
        min: 1.0,
        max: 1.0,
        step: 0.1,
        isFixed: true,
        fixedValue: 1.0,
        description: 'Temperatura fija (1.0) para modelos de razonamiento Gemini',
      };
    }
    return {
      min: 0.0,
      max: 2.0,
      step: 0.05,
      isFixed: false,
      description: 'Google Gemini (Rango 0.0 - 2.0)',
    };
  }

  // 5. OTROS PROVEEDORES (Groq, Mistral, Ollama, Cohere, etc.)
  return {
    min: 0.0,
    max: 1.0,
    step: 0.05,
    isFixed: false,
    description: 'Fidelidad científica (0.0 Preciso, 1.0 Creativo)',
  };
}

export function sanitizeTemperature(provider: string, modelId: string, currentTemp: number): number {
  const range = getTemperatureRangeForModel(provider, modelId);
  if (range.isFixed && range.fixedValue !== undefined) {
    return range.fixedValue;
  }
  if (isNaN(currentTemp)) return range.min;
  if (currentTemp < range.min) return range.min;
  if (currentTemp > range.max) return range.max;
  return currentTemp;
}

export const AiModelSelectorBlock: React.FC<AiModelSelectorBlockProps> = ({
  provider,
  model,
  temperature,
  onChange,
  usage = 'analysis',
  disabled = false,
  compact = false,
  displayOnly = false,
  title = 'Parámetros Dinámicos de Inteligencia Artificial',
  description = 'Selecciona el proveedor de LLM, la arquitectura del modelo y la temperatura deseada.',
}) => {
  const [catalog, setCatalog] = useState<AIProviderCatalogItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    const fetchCatalog = async () => {
      try {
        const catData = await screeningService.getAIModelsCatalog();
        if (!isMounted) return;
        setCatalog(filterAiModelCatalog(catData, usage));
      } catch (err) {
        console.error('Error cargando catálogo de IA:', err);
      } finally {
        if (isMounted) setLoadingCatalog(false);
      }
    };

    fetchCatalog();
    return () => {
      isMounted = false;
    };
  }, [usage]);

  useEffect(() => {
    if (loadingCatalog || catalog.length === 0) return;
    const selectedProvider = catalog.find((item) => item.provider === provider)
      || catalog.find((item) => item.provider === 'deepseek')
      || catalog[0];
    const selectedModel = selectedProvider.models.find((item) => item.id === model)
      || selectedProvider.models[0];
    const validTemp = sanitizeTemperature(selectedProvider.provider, selectedModel.id, temperature);
    if (provider !== selectedProvider.provider || model !== selectedModel.id || temperature !== validTemp) {
      onChange({ provider: selectedProvider.provider, model: selectedModel.id, temperature: validTemp });
    }
  }, [catalog, loadingCatalog, provider, model, temperature, onChange]);

  const handleProviderChange = (newProvider: string) => {
    const provObj = catalog.find((c) => c.provider === newProvider);
    const targetModel = provObj && provObj.models.length > 0
      ? (provObj.models.find((m) => m.is_default_for_screening)?.id || provObj.models[0].id)
      : DEFAULT_AI_MODEL;

    const validTemp = sanitizeTemperature(newProvider, targetModel, temperature);

    onChange({
      provider: newProvider,
      model: targetModel,
      temperature: validTemp,
    });
  };

  const handleModelChange = (newModel: string) => {
    const validTemp = sanitizeTemperature(provider, newModel, temperature);
    onChange({
      provider,
      model: newModel,
      temperature: validTemp,
    });
  };

  const handleTemperatureChange = (newTemp: number) => {
    const validTemp = sanitizeTemperature(provider, model, newTemp);
    onChange({
      provider,
      model,
      temperature: validTemp,
    });
  };

  const currentProviderObj = catalog.find((c) => c.provider === provider);
  const currentModelObj = currentProviderObj?.models.find((m) => m.id === model);
  const tempRange = getTemperatureRangeForModel(provider, model);

  if (displayOnly) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Cpu aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
        <span>Modelo en uso: <span className="font-medium text-slate-700">{currentModelObj?.name || (model === DEFAULT_AI_MODEL ? 'DeepSeek V4 Pro' : model)}</span></span>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs text-xs">
        <div className="flex items-center space-x-1.5 font-bold text-slate-800">
          <Sparkles className="w-4 h-4 text-emerald-600" />
          <span>IA:</span>
        </div>

        {/* PROVEEDOR */}
        <select
          value={provider}
          onChange={(e) => handleProviderChange(e.target.value)}
          disabled={disabled || loadingCatalog}
          className="input-theme py-1 px-2 text-xs font-semibold"
        >
          {catalog.map((c) => (
            <option key={c.provider} value={c.provider}>
              {c.display_name} {!c.is_configured ? '(Sin API Key)' : ''}
            </option>
          ))}
        </select>

        {/* MODELO */}
        <select
          value={model}
          onChange={(e) => handleModelChange(e.target.value)}
          disabled={disabled || loadingCatalog}
          className="input-theme py-1 px-2 text-xs font-mono"
        >
          {(currentProviderObj?.models || []).map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} {m.is_default_for_screening ? '★' : ''}
            </option>
          ))}
        </select>

        {/* TEMPERATURA */}
        <div className="flex items-center space-x-2 border-l border-slate-200 pl-3">
          <span className="text-[11px] text-slate-500 font-medium flex items-center space-x-1">
            {tempRange.isFixed && <Lock className="w-3 h-3 text-amber-600 inline" />}
            <span>Temp: {temperature.toFixed(2)}</span>
          </span>
          <input
            type="range"
            min={tempRange.min}
            max={tempRange.max}
            step={tempRange.step}
            value={temperature}
            onChange={(e) => handleTemperatureChange(parseFloat(e.target.value))}
            disabled={disabled || tempRange.isFixed}
            className="w-20 accent-emerald-600 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50/90 rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4 shadow-2xs">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span>{title}</span>
          </h3>
          {description && <p className="text-[11px] text-slate-500 mt-0.5">{description}</p>}
        </div>

        {currentModelObj && (
          <div className="flex items-center space-x-1.5 bg-emerald-100/70 border border-emerald-200 px-2.5 py-1 rounded-full text-[10px] text-emerald-900 font-bold">
            <CheckCircle2 className="w-3 h-3 text-emerald-700" />
            <span>{currentModelObj.name}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        {/* PROVEEDOR */}
        <div className="space-y-1.5">
          <label className="font-bold text-slate-700 flex items-center space-x-1">
            <Cpu className="w-3.5 h-3.5 text-emerald-600" />
            <span>Proveedor de LLM</span>
          </label>
          <select
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value)}
            disabled={disabled || loadingCatalog}
            className="input-theme w-full py-2 px-3 text-xs font-semibold bg-white"
          >
            {catalog.map((c) => (
              <option key={c.provider} value={c.provider}>
                {c.display_name} {!c.is_configured ? '(Falta API Key)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* MODELO */}
        <div className="space-y-1.5">
          <label className="font-bold text-slate-700 flex items-center space-x-1">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>Modelo de Extracción / Redacción</span>
          </label>
          <select
            value={model}
            onChange={(e) => handleModelChange(e.target.value)}
            disabled={disabled || loadingCatalog}
            className="input-theme w-full py-2 px-3 text-xs font-mono bg-white"
          >
            {(currentProviderObj?.models || []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} {m.is_default_for_screening ? '★ (Recomendado)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* TEMPERATURA SLIDER / RANGOS DINÁMICOS */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center font-bold text-slate-700">
            <label className="flex items-center space-x-1">
              <Sliders className="w-3.5 h-3.5 text-emerald-600" />
              <span>Temperatura (Fidelidad Científica)</span>
            </label>
            <span className={`font-mono text-[11px] px-1.5 py-0.5 rounded border ${
              tempRange.isFixed
                ? 'bg-amber-100 text-amber-900 border-amber-300 font-bold'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}>
              {temperature.toFixed(2)}
            </span>
          </div>

          <input
            type="range"
            min={tempRange.min}
            max={tempRange.max}
            step={tempRange.step}
            value={temperature}
            onChange={(e) => handleTemperatureChange(parseFloat(e.target.value))}
            disabled={disabled || tempRange.isFixed}
            className="w-full accent-emerald-600 cursor-pointer pt-1 disabled:opacity-40 disabled:cursor-not-allowed"
          />

          <div className="flex justify-between text-[9px] text-slate-500 font-medium">
            {tempRange.isFixed ? (
              <span className="text-amber-700 font-bold flex items-center space-x-1">
                <Lock className="w-3 h-3 text-amber-600 inline mr-0.5" />
                <span>{tempRange.description}</span>
              </span>
            ) : (
              <>
                <span>{tempRange.min.toFixed(1)} (Preciso / Determinista)</span>
                <span>{tempRange.max.toFixed(1)} (Creativo)</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AiModelSelectorBlock;
