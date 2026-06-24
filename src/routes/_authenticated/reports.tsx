import { createFileRoute } from "@tanstack/react-router";
import { ReportsScreen } from "@/components/reports/reports-screen";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Relatórios — ConectaChat" },
      { name: "description", content: "Métricas e dashboards de atendimento." },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  return (
    <div className="h-full">
      <ReportsScreen />
    </div>
  );
}
