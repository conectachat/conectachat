import { createFileRoute } from "@tanstack/react-router";
import { SchedulesScreen } from "@/components/schedules-screen";

export const Route = createFileRoute("/_authenticated/schedules")({
  head: () => ({
    meta: [
      { title: "Agendamentos — ConectaChat" },
      { name: "description", content: "Agende o envio de mensagens." },
    ],
  }),
  component: SchedulesPage,
});

function SchedulesPage() {
  return (
    <div className="h-full">
      <SchedulesScreen />
    </div>
  );
}
