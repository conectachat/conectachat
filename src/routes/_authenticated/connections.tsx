import { createFileRoute } from "@tanstack/react-router";
import { ConnectionsScreen } from "@/components/connections-screen";

export const Route = createFileRoute("/_authenticated/connections")({
  head: () => ({
    meta: [
      { title: "Conexões — ConectaChat" },
      { name: "description", content: "Conecte seus canais de atendimento." },
    ],
  }),
  component: ConnectionsPage,
});

function ConnectionsPage() {
  return (
    <div className="h-full">
      <ConnectionsScreen />
    </div>
  );
}
