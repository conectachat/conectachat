import { createFileRoute } from "@tanstack/react-router";
import { FlowsScreen } from "@/components/flows/flows-screen";

export const Route = createFileRoute("/_authenticated/flows/")({
  head: () => ({
    meta: [
      { title: "Fluxos — ConectaChat" },
      { name: "description", content: "Construtor de fluxos de chatbot." },
    ],
  }),
  component: FlowsPage,
});

function FlowsPage() {
  return (
    <div className="h-full">
      <FlowsScreen />
    </div>
  );
}