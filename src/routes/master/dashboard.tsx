import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Building2, Activity, Sparkles, Pause, TrendingUp, MessageSquareText, KanbanSquare } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/master/dashboard")({
  head: () => ({ meta: [{ title: "Painel Master — ConectaChat" }] }),
  component: MasterDashboardPage,
});

const BLUE = "#0055A6";

type Stats = {
  total: number;
  ativas: number;
  trial: number;
  suspensas: number;
  semAssinatura: number;
  novasMes: number;
  mensagens: number;
  cards: number;
};
type Metrics = { stats: Stats; series: { mes: string; total: number }[] };

function MasterDashboardPage() {
  const q = useQuery({
    queryKey: ["master-metrics"],
    queryFn: async (): Promise<Metrics> => {
      const { data, error } = await supabase.functions.invoke("master-metrics", { body: {} });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error ?? "Falha ao carregar as métricas");
      return { stats: data.stats, series: data.series };
    },
  });

  const s = q.data?.stats;

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 md:px-8 md:py-8">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Painel Master</h1>
        <p className="text-sm text-muted-foreground">Visão geral de toda a plataforma.</p>
      </div>

      {q.isError ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
          Não foi possível carregar as métricas. {(q.error as Error)?.message}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Kpi
              accent
              loading={q.isLoading}
              icon={<Building2 className="size-4" />}
              label="Empresas"
              value={s?.total}
              hint={s ? `+${s.novasMes} este mês` : undefined}
            />
            <Kpi
              loading={q.isLoading}
              icon={<Activity className="size-4" />}
              label="Ativas"
              value={s?.ativas}
              hint={s ? `${pct(s.ativas, s.total)}% do total` : undefined}
            />
            <Kpi loading={q.isLoading} icon={<Sparkles className="size-4" />} label="Em trial" value={s?.trial} />
            <Kpi loading={q.isLoading} icon={<Pause className="size-4" />} label="Suspensas" value={s?.suspensas} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3">
            <Kpi
              loading={q.isLoading}
              icon={<TrendingUp className="size-4" />}
              label="Novas no mês"
              value={s?.novasMes}
            />
            <Kpi
              loading={q.isLoading}
              icon={<MessageSquareText className="size-4" />}
              label="Mensagens (total)"
              value={s?.mensagens}
            />
            <Kpi
              loading={q.isLoading}
              icon={<KanbanSquare className="size-4" />}
              label="Cards no funil (total)"
              value={s?.cards}
            />
          </div>

          <div className="rounded-2xl border border-hairline bg-card p-5 shadow-[var(--shadow-card)]">
            <h2 className="text-[15px] font-semibold">Crescimento de empresas</h2>
            <p className="mb-3 text-xs text-muted-foreground">últimos 12 meses (acumulado)</p>
            {q.isLoading ? (
              <div className="grid h-[260px] place-items-center text-sm text-muted-foreground">Carregando…</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={q.data?.series ?? []} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="mes"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    stroke="var(--color-muted-foreground)"
                  />
                  <YAxis
                    fontSize={11}
                    width={32}
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    stroke="var(--color-muted-foreground)"
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "var(--color-foreground)" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="total"
                    stroke={BLUE}
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: BLUE }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function Kpi({
  icon,
  label,
  value,
  hint,
  accent,
  loading,
}: {
  icon: ReactNode;
  label: string;
  value?: number;
  hint?: string;
  accent?: boolean;
  loading?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 shadow-[var(--shadow-card)] sm:p-5 ${
        accent ? "border-brand-blue/30 bg-brand-blue/5" : "border-hairline bg-card"
      }`}
    >
      <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
        <span className="text-brand-blue">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-extrabold sm:text-3xl">
        {loading ? <span className="text-muted-foreground/40">—</span> : (value ?? 0).toLocaleString("pt-BR")}
      </div>
      {hint && !loading && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-brand-blue">
          <TrendingUp className="size-3.5" />
          {hint}
        </div>
      )}
    </div>
  );
}
