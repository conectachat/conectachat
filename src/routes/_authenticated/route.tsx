import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { Building2 } from "lucide-react";

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

const TITLES: Record<string, string> = {
  "/inbox": "Caixa de entrada",
};

function AuthenticatedLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const title = TITLES[pathname] ?? "ConectaChat";
  const { hasNoOrg, isLoading } = useCurrentUser();

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4">
            <SidebarTrigger />
            <h1 className="text-sm font-medium text-foreground">{title}</h1>
          </header>
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
        <h2 className="mt-4 text-base font-medium text-foreground">
          Conta sem empresa vinculada
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sua conta ainda não está vinculada a nenhuma empresa. Fale com o administrador
          para receber acesso.
        </p>
      </div>
    </div>
  );
}
