import { createFileRoute, redirect } from "@tanstack/react-router";

// Acessar só "/master" leva direto para o Painel.
export const Route = createFileRoute("/master/")({
  beforeLoad: () => {
    throw redirect({ to: "/master/dashboard", replace: true });
  },
});
