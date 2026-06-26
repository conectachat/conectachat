import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Lock } from "lucide-react";

import { useCurrentUser } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/agentes")({
  component: AgentesLayout,
});

function AgentesLayout() {
  // Área de Agentes é restrita ao proprietário e administradores da empresa.
  // O guard fica no layout para cobrir /agentes e /agentes/$agentId.
  const { activeMembership, isLoading } = useCurrentUser();
  const isAdmin = activeMembership?.role === "owner" || activeMembership?.role === "admin";

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  }

  if (!isAdmin) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
          <Lock className="h-6 w-6" />
        </div>
        <p className="text-base font-semibold text-foreground">Acesso restrito</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          A área de Agentes (atendentes de IA) é exclusiva do proprietário e dos administradores da empresa.
          Fale com um administrador se precisar de acesso.
        </p>
      </div>
    );
  }

  return <Outlet />;
}
