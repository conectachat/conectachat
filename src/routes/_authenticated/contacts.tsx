import { createFileRoute } from "@tanstack/react-router";
import { ContactsScreen } from "@/components/contacts-screen";

export const Route = createFileRoute("/_authenticated/contacts")({
  head: () => ({
    meta: [
      { title: "Contatos — ConectaChat" },
      { name: "description", content: "Gerencie sua base de contatos." },
    ],
  }),
  component: ContactsPage,
});

function ContactsPage() {
  return (
    <div className="h-full">
      <ContactsScreen />
    </div>
  );
}
