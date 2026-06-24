import { createFileRoute } from "@tanstack/react-router";
import { TeamChatScreen } from "@/components/team-chat/team-chat-screen";

export const Route = createFileRoute("/_authenticated/team-chat")({
  head: () => ({
    meta: [
      { title: "Chat interno — ConectaChat" },
      { name: "description", content: "Converse com os colegas da sua empresa." },
    ],
  }),
  component: TeamChatPage,
});

function TeamChatPage() {
  return (
    <div className="h-full p-2 md:p-4">
      <TeamChatScreen />
    </div>
  );
}
