import { createFileRoute } from "@tanstack/react-router";
import { Inbox } from "lucide-react";

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
    <div className="flex h-full min-h-[calc(100vh-3.5rem)] items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Inbox className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-base font-medium text-foreground">
          Nenhuma conversa ainda
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Quando novas mensagens chegarem, elas aparecerão aqui.
        </p>
      </div>
    </div>
  );
}
