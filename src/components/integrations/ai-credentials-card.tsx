import { useEffect, useState } from "react";
import { Bot, Check, Loader2, Trash2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Os três provedores suportados. A ordem aqui é a ordem que aparece na tela.
const PROVIDERS = [
  {
    id: "openai",
    name: "OpenAI",
    blurb: "Modelos GPT (ChatGPT). A chave começa com “sk-”.",
    link: "https://platform.openai.com/api-keys",
    placeholder: "sk-…",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    blurb: "Modelos Gemini do Google. Crie a chave no Google AI Studio.",
    link: "https://aistudio.google.com/apikey",
    placeholder: "AIza…",
  },
  {
    id: "claude",
    name: "Anthropic Claude",
    blurb: "Modelos Claude da Anthropic. A chave começa com “sk-ant-”.",
    link: "https://console.anthropic.com/settings/keys",
    placeholder: "sk-ant-…",
  },
] as const;

type ProviderId = (typeof PROVIDERS)[number]["id"];

type ProviderState = {
  configured: boolean;
  masked: string | null;
  isActive: boolean;
  updatedAt: string | null;
};

type ProvidersMap = Record<string, ProviderState>;

export function AiCredentialsCard({ orgId }: { orgId: string | null }) {
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<ProvidersMap>({});

  // Rascunho de chave digitada por provedor (antes de salvar).
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Mostrar/ocultar o texto digitado, por provedor.
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  // Provedor em ação (salvando/removendo) — trava os botões da linha.
  const [busyId, setBusyId] = useState<string | null>(null);

  async function carregar() {
    if (!orgId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-credentials", {
        body: { action: "list", orgId },
      });
      if (error || !data?.ok) {
        toast.error("Não foi possível carregar as chaves de IA", {
          description: data?.error ?? error?.message,
        });
        return;
      }
      setProviders((data.providers ?? {}) as ProvidersMap);
    } catch (e) {
      toast.error("Não foi possível carregar as chaves de IA", {
        description: String((e as Error)?.message ?? e),
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function salvar(provider: ProviderId) {
    const apiKey = (drafts[provider] ?? "").trim();
    if (!apiKey) {
      toast.error("Cole a chave antes de salvar.");
      return;
    }
    setBusyId(provider);
    try {
      const { data, error } = await supabase.functions.invoke("ai-credentials", {
        body: { action: "save", orgId, provider, apiKey },
      });
      if (error || !data?.ok) {
        toast.error("Não foi possível salvar a chave", {
          description: data?.error ?? error?.message,
        });
        return;
      }
      toast.success("Chave salva.");
      setDrafts((d) => ({ ...d, [provider]: "" }));
      setReveal((r) => ({ ...r, [provider]: false }));
      await carregar();
    } finally {
      setBusyId(null);
    }
  }

  async function remover(provider: ProviderId) {
    setBusyId(provider);
    try {
      const { data, error } = await supabase.functions.invoke("ai-credentials", {
        body: { action: "remove", orgId, provider },
      });
      if (error || !data?.ok) {
        toast.error("Não foi possível remover a chave", {
          description: data?.error ?? error?.message,
        });
        return;
      }
      toast.success("Chave removida.");
      await carregar();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-blue/10 text-brand-blue">
          <Bot className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">Chaves de Inteligência Artificial</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Cadastre as chaves dos provedores de IA para usar os nós de IA nos seus fluxos de chatbot. A chave fica
            guardada com segurança no servidor e nunca é exibida de novo por completo.
          </p>

          {loading ? (
            <p className="mt-4 text-sm text-muted-foreground">Carregando…</p>
          ) : (
            <div className="mt-4 space-y-4">
              {PROVIDERS.map((p) => {
                const st = providers[p.id];
                const configured = st?.configured === true;
                const isBusy = busyId === p.id;
                const draft = drafts[p.id] ?? "";
                const isRevealed = reveal[p.id] === true;
                return (
                  <div key={p.id} className="rounded-lg border border-border p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{p.name}</span>
                          {configured && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-500/15 dark:text-green-300">
                              <Check className="h-3 w-3" /> Configurada
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{p.blurb}</p>
                      </div>
                      {configured && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                          onClick={() => remover(p.id)}
                          disabled={isBusy}
                          title="Remover chave"
                        >
                          {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
                      )}
                    </div>

                    {configured && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Chave atual: <span className="font-mono text-foreground">{st?.masked}</span>
                      </p>
                    )}

                    <div className="mt-3 space-y-2">
                      <Label htmlFor={`ai-key-${p.id}`}>
                        {configured ? "Substituir chave" : "Colar chave"}
                      </Label>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Input
                            id={`ai-key-${p.id}`}
                            type={isRevealed ? "text" : "password"}
                            value={draft}
                            onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                            placeholder={p.placeholder}
                            autoComplete="off"
                            spellCheck={false}
                            className="pr-9 font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => setReveal((r) => ({ ...r, [p.id]: !isRevealed }))}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            tabIndex={-1}
                            title={isRevealed ? "Ocultar" : "Mostrar"}
                          >
                            {isRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        <Button size="sm" onClick={() => salvar(p.id)} disabled={isBusy || !draft.trim()}>
                          {isBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                          Salvar
                        </Button>
                      </div>
                      <a
                        href={p.link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block text-xs text-brand-blue hover:underline"
                      >
                        Onde consigo essa chave?
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
