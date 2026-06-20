import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, Pencil, Eye, Users, Plug, MessageSquareOff } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { usePlatformStaff } from "@/hooks/use-platform-staff";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ===================================================================
//  TIPOS
// ===================================================================
type ClientRow = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  plan: string | null;
  owner_name: string | null;
  owner_email: string | null;
  subscription_status: string | null;
  users_count: number;
  channels_count: number;
  channels_connected: number;
};

type PlanOption = { id: string; name: string; is_active: boolean };

type ClientDetail = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  plan_id: string | null;
  plan_name: string | null;
  max_users: number | null;
  max_channels: number | null;
  subscription: { status: string; current_period_end: string | null } | null;
  members: { name: string | null; email: string | null; role: string }[];
  channels: { id: string; name: string; type: string; status: string; number: string | null }[];
  departments: { id: string; name: string }[];
  contacts_count: number;
  conversations_count: number;
};

// ===================================================================
//  RÓTULOS / CORES
// ===================================================================
const SUB_META: Record<string, { label: string; cls: string }> = {
  trialing: { label: "Em teste", cls: "bg-blue-100 text-blue-700" },
  active: { label: "Ativa", cls: "bg-green-100 text-green-700" },
  past_due: { label: "Pagamento atrasado", cls: "bg-red-100 text-red-700" },
  canceled: { label: "Cancelada", cls: "bg-gray-100 text-gray-600" },
  incomplete: { label: "Incompleta", cls: "bg-amber-100 text-amber-700" },
};
const SUB_OPTIONS = ["trialing", "active", "past_due", "canceled", "incomplete"];

const ROLE_LABEL: Record<string, string> = { owner: "Proprietário", admin: "Administrador", agent: "Agente" };

const CH_STATUS: Record<string, { label: string; cls: string }> = {
  connected: { label: "Conectado", cls: "bg-green-100 text-green-700" },
  connecting: { label: "Conectando", cls: "bg-amber-100 text-amber-700" },
  disconnected: { label: "Desconectado", cls: "bg-gray-100 text-gray-600" },
  error: { label: "Erro", cls: "bg-red-100 text-red-700" },
};

function subBadge(status: string | null) {
  if (!status) return { label: "—", cls: "bg-gray-100 text-gray-500" };
  return SUB_META[status] ?? { label: status, cls: "bg-gray-100 text-gray-600" };
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
}

// Chama a Edge Function manage-platform.
async function callFn(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("manage-platform", { body });
  return { data, error };
}

// ===================================================================
//  TELA PRINCIPAL
// ===================================================================
export function PlatformClientsScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isSuperAdmin, isLoading: staffLoading } = usePlatformStaff();

  const [formClient, setFormClient] = useState<ClientRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [detailOrgId, setDetailOrgId] = useState<string | null>(null);

  // Trava: só super_admin (a de verdade é no banco/Edge Function).
  useEffect(() => {
    if (!staffLoading && !isSuperAdmin) navigate({ to: "/inbox", replace: true });
  }, [staffLoading, isSuperAdmin, navigate]);

  const clientsQuery = useQuery({
    queryKey: ["platform-clients"],
    enabled: isSuperAdmin,
    queryFn: async (): Promise<ClientRow[]> => {
      const { data, error } = await callFn({ action: "list-clients" });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error ?? "Falha ao listar clientes");
      return (data.clients ?? []) as ClientRow[];
    },
  });

  // Planos ativos (para os menus de criar/editar). Leitura pública pela RLS.
  const plansQuery = useQuery({
    queryKey: ["plans-options"],
    enabled: isSuperAdmin,
    queryFn: async (): Promise<PlanOption[]> => {
      const { data, error } = await supabase
        .from("plans")
        .select("id, name, is_active")
        .order("price_cents", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PlanOption[];
    },
  });

  if (staffLoading) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  if (!isSuperAdmin) return null;

  const clients = clientsQuery.data ?? [];
  const plans = plansQuery.data ?? [];

  function openCreate() {
    setFormClient(null);
    setFormOpen(true);
  }
  function openEdit(c: ClientRow) {
    setFormClient(c);
    setFormOpen(true);
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-gray-50 dark:bg-background">
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-5xl">
          <PageHeader
            title="Clientes"
            subtitle="Área da plataforma — os clientes que usam o ConectaChat."
            actions={
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                <span className="ml-1">Novo cliente</span>
              </Button>
            }
          />

          {clientsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : clientsQuery.isError ? (
            <p className="text-sm text-red-600">
              Não foi possível carregar os clientes. {(clientsQuery.error as Error)?.message}
            </p>
          ) : clients.length === 0 ? (
            <EmptyState onCreate={openCreate} />
          ) : (
            <div className="space-y-3">
              {clients.map((c) => (
                <ClientCard key={c.id} client={c} onDetail={() => setDetailOrgId(c.id)} onEdit={() => openEdit(c)} />
              ))}
            </div>
          )}
        </div>
      </div>

      <ClientFormDialog
        open={formOpen}
        client={formClient}
        plans={plans}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          queryClient.invalidateQueries({ queryKey: ["platform-clients"] });
        }}
      />

      <ClientDetailDialog orgId={detailOrgId} onClose={() => setDetailOrgId(null)} />
    </div>
  );
}

