import { createFileRoute } from "@tanstack/react-router";
import { PlatformClientsScreen } from "@/components/platform/platform-clients-screen";

export const Route = createFileRoute("/_authenticated/platform/clients")({
  head: () => ({
    meta: [
      { title: "Clientes — ConectaChat" },
      { name: "description", content: "Área da plataforma: gerencie os clientes do SaaS." },
    ],
  }),
  component: PlatformClientsPage,
});

function PlatformClientsPage() {
  return (
    <div className="h-full">
      <PlatformClientsScreen />
    </div>
  );
}
