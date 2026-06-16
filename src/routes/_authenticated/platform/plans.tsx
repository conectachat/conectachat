import { createFileRoute } from "@tanstack/react-router";
import { PlatformPlansScreen } from "@/components/platform-plans-screen";

export const Route = createFileRoute("/_authenticated/platform/plans")({
  head: () => ({
    meta: [
      { title: "Planos — ConectaChat" },
      { name: "description", content: "Área da plataforma: gerencie os planos do SaaS." },
    ],
  }),
  component: PlatformPlansPage,
});

function PlatformPlansPage() {
  return (
    <div className="h-full">
      <PlatformPlansScreen />
    </div>
  );
}
