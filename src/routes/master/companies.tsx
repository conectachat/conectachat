import { createFileRoute } from "@tanstack/react-router";
import { PlatformClientsScreen } from "@/components/platform/platform-clients-screen";

// "Empresas" do Master = a tela de Clientes que já existe, reaproveitada.
export const Route = createFileRoute("/master/companies")({
  head: () => ({ meta: [{ title: "Empresas — ConectaChat" }] }),
  component: MasterCompaniesPage,
});

function MasterCompaniesPage() {
  return <PlatformClientsScreen />;
}
