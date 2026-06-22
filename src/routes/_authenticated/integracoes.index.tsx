import { createFileRoute } from "@tanstack/react-router";
import { MarketplaceScreen } from "@/components/integrations/marketplace-screen";

export const Route = createFileRoute("/_authenticated/integracoes/")({
  head: () => ({
    meta: [
      { title: "Integrações — ConectaChat" },
      { name: "description", content: "Conecte o ConectaChat a outros aplicativos e serviços." },
    ],
  }),
  component: MarketplacePage,
});

function MarketplacePage() {
  return (
    <div className="h-full">
      <MarketplaceScreen />
    </div>
  );
}
