/* eslint-disable @typescript-eslint/no-explicit-any */
// =====================================================================
//  Card do Calendly no Marketplace (Fase C / C1).
//  - Não conectado: explicação + botão "Conectar Calendly" (chama a
//    Edge Function calendly-oauth-start e redireciona o navegador).
//  - Conectado: selo do plano detectado (Light / Pro), status e
//    botão "Desconectar" (chama calendly-disconnect).
//  A tabela calendly_connections ainda não está no types.ts → acesso
//  via (supabase as any), padrão do projeto (CLAUDE.md §8).
// =====================================================================
import { useEffect, useState } from "react";
import { CalendarClock, Check, Loader2, AlertTriangle, Unlink } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type Connection = {
  plan_tier: "light" | "pro";
  status: "active" | "revoked" | "error";
  calendly_user_uri: string | null;
  organization_uri: string | null;
  updated_at: string | null;
};

const sb = supabase as any;

export function CalendlyCard({ orgId }: { orgId: string | null }) {
  const [loading, setLoading] = useState(true);
  const [conn, setConn] = useState<Connection | null>(null);
  const [busy, setBusy] = useState(false);

  async function carregar() {
    if (!orgId) return;
    setLoading(true);
    try {
      const { data, error } = await sb
        .from("calendly_connections")
        .select("plan_tier, status, calendly_user_uri, organization_uri, updated_at")
        .eq("org_id", orgId)
        .maybeSingle();
      if (error) throw error;
      setConn((data as Connection) ?? null);
    } catch (e) {
      toast.error("Não foi possível carregar a conexão do Calendly", {
        description: String((e as Error)?.message ?? e),
      });
    } finally {
      setLoading(false);
    }
  }

  // Mostra o resultado do retorno do OAuth (?connected / ?error) e limpa a URL.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("connected")) {
      const plan = q.get("plan");
      toast.success(plan === "pro" ? "Calendly conectado (plano Pro)." : "Calendly conectado.");
    } else if (q.get("error")) {
      toast.error("Falha ao conectar o Calendly.", { description: q.get("error") ?? undefined });
    }
    if (q.get("connected") || q.get("error")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function conectar() {
    if (!orgId) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("calendly-oauth-start", {
        body: { orgId },
      });
      if (error || !data?.ok || !data?.url) {
        toast.error("Não foi possível iniciar a conexão", {
          description: data?.error ?? error?.message,
        });
        setBusy(false);
        return;
      }
      // Redireciona o navegador para a autorização do Calendly.
      window.location.href = data.url as string;
    } catch (e) {
      toast.error("Não foi possível iniciar a conexão", {
        description: String((e as Error)?.message ?? e),
      });
      setBusy(false);
    }
  }

  async function desconectar() {
    if (!orgId) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("calendly-disconnect", {
        body: { orgId },
      });
      if (error || !data?.ok) {
        toast.error("Não foi possível desconectar", { description: data?.error ?? error?.message });
        return;
      }
      toast.success("Calendly desconectado.");
      setConn(null);
      await carregar();
    } finally {
      setBusy(false);
    }
  }

  const isPro = conn?.plan_tier === "pro";
  const hasError = conn?.status === "error";

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-green/10 text-brand-green">
          <CalendarClock className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">Conexão do Calendly</h3>

          {loading ? (
            <p className="mt-2 text-sm text-muted-foreground">Carregando…</p>
          ) : conn ? (
            <div className="mt-2 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-500/15 dark:text-green-300">
                  <Check className="h-3 w-3" /> Conectado
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    isPro
                      ? "bg-brand-blue/10 text-brand-blue"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  Plano {isPro ? "Pro" : "Light"}
                </span>
                {hasError && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                    <AlertTriangle className="h-3 w-3" /> Reconecte
                  </span>
                )}
              </div>

              <p className="text-sm text-muted-foreground">
                {isPro
                  ? "Conta paga: agendamento nativo, sincronização instantânea e automação no fluxo ficam disponíveis."
                  : "Conta grátis: agendar pela página do Calendly na conversa + confirmação e lembrete pelo WhatsApp. Conecte um Calendly pago para liberar agendamento nativo e sincronização instantânea."}
              </p>

              <Button variant="outline" size="sm" onClick={desconectar} disabled={busy} className="gap-1">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
                Desconectar
              </Button>
            </div>
          ) : (
            <div className="mt-2 space-y-3">
              <p className="text-sm text-muted-foreground">
                Conecte sua conta Calendly para agendar reuniões dentro da conversa e disparar confirmação e
                lembrete pelo WhatsApp. Detectamos automaticamente se sua conta é grátis ou paga.
              </p>
              <Button onClick={conectar} disabled={busy || !orgId} className="gap-1">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
                Conectar Calendly
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
