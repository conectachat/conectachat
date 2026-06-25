import { createFileRoute } from "@tanstack/react-router";
import { AgentEditor } from "@/components/agents/agent-editor";

export const Route = createFileRoute("/_authenticated/agentes/$agentId")({
  head: () => ({
    meta: [
      { title: "Editar agente — ConectaChat" },
      { name: "description", content: "Configuração do atendente de IA." },
    ],
  }),
  component: AgentEditorPage,
});

function AgentEditorPage() {
  const { agentId } = Route.useParams();
  return <AgentEditor agentId={agentId} />;
}
