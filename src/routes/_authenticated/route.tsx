import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Building2 } from "lucide-react";

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ConnectionBanner } from "@/components/connection-banner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useNotifications } from "@/hooks/use-notifications";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

// Componente "invisível": só liga as notificações (som + balão do navegador +
// contador no título da aba). Fica montado uma vez no layout, então vale para
// todas as telas do app. Não desenha nada na tela (retorna null).
function NotificationsManager() {
  useNotifications();
  return null;
}

function AuthenticatedLayout() {
  const { hasNoOrg, isLoading } = useCurrentUser();

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Só no celular: um botão para abrir o menu lateral.
              No computador o menu fica sempre visível, então esta barra some
              (md:hidden) e a página começa direto no próprio título. */}
          <div className="flex h-12 shrink-0 items-center px-2 md:hidden">
            <SidebarTrigger />
          </div>
          {!isLoading && !hasNoOrg && <NotificationsManager />}
          {!isLoading && !hasNoOrg && <ConnectionBanner />}
          <main className="min-h-0 flex-1 overflow-hidden">
            {!isLoading && hasNoOrg ? <NoOrgScreen /> : <Outlet />}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function NoOrgScreen() {
  return (
    <div className="flex h-full min-h-[calc(100vh-3.5rem)] items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Building2 className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-base font-medium text-foreground">Conta sem empresa vinculada</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sua conta ainda não está vinculada a nenhuma empresa. Fale com o administrador para receber acesso.
        </p>
      </div>
    </div>
  );
}
