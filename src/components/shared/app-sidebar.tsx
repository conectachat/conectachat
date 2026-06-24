import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Inbox,
  LogOut,
  Contact,
  Settings,
  CalendarClock,
  Plug,
  ChevronLeft,
  ChevronRight,
  Shield,
  SquareKanban,
  Sun,
  Moon,
  Workflow,
  Blocks,
  MessagesSquare,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/shared/logo";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { usePlatformStaff } from "@/hooks/use-platform-staff";
import { useTheme } from "@/hooks/use-theme";

type NavItemData = { title: string; url: string; icon: LucideIcon };

const items: NavItemData[] = [
  { title: "Caixa de entrada", url: "/inbox", icon: Inbox },
  { title: "Chat interno", url: "/team-chat", icon: MessagesSquare },
  { title: "CRM", url: "/crm", icon: SquareKanban },
  { title: "Relatórios", url: "/reports", icon: BarChart3 },
  { title: "Fluxos", url: "/flows", icon: Workflow },
  { title: "Contatos", url: "/contacts", icon: Contact },
  { title: "Agendamentos", url: "/schedules", icon: CalendarClock },
  { title: "Conexões", url: "/connections", icon: Plug },
  { title: "Integrações", url: "/integracoes", icon: Blocks },
  { title: "Configurações", url: "/settings", icon: Settings },
];

const ROLE_LABEL: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  agent: "Agente",
};

function initials(name: string | null | undefined, email: string | null | undefined) {
  const source = (name?.trim() || email || "?").trim();
  const parts = source.split(/\s+/);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : source.slice(0, 2);
  return letters.toUpperCase();
}

function NavItem({ item, active, collapsed }: { item: NavItemData; active: boolean; collapsed: boolean }) {
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        className="relative"
        style={
          active
            ? {
                background: "var(--brand-soft)",
                color: "var(--brand-text)",
                boxShadow: "var(--shadow-glow)",
              }
            : undefined
        }
      >
        <Link to={item.url} className="flex items-center gap-2">
          {active && (
            <span aria-hidden className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-brand-green" />
          )}
          <Icon className="h-4 w-4 shrink-0" />
          {!collapsed && <span>{item.title}</span>}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, profile, activeMembership } = useCurrentUser();
  const { isSuperAdmin } = usePlatformStaff();
  const { theme, toggleTheme } = useTheme();

  const handleLogout = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  };

  const displayName = profile?.full_name || user?.email || "";
  const role = activeMembership?.role;
  const isDark = theme === "dark";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        {collapsed ? (
          <div className="flex flex-col items-center gap-1 py-1.5">
            <Logo variant="icon" className="h-8 w-8" />
            <button
              type="button"
              onClick={toggleSidebar}
              title="Expandir menu"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 px-2 py-1.5">
            <Logo variant="horizontal" className="h-7 w-auto" />
            <button
              type="button"
              onClick={toggleSidebar}
              title="Recolher menu"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Atendimento</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <NavItem key={item.url} item={item} active={pathname === item.url} collapsed={collapsed} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {!collapsed && user && (
          <div className="flex items-center gap-2 px-2 py-2">
            <Avatar className="h-8 w-8">
              <AvatarImage src={profile?.avatar_url ?? undefined} alt={displayName} />
              <AvatarFallback className="text-xs">{initials(profile?.full_name, user.email)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">{displayName}</p>
              {role && (
                <Badge variant="secondary" className="mt-0.5 h-4 px-1.5 text-[10px]">
                  {ROLE_LABEL[role] ?? role}
                </Badge>
              )}
            </div>
          </div>
        )}
        <SidebarMenu>
          {/* Atalho para o Painel Master — só aparece para a equipe da plataforma. */}
          {isSuperAdmin && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild title="Painel Master">
                <Link to="/master" className="flex items-center gap-2 text-brand-blue">
                  <Shield className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="font-medium">Painel Master</span>}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {/* Botão de tema (sol/lua). */}
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={toggleTheme}
              title={isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {!collapsed && <span>{isDark ? "Tema claro" : "Tema escuro"}</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>Sair</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
