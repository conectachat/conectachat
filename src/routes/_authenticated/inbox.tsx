import { createFileRoute } from "@tanstack/react-router";
import { InboxScreen } from "@/components/inbox/inbox-screen";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({
    meta: [
      { title: "Caixa de entrada — ConectaChat" },
      { name: "description", content: "Suas conversas de atendimento ao cliente." },
    ],
  }),
  component: InboxPage,
});

function InboxPage() {
  return (
    <div className="h-full">
      <InboxScreen />
    </div>
  );
}
