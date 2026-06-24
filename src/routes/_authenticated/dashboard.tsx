import { createFileRoute } from "@tanstack/react-router";
import { ReportsScreen } from "@/components/reports/reports-screen";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — ConectaChat" },
      { name: "description", content: "Métricas e dashboards de atendimento." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <div className="h-full">
      <ReportsScreen />
    </div>
  );
}