// ===================================================================
//  CARTÃO DE UM CLIENTE
// ===================================================================
function ClientCard({ client, onDetail, onEdit }: { client: ClientRow; onDetail: () => void; onEdit: () => void }) {
  const sub = subBadge(client.subscription_status);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md"
        style={{ backgroundColor: "#0055A61A", color: "#0055A6" }}
      >
        <Building2 className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{client.name}</span>
          {client.plan && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {client.plan}
            </Badge>
          )}
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${sub.cls}`}>
            {sub.label}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {client.owner_name || "Sem dono"}
          {client.owner_email ? ` · ${client.owner_email}` : ""}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {client.users_count} {client.users_count === 1 ? "usuário" : "usuários"}
          </span>
          <span className="inline-flex items-center gap-1">
            <Plug className="h-3.5 w-3.5" />
            {client.channels_connected}/{client.channels_count} conectadas
          </span>
          <span>Desde {formatDate(client.created_at)}</span>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Ver estrutura (suporte)" onClick={onDetail}>
          <Eye className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ===================================================================
//  ESTADO VAZIO
// ===================================================================
function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="mx-auto max-w-md rounded-lg border border-dashed border-border bg-card p-8 text-center">
      <div
        className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full"
        style={{ backgroundColor: "#0055A620" }}
      >
        <Building2 className="h-5 w-5" style={{ color: "#0055A6" }} />
      </div>
      <h3 className="text-base font-semibold text-foreground">Nenhum cliente ainda</h3>
      <p className="mt-1 text-sm text-muted-foreground">Cadastre o primeiro cliente.</p>
      <Button className="mt-4" size="sm" onClick={onCreate}>
        <Plus className="h-4 w-4" />
        <span className="ml-1">Novo cliente</span>
      </Button>
    </div>
  );
}

// ===================================================================
//  DIÁLOGO CRIAR / EDITAR CLIENTE
// ===================================================================
const NO_PLAN = "none";

function ClientFormDialog({
  open,
  client,
  plans,
  onClose,
  onSaved,
}: {
  open: boolean;
  client: ClientRow | null;
  plans: PlanOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!client;

  // Edição: nome do cliente + plano + status.
  const [companyName, setCompanyName] = useState("");
  const [planId, setPlanId] = useState<string>(NO_PLAN);
  const [status, setStatus] = useState<string>("trialing");

  // Criação: só nome e e-mail do dono (o resto ele preenche no onboarding).
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (client) {
      setCompanyName(client.name);
      const match = plans.find((p) => p.name === client.plan);
      setPlanId(match ? match.id : NO_PLAN);
      setStatus(client.subscription_status ?? "trialing");
    } else {
      setCompanyName("");
      setPlanId(NO_PLAN);
      setStatus("trialing");
      setOwnerName("");
      setOwnerEmail("");
    }
  }, [open, client, plans]);

  async function handleSave() {
    setSaving(true);

    if (isEdit) {
      const name = companyName.trim();
      if (!name) {
        setSaving(false);
        toast.error("Informe o nome do cliente.");
        return;
      }
      const planArg = planId === NO_PLAN ? null : planId;
      const { data, error } = await callFn({
        action: "update-client",
        orgId: client!.id,
        name,
        planId: planArg,
        status,
      });
      setSaving(false);
      if (error || !data?.ok) {
        toast.error("Não foi possível salvar", { description: data?.error ?? error?.message });
        return;
      }
      toast.success("Cliente atualizado");
      onSaved();
      return;
    }

    // Criação: apenas o dono (nome + e-mail). A empresa nasce com o nome do dono
    // como provisório; ele define o nome real e o tipo (PF/PJ) no onboarding.
    const oName = ownerName.trim();
    const oEmail = ownerEmail.trim().toLowerCase();
    if (!oName) {
      setSaving(false);
      toast.error("Informe o nome do dono.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(oEmail)) {
      setSaving(false);
      toast.error("E-mail do dono inválido.");
      return;
    }
    const { data, error } = await callFn({
      action: "create-client",
      companyName: oName, // nome provisório da empresa = nome do dono
      ownerName: oName,
      ownerEmail: oEmail,
      planId: null,
      status: "trialing",
    });
    setSaving(false);
    if (error || !data?.ok) {
      toast.error("Não foi possível criar o cliente", { description: data?.error ?? error?.message });
      return;
    }
    toast.success("Cliente criado", { description: `Convite enviado para ${oEmail}.` });
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar cliente" : "Novo cliente"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {isEdit ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="c-name">Nome do cliente</Label>
                <Input
                  id="c-name"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Ex.: Duli Consulting"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="c-plan">Plano</Label>
                  <Select value={planId} onValueChange={setPlanId}>
                    <SelectTrigger id="c-plan">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_PLAN}>Sem plano</SelectItem>
                      {plans.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                          {!p.is_active ? " (inativo)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-status">Assinatura</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger id="c-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUB_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {SUB_META[s].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="c-owner">Nome do dono</Label>
                <Input
                  id="c-owner"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="Ex.: Renato Drumond"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-email">E-mail do dono</Label>
                <Input
                  id="c-email"
                  type="email"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  placeholder="dono@empresa.com"
                />
                <p className="text-xs text-muted-foreground">
                  O dono recebe um e-mail para definir a senha. No primeiro acesso, ele completa o
                  cadastro (empresa ou pessoa física, documento, etc.) no onboarding.
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando…" : isEdit ? "Salvar" : "Criar cliente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===================================================================
//  DIÁLOGO DETALHE (SUPORTE) — estrutura, nunca mensagens
// ===================================================================
function ClientDetailDialog({ orgId, onClose }: { orgId: string | null; onClose: () => void }) {
  const detailQuery = useQuery({
    queryKey: ["platform-client-detail", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<ClientDetail> => {
      const { data, error } = await callFn({ action: "get-client", orgId });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error ?? "Falha ao carregar");
      return data.client as ClientDetail;
    },
  });

  const c = detailQuery.data;

  return (
    <Dialog open={!!orgId} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{c ? c.name : "Detalhes do cliente"}</DialogTitle>
        </DialogHeader>

        {detailQuery.isLoading ? (
          <p className="py-4 text-sm text-muted-foreground">Carregando…</p>
        ) : detailQuery.isError ? (
          <p className="py-4 text-sm text-red-600">{(detailQuery.error as Error)?.message}</p>
        ) : c ? (
          <div className="space-y-4 py-1 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              {c.plan_name && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  {c.plan_name}
                </Badge>
              )}
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  subBadge(c.subscription?.status ?? null).cls
                }`}
              >
                {subBadge(c.subscription?.status ?? null).label}
              </span>
              <span className="text-xs text-muted-foreground">Desde {formatDate(c.created_at)}</span>
            </div>

            {/* Contagens (estrutura) */}
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Usuários" value={`${c.members.length}${c.max_users ? ` / ${c.max_users}` : ""}`} />
              <Stat label="Conexões" value={`${c.channels.length}${c.max_channels ? ` / ${c.max_channels}` : ""}`} />
              <Stat label="Contatos" value={String(c.contacts_count)} />
              <Stat label="Conversas" value={String(c.conversations_count)} />
            </div>

            {/* Usuários */}
            <Section title="Usuários">
              {c.members.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum usuário.</p>
              ) : (
                <ul className="space-y-1">
                  {c.members.map((m, i) => (
                    <li key={i} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate">
                        {m.name || "—"}
                        {m.email ? <span className="text-muted-foreground"> · {m.email}</span> : null}
                      </span>
                      <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[10px]">
                        {ROLE_LABEL[m.role] ?? m.role}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {/* Conexões */}
            <Section title="Conexões">
              {c.channels.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma conexão.</p>
              ) : (
                <ul className="space-y-1">
                  {c.channels.map((ch) => {
                    const st = CH_STATUS[ch.status] ?? CH_STATUS.disconnected;
                    return (
                      <li key={ch.id} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate">
                          {ch.name}
                          {ch.number ? <span className="text-muted-foreground"> · +{ch.number}</span> : null}
                        </span>
                        <span
                          className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${st.cls}`}
                        >
                          {st.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>

            {/* Departamentos */}
            {c.departments.length > 0 && (
              <Section title="Departamentos">
                <div className="flex flex-wrap gap-1.5">
                  {c.departments.map((d) => (
                    <Badge key={d.id} variant="secondary" className="text-[10px]">
                      {d.name}
                    </Badge>
                  ))}
                </div>
              </Section>
            )}

            <div className="flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              <MessageSquareOff className="h-4 w-4 shrink-0" />
              Você vê a estrutura para dar suporte. As mensagens e os contatos do cliente não são acessíveis por aqui.
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}
