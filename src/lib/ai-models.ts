// Lista de modelos por provedor, para os seletores de IA (módulo Agentes e nó
// de IA dos fluxos). Os nomes técnicos (id) são o que as APIs esperam; o label
// é amigável. O usuário também pode digitar um modelo "Outro" se surgir um novo.

export type AiProviderId = "openai" | "gemini" | "claude";

export type AiModelOption = { id: string; label: string; note?: string };

export const AI_MODELS: Record<AiProviderId, AiModelOption[]> = {
  openai: [
    { id: "gpt-4o-mini", label: "GPT-4o mini", note: "Rápido e econômico (recomendado)" },
    { id: "gpt-4o", label: "GPT-4o", note: "Mais capaz" },
    { id: "gpt-4.1-mini", label: "GPT-4.1 mini", note: "Econômico, geração 4.1" },
    { id: "gpt-4.1", label: "GPT-4.1", note: "Mais capaz, geração 4.1" },
  ],
  gemini: [
    { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash", note: "Rápido e econômico (recomendado)" },
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", note: "Geração 2.0, rápido" },
    { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro", note: "Mais capaz" },
  ],
  claude: [
    { id: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku", note: "Rápido e econômico (recomendado)" },
    { id: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet", note: "Mais capaz" },
    { id: "claude-3-7-sonnet-latest", label: "Claude 3.7 Sonnet", note: "Geração 3.7, mais capaz" },
  ],
};

// Primeiro modelo da lista do provedor (o recomendado), ou "" se desconhecido.
export function defaultModelFor(provider: string): string {
  const list = AI_MODELS[provider as AiProviderId];
  return list && list.length ? list[0].id : "";
}

// O modelo está na lista conhecida daquele provedor?
export function isKnownModel(provider: string, model: string): boolean {
  const list = AI_MODELS[provider as AiProviderId];
  return !!list && list.some((m) => m.id === model);
}
