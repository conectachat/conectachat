import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { usePlatformStaff } from "@/hooks/use-platform-staff";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/master/settings")({
  component: MasterSettingsPage,
});

type StaffRow = {
  user_id: string;
  role: string;
  created_at: string;
  name: string | null;
  email: string | null;
  is_self: boolean;
};

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "super_admin", label: "Super admin" },
  { value: "finance", label: "Financeiro" },
  { value: "sales", label: "Vendas" },
  { value: "support", label: "Suporte" },
  { value: "ops", label: "Operações" },
];
const ROLE_LABEL: Record<string, string> = Object.fromEntries(ROLE_OPTIONS.map((r) => [r.value, r.label]));

async function callStaff(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("master-staff", { body });
  return { data, error };
}

function MasterSettingsPage() {
  const queryClient = useQueryClient();
  const { isSuperAdmin } = usePlatformStaff();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("support");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["master-staff"],
    queryFn: async (): Promise<StaffRow[]> => {
      const { data, error } = await callStaff({ action: "list-staff" });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error ?? "Falha ao listar a equipe");
      return (data.staff ?? []) as StaffRow[];
    },
  });
  const staff = q.data ?? [];

  async function addMember() {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      toast.error("E-mail inválido.");
      return;
    }
    setAdding(true);
    const { data, error } = await callStaff({ action: "add-staff", email: e, role });
    setAdding(false);
    if (error || !data?.ok) {
      toast.error("Não foi possível adicionar", { description: data?.error ?? error?.message });
      return;
    }
    toast.success("Membro adicionado");
    setEmail("");
    queryClient.invalidateQueries({ queryKey: ["master-staff"] });
  }

  async function removeMember(s: StaffRow) {
    setRemovingId(s.user_id);
    const { data, error } = await callStaff({ action: "remove-staff", userId: s.user_id });
    setRemovingId(null);
    if (error || !data?.ok) {
      toast.error("Não foi possível remover", { description: data?.error ?? error?.message });
      return;
    }
    toast.success("Membro removido");
    queryClient.invalidateQueries({ queryKey: ["master-staff"] });
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-gray-50 dark:bg-background">
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl">
          <PageHeader title="Configurações" subtitle="Equipe da plataforma ConectaChat." />

          {isSuperAdmin && (
            <div className="mb-5 rounded-lg border border-border bg-card p-5">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Adicionar membro</h3>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="st-email">E-mail</Label>
                  <Input
                    id="st-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="pessoa@conectachat.online"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="st-role">Papel</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger id="st-role" className="sm:w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={addMember} disabled={adding}>
                  {adding ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <UserPlus className="mr-1 h-4 w-4" />}
                  Adicionar
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                A pessoa precisa já ter uma conta no ConectaChat (mesmo e-mail).
              </p>
            </div>
          )}

          <div className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground">
              Equipe ({staff.length})
            </div>
            {q.isLoading ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">Carregando…</p>
            ) : q.isError ? (
              <p className="px-5 py-4 text-sm text-red-600">{(q.error as Error)?.message}</p>
            ) : staff.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">Ninguém na equipe ainda.</p>
            ) : (
              <ul className="divide-y divide-border">
                {staff.map((s) => (
                  <li key={s.user_id} className="flex items-center gap-3 px-5 py-3">
                    <div className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-blue/10 text-[13px] font-bold text-brand-blue">
                      {(s.name || s.email || "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {s.name || s.email || s.user_id}
                        </span>
                        {s.is_self && (
                          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                            você
                          </Badge>
                        )}
                      </div>
                      {s.email && <p className="truncate text-xs text-muted-foreground">{s.email}</p>}
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      {ROLE_LABEL[s.role] ?? s.role}
                    </Badge>
                    {isSuperAdmin && !s.is_self && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-600"
                        title="Remover"
                        onClick={() => removeMember(s)}
                        disabled={removingId === s.user_id}
                      >
                        {removingId === s.user_id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
