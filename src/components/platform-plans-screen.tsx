import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, Plus, Pencil, Power, PowerOff, Users, Plug } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { usePlatformStaff } from "@/hooks/use-platform-staff";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ===================================================================
//  TIPOS
// ===================================================================
type PlanRow = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  max_users: number;
  max_channels: number;
  is_active: boolean;
  created_at: string;
};

const CURRENCIES = ["BRL", "USD", "EUR"];

// ===================================================================
//  AJUDANTES DE PREÇO
// ===================================================================
// Mostra o preço já formatado na moeda (ex.: R$ 99,00 / US$ 99.00).
function formatPrice(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format((cents ?? 0) / 100);
  } catch {
    return `${currency} ${((cents ?? 0) / 100).toFixed(2)}`;
  }
}

// Converte o que a pessoa digita ("99", "99,90", "1.299,90", "99.90") em centavos.
// Se tiver vírgula, ela é o separador decimal e os pontos são milhar.
function toCents(input: string): number | null {
  let s = input.trim().replace(/\s/g, "");
  if (s === "") return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const value = Number(s);
  if (!isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

// Pré-preenche o campo de preço a partir dos centavos (usa vírgula decimal).
function centsToInput(cents: number): string {
  return ((cents ?? 0) / 100).toFixed(2).replace(".", ",");
}

// ===================================================================
//  TELA PRINCIPAL
// ===================================================================
export function PlatformPlansScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isSuperAdmin, isLoading: staffLoading } = usePlatformStaff();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PlanRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Trava de acesso: quem não é super_admin não entra (volta para a Caixa de entrada).
  // A trava de verdade é no banco (RLS); aqui é só para a experiência ficar correta.
  useEffect(() => {
    if (!staffLoading && !isSuperAdmin) {
      navigate({ to: "/inbox", replace: true });
    }
  }, [staffLoading, isSuperAdmin, navigate]);

  const plansQuery = useQuery({
    queryKey: ["plans-admin"],
    enabled: isSuperAdmin,
    queryFn: async (): Promise<PlanRow[]> => {
      const { data, error } = await supabase
        .from("plans")
        .select("id, name, description, price_cents, currency, max_users, max_channels, is_active, created_at")
        .order("price_cents", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PlanRow[];
    },
  });

  if (staffLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  }
  if (!isSuperAdmin) {
    return null; // redirecionando
  }

  const plans = plansQuery.data ?? [];

  async function toggleActive(plan: PlanRow) {
    setBusyId(plan.id);
    const { error } = await supabase.from("plans").update({ is_active: !plan.is_active }).eq("id", plan.id);
    setBusyId(null);
    if (error) {
      toast.error("Não foi possível atualizar o plano", { description: error.message });
      return;
    }
    toast.success(plan.is_active ? "Plano desativado" : "Plano ativado");
    queryClient.invalidateQueries({ queryKey: ["plans-admin"] });
  }

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(plan: PlanRow) {
    setEditing(plan);
    setFormOpen(true);
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-gray-50 dark:bg-background">
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-5xl">
          <PageHeader
            title="Planos"
            subtitle="Área da plataforma — gerencie os planos do ConectaChat."
            actions={
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                <span className="ml-1">Novo plano</span>
              </Button>
            }
          />

          {plansQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : plans.length === 0 ? (
            <EmptyState onCreate={openCreate} />
          ) : (
            <div className="space-y-3">
              {plans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  busy={busyId === plan.id}
                  onEdit={() => openEdit(plan)}
                  onToggle={() => toggleActive(plan)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <PlanFormDialog
        open={formOpen}
        plan={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          queryClient.invalidateQueries({ queryKey: ["plans-admin"] });
        }}
      />
    </div>
  );
}

// ===================================================================
//  CARTÃO DE UM PLANO
// ===================================================================
function PlanCard({
  plan,
  busy,
  onEdit,
  onToggle,
}: {
  plan: PlanRow;
  busy: boolean;
  onEdit: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md"
        style={{ backgroundColor: "#8FC5491A", color: "#0055A6" }}
      >
        <Layers className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{plan.name}</span>
          {plan.is_active ? (
            <Badge variant="secondary" className="h-5 bg-green-100 px-1.5 text-[10px] text-green-700">
              Ativo
            </Badge>
          ) : (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] text-muted-foreground">
              Inativo
            </Badge>
          )}
        </div>
        {plan.description && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{plan.description}</p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {plan.max_users} {plan.max_users === 1 ? "usuário" : "usuários"}
          </span>
          <span className="inline-flex items-center gap-1">
            <Plug className="h-3.5 w-3.5" />
            {plan.max_channels} {plan.max_channels === 1 ? "conexão" : "conexões"}
          </span>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <span className="whitespace-nowrap text-sm font-semibold text-foreground">
          {formatPrice(plan.price_cents, plan.currency)}
          <span className="ml-1 text-[11px] font-normal text-muted-foreground">/mês</span>
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title={plan.is_active ? "Desativar" : "Ativar"}
            onClick={onToggle}
            disabled={busy}
          >
            {plan.is_active ? (
              <PowerOff className="h-4 w-4 text-amber-600" />
            ) : (
              <Power className="h-4 w-4 text-green-600" />
            )}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={onEdit} disabled={busy}>
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
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
        style={{ backgroundColor: "#8FC54920" }}
      >
        <Layers className="h-5 w-5" style={{ color: "#0055A6" }} />
      </div>
      <h3 className="text-base font-semibold text-foreground">Nenhum plano ainda</h3>
      <p className="mt-1 text-sm text-muted-foreground">Crie o primeiro plano do ConectaChat.</p>
      <Button className="mt-4" size="sm" onClick={onCreate}>
        <Plus className="h-4 w-4" />
        <span className="ml-1">Novo plano</span>
      </Button>
    </div>
  );
}

// ===================================================================
//  DIÁLOGO DE CRIAR / EDITAR
// ===================================================================
function PlanFormDialog({
  open,
  plan,
  onClose,
  onSaved,
}: {
  open: boolean;
  plan: PlanRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!plan;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("BRL");
  const [maxUsers, setMaxUsers] = useState("3");
  const [maxChannels, setMaxChannels] = useState("1");
  const [saving, setSaving] = useState(false);

  // Toda vez que o diálogo abre, preenche os campos (editar) ou limpa (criar).
  useEffect(() => {
    if (!open) return;
    if (plan) {
      setName(plan.name);
      setDescription(plan.description ?? "");
      setPrice(centsToInput(plan.price_cents));
      setCurrency(plan.currency || "BRL");
      setMaxUsers(String(plan.max_users));
      setMaxChannels(String(plan.max_channels));
    } else {
      setName("");
      setDescription("");
      setPrice("");
      setCurrency("BRL");
      setMaxUsers("3");
      setMaxChannels("1");
    }
  }, [open, plan]);

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Dê um nome ao plano.");
      return;
    }
    const cents = toCents(price);
    if (cents === null) {
      toast.error("Preço inválido.", { description: "Digite algo como 99,90 (use vírgula para os centavos)." });
      return;
    }
    const users = parseInt(maxUsers, 10);
    const channels = parseInt(maxChannels, 10);
    if (!Number.isFinite(users) || users < 1) {
      toast.error("O número de usuários deve ser pelo menos 1.");
      return;
    }
    if (!Number.isFinite(channels) || channels < 1) {
      toast.error("O número de conexões deve ser pelo menos 1.");
      return;
    }

    const payload = {
      name: trimmedName,
      description: description.trim() || null,
      price_cents: cents,
      currency,
      max_users: users,
      max_channels: channels,
    };

    setSaving(true);
    const { error } = isEdit
      ? await supabase.from("plans").update(payload).eq("id", plan!.id)
      : await supabase.from("plans").insert(payload);
    setSaving(false);

    if (error) {
      toast.error("Não foi possível salvar o plano", { description: error.message });
      return;
    }
    toast.success(isEdit ? "Plano atualizado" : "Plano criado");
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar plano" : "Novo plano"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="plan-name">Nome</Label>
            <Input
              id="plan-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Profissional"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plan-desc">Descrição (opcional)</Label>
            <Textarea
              id="plan-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex.: Para times em operação"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="plan-price">Preço por mês</Label>
              <Input
                id="plan-price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Ex.: 99,90"
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-currency">Moeda</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="plan-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="plan-users">Nº de usuários</Label>
              <Input
                id="plan-users"
                type="number"
                min={1}
                value={maxUsers}
                onChange={(e) => setMaxUsers(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-channels">Nº de conexões</Label>
              <Input
                id="plan-channels"
                type="number"
                min={1}
                value={maxChannels}
                onChange={(e) => setMaxChannels(e.target.value)}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Para ativar ou desativar o plano, use o botão na lista. Planos inativos não aparecem para novos clientes.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando…" : isEdit ? "Salvar" : "Criar plano"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
