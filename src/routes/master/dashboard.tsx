import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";

export const Route = createFileRoute("/master/dashboard")({
  head: () => ({ meta: [{ title: "Painel Master — ConectaChat" }] }),
  component: MasterDashboardPage,
});

function MasterDashboardPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Painel Master</h1>
        <p className="text-sm text-muted-foreground">Visão geral de toda a plataforma.</p>
      </div>

      <div className="grid place-items-center rounded-2xl border border-hairline bg-card p-12 text-center shadow-[var(--shadow-card)]">
        <div className="grid size-12 place-items-center rounded-full bg-brand-blue/10 text-brand-blue">
          <BarChart3 className="size-6" />
        </div>
        <h2 className="mt-4 text-base font-semibold">Métricas chegam nos próximos blocos</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Aqui vão entrar os indicadores da plataforma (empresas, ativas, em trial, suspensas,
          mensagens e cards) e o gráfico de crescimento de 12 meses. Por enquanto, esta é a casca
          do Painel Master já com a guarda de acesso ativa.
        </p>
      </div>
    </div>
  );
}
