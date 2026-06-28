import { createFileRoute } from "@tanstack/react-router";
import { CampaignsScreen } from "@/components/campaigns/campaigns-screen";

export const Route = createFileRoute("/_authenticated/campanhas/")({
  head: () => ({
    meta: [
      { title: "Campanhas — ConectaChat" },
      { name: "description", content: "Disparo em massa de mensagens." },
    ],
  }),
  component: CampanhasPage,
});

function CampanhasPage() {
  return (
    <div className="h-full">
      <CampaignsScreen />
    </div>
  );
}
