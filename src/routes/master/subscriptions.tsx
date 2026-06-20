import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CreditCard } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/shared/page-header";

export const Route = createFileRoute("/master/subscriptions")({
  head: () => ({ meta: [{ title: "Assinaturas — ConectaChat" }] }),
  component: MasterSubscriptionsPage,
});

type SubRow = {
  id: string;
  status: string;
  current_period_end: string | null;
  created_at: string;
  org_name: string | null;
  org_slug: string | null;
  plan_name: string | null;
  price_cents: number | null;
  currency: string | null;
};

const SUB_META: Record<string, { label: string; cls: string }> = {
  trialing: { label: "Em teste", cls: "bg-blue-100 text-blue-700" },
  active: { label: "Ativa", cls: "bg-green-100 text-green-700" },
  past_due: { label: "Pagamento atrasado", cls: "bg-red-100 text-red-700" },
  canceled: { label: "Cancelada", cls: "bg-gray-100 text-gray-600" },
  incomplete: { label: "Incompleta", cls: "bg-amber-100 text-amber-700" },
};

function formatPrice(cents: number | null, currency: string | null) {
  if (cents == null) return "—";
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL" }).format(cents / 100);
  } catch {
    return `${currency ?? ""} ${(cents / 100).toFixed(2)}`;
  }
}
function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
}

function MasterSubscriptionsPage() {
  const q = useQuery({
    queryKey: ["master-subscriptions"],
    queryFn: async (): Promise<SubRow[]> => {
      const { data, error } = await supabase.functions.invoke("master-subscriptions", { body: {} });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error ?? "Falha ao listar assinaturas");
      return (data.subscriptions ?? []) as SubRow[];
    },
  });

  const rows = q.data ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-gray-50 dark:bg-background">
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-5xl">
          <PageHeader title="Assinaturas" subtitle="Área da plataforma — todas as assinaturas dos clientes." />

          {q.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : q.isError ? (
            <p className="text-sm text-red-600">Não foi possível carregar. {(q.error as Error)?.message}</p>
          ) : rows.length === 0 ? (
            <div className="mx-auto max-w-md rounded-lg border border-dashed border-border bg-card p-8 text-center">
              <div
                className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full"
                style={{ backgroundColor: "#0055A620" }}
              >
                <CreditCard className="h-5 w-5" style={{ color: "#0055A6" }} />
              </div>
              <h3 className="text-base font-semibold text-foreground">Nenhuma assinatura ainda</h3>
              <p className="mt-1 text-sm text-muted-foreground">As assinaturas dos clientes aparecem aqui.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((s) => {
                const meta = SUB_META[s.status] ?? { label: s.status, cls: "bg-gray-100 text-gray-600" };
                return (
                  <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md"
                      style={{ backgroundColor: "#0055A61A", color: "#0055A6" }}
                    >
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{s.org_name ?? "—"}</span>
                        {s.plan_name && <span className="text-xs text-muted-foreground">· {s.plan_name}</span>}
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}>
                          {meta.label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Renova em {formatDate(s.current_period_end)} · desde {formatDate(s.created_at)}
                      </p>
                    </div>
                    <span className="ml-auto whitespace-nowrap text-sm font-semibold text-foreground">
                      {formatPrice(s.price_cents, s.currency)}
                      <span className="ml-1 text-[11px] font-normal text-muted-foreground">/mês</span>
                    </span>
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
