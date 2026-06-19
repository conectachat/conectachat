import { createFileRoute } from "@tanstack/react-router";
import { CrmScreen } from "@/components/crm/crm-screen";

export const Route = createFileRoute("/_authenticated/crm")({
  head: () => ({
    meta: [
      { title: "CRM — ConectaChat" },
      { name: "description", content: "Funil de vendas e atendimento em quadro (Kanban)." },
    ],
  }),
  component: CrmPage,
});

function CrmPage() {
  return (
    <div className="h-full">
      <CrmScreen />
    </div>
  );
}
