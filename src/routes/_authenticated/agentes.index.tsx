import { createFileRoute } from "@tanstack/react-router";
import { AgentsScreen } from "@/components/agents/agents-screen";

export const Route = createFileRoute("/_authenticated/agentes/")({
  head: () => ({
    meta: [
      { title: "Agentes — ConectaChat" },
      { name: "description", content: "Atendentes de IA da empresa." },
    ],
  }),
  component: AgentesPage,
});

function AgentesPage() {
  return (
    <div className="h-full">
      <AgentsScreen />
    </div>
  );
}
