import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/agentes")({
  component: AgentesLayout,
});

function AgentesLayout() {
  return <Outlet />;
}
