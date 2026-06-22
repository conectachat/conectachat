import { createFileRoute } from "@tanstack/react-router";
import { FlowEditor } from "@/components/flows/flow-editor";

export const Route = createFileRoute("/_authenticated/flows/$flowId")({
  head: () => ({
    meta: [
      { title: "Editor de fluxo — ConectaChat" },
      { name: "description", content: "Editor visual do fluxo de chatbot." },
    ],
  }),
  component: FlowEditorPage,
});

function FlowEditorPage() {
  const { flowId } = Route.useParams();
  return <FlowEditor flowId={flowId} />;
}
