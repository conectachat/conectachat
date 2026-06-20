import { useState } from "react";
import {
  createFileRoute,
  redirect,
  Outlet,
  Link,
  useRouterState,
} from "@tanstack/react-router";
import {
  Shield,
  LayoutDashboard,
  Building2,
  CreditCard,
  Package,
  Settings,
  ArrowLeft,
  LogOut,
  Sun,
  Moon,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { usePlatformStaff } from "@/hooks/use-platform-staff";
import { useTheme } from "@/hooks/use-theme";
import { SidebarProvider } from "@/components/ui/sidebar";

// Namespace próprio do Painel Master. NÃO usa o shell (sidebar) do app do cliente.
export const Route = createFileRoute("/master")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login" });

    const { data: staff } = await supabase
      .from("platform_staff")
      .select("role")
      .eq("user_id", data.user.id)
      .maybeSingle();

    if (!staff) throw redirect({ to: "/inbox" });

    return { user: data.user, role: staff.role };
  },
  component: MasterLayout,
});

type MasterNavItem = { to: string; label: string; icon: LucideIcon; ready: boolean };

const SECTIONS: { label: string; items: MasterNavItem[] }[] = [
  {
    label: "Operação",
    items: [
      { to: "/master/dashboard", label: "Painel", icon: LayoutDashboard, ready: true },
      { to: "/master/companies", label: "Clientes", icon: Building2, ready: true },
      { to: "/master/subscriptions", label: "Assinaturas", icon: CreditCard, ready: true },
    ],
  },
  {
    label: "Catálogo",
    items: [{ to: "/master/plans", label: "Planos", icon: Package, ready: true }],
  },
  {
    label: "Administração",
    items: [{ to: "/master/settings", label: "Configurações", icon: Settings, ready: false }],
  },
];

const BLUE_BOX = { background: "linear-gradient(135deg, #0055A6, #003D73)" } as const;

async function logout() {
  await supabase.auth.signOut();
  window.location.href = "/login";
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl text-white shadow-md" style={BLUE_BOX}>
        <Shield className="size-5" strokeWidth={2.5} />
      </div>
      <div className="min-w-0">
        <div className="truncate text-[16px] font-extrabold tracking-tight text-brand-blue">Master</div>
        <div className="-mt-0.5 truncate text-[11.5px] text-muted-foreground">ConectaChat · admin</div>
      </div>
    </div>
  );
}

function NavItems({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto p-3">
      {SECTIONS.map((sec) => (
        <div key={sec.label}>
          <div className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
            {sec.label}
          </div>
          <div className="flex flex-col gap-1">
            {sec.items.map((it) => {
              const Icon = it.icon;
              const active = pathname === it.to || pathname.startsWith(it.to + "/");

              if (!it.ready) {
                return (
                  <div
                    key={it.to}
                    title="Em breve"
                    className="flex items-center gap-3 rounded-lg px-3 py-[11px] text-[14.5px] font-medium text-muted-foreground/50"
                  >
                    <Icon className="size-[18px] shrink-0" />
                    <span className="flex-1 truncate">{it.label}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      em breve
                    </span>
                  </div>
                );
              }

              return (
                <Link
                  key={it.to}
                  to={it.to}
                  onClick={onNavigate}
                  className={`relative flex items-center gap-3 rounded-lg px-3 py-[11px] text-[14.5px] font-medium transition-colors ${
                    active
                      ? "bg-brand-blue/10 text-brand-blue"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-brand-blue" />}
                  <Icon className="size-[18px] shrink-0" />
                  <span className="flex-1 truncate">{it.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      <Link
        to="/inbox"
        onClick={onNavigate}
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Voltar ao app
      </Link>
    </nav>
  );
}

function UserBox() {
  const { user, profile } = useCurrentUser();
  const { role } = usePlatformStaff();
  const name = profile?.full_name || user?.email?.split("@")[0] || "Master";
  const roleLabel = role === "super_admin" ? "Super admin" : role ?? "Equipe";
  return (
    <div className="flex items-center gap-3 rounded-xl border border-hairline bg-muted/40 px-2 py-2">
      <div className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-blue/10 text-[13px] font-bold text-brand-blue">
        {name.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-semibold">{name}</div>
        <div className="truncate text-[11px] capitalize text-brand-blue">{roleLabel}</div>
      </div>
      <button
        onClick={logout}
        title="Sair"
        className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-background hover:text-foreground"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );
}

function ThemeButton() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      onClick={toggleTheme}
      title={isDark ? "Tema claro" : "Tema escuro"}
      className="grid size-9 place-items-center rounded-lg border border-hairline bg-card text-muted-foreground hover:text-foreground"
    >
      {isDark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  );
}

function MasterLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [drawer, setDrawer] = useState(false);

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden text-foreground">
        {/* Sidebar fixa (computador) */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-hairline bg-card md:flex">
          <div className="border-b border-hairline px-5 py-5">
            <Brand />
          </div>
          <NavItems pathname={pathname} />
          <div className="border-t border-hairline p-3">
            <UserBox />
          </div>
        </aside>

        {/* Coluna principal */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Topo (celular) */}
          <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-hairline bg-card/80 px-4 py-3 backdrop-blur md:hidden">
            <button
              onClick={() => setDrawer(true)}
              title="Menu"
              className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:text-foreground"
            >
              <Menu className="size-5" />
            </button>
            <Brand />
            <ThemeButton />
          </header>

          {/* Topo (computador) */}
          <header className="hidden shrink-0 items-center justify-between gap-3 px-8 pt-6 md:flex">
            <div className="flex items-center gap-2 rounded-full border border-brand-blue/20 bg-brand-blue/10 px-3 py-1.5 text-[13.5px] font-medium text-brand-blue">
              <span className="size-1.5 rounded-full bg-brand-blue" />
              Modo super admin
            </div>
            <ThemeButton />
          </header>

          {/* Conteúdo (cada página cuida da própria rolagem). */}
          <main className="min-h-0 flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>

        {/* Menu deslizante (celular) */}
        {drawer && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
            <div className="absolute left-0 top-0 flex h-full w-72 flex-col border-r border-hairline bg-card">
              <div className="flex items-center justify-between border-b border-hairline px-4 py-4">
                <Brand />
                <button
                  onClick={() => setDrawer(false)}
                  className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:text-foreground"
                >
                  <X className="size-5" />
                </button>
              </div>
              <NavItems pathname={pathname} onNavigate={() => setDrawer(false)} />
              <div className="border-t border-hairline p-3">
                <UserBox />
              </div>
            </div>
          </div>
        )}
      </div>
    </SidebarProvider>
  );
}
