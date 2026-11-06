import type { AIProviderCatalogItem } from '../../services/screeningService';

export const DEFAULT_AI_PROVIDER = 'deepseek';
export const DEFAULT_AI_MODEL = 'deepseek-v4-pro';
export type AiModelSelectionUsage = 'analysis' | 'drafting';

export function filterAiModelCatalog(
  catalog: AIProviderCatalogItem[],
  usage: AiModelSelectionUsage,
): AIProviderCatalogItem[] {
  return catalog.flatMap((provider) => {
    const allowedModel = provider.provider === DEFAULT_AI_PROVIDER
      ? DEFAULT_AI_MODEL
      : usage === 'drafting' && provider.provider === 'openai'
        ? 'gpt-5.6-terra'
        : undefined;
    const models = provider.models.filter((model) => model.id === allowedModel);
    return models.length ? [{ ...provider, models }] : [];
  });
}
