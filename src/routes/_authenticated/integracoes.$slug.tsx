import { createFileRoute, useParams } from "@tanstack/react-router";
import { IntegrationDetailScreen } from "@/components/integrations/integration-detail-screen";

export const Route = createFileRoute("/_authenticated/integracoes/$slug")({
  head: () => ({
    meta: [{ title: "Integração — ConectaChat" }],
  }),
  component: IntegrationDetailPage,
});

function IntegrationDetailPage() {
  const { slug } = useParams({ from: "/_authenticated/integracoes/$slug" });
  return (
    <div className="h-full">
      <IntegrationDetailScreen slug={slug} />
    </div>
  );
}
