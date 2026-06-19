import { createFileRoute } from "@tanstack/react-router";
import { SettingsScreen } from "@/components/settings/settings-screen";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Configurações — ConectaChat" },
      { name: "description", content: "Gerencie as configurações do sistema." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="h-full">
      <SettingsScreen />
    </div>
  );
}
