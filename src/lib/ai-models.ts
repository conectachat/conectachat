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
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", note: "Rápido e econômico (recomendado)" },
    { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite", note: "O mais econômico" },
    { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro", note: "Mais capaz" },
  ],
  claude: [
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", note: "Rápido e econômico (recomendado)" },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", note: "Equilíbrio (mais capaz)" },
    { id: "claude-opus-4-8", label: "Claude Opus 4.8", note: "O mais capaz" },
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
