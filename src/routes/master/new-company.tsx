import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, CheckCircle2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/master/new-company")({
  head: () => ({ meta: [{ title: "Nova empresa — ConectaChat" }] }),
  component: NewCompanyPage,
});

type PlanOption = { id: string; name: string; is_active: boolean };

const NO_PLAN = "none";
const SUB_OPTIONS: { value: string; label: string }[] = [
  { value: "trialing", label: "Em teste (trial)" },
  { value: "active", label: "Ativa" },
];

function NewCompanyPage() {
  const queryClient = useQueryClient();

  const [companyName, setCompanyName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [planId, setPlanId] = useState<string>(NO_PLAN);
  const [status, setStatus] = useState<string>("trialing");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ name: string; email: string } | null>(null);

  // Planos para o menu (leitura pública pela RLS).
  const plansQuery = useQuery({
    queryKey: ["plans-options"],
    queryFn: async (): Promise<PlanOption[]> => {
      const { data, error } = await supabase
        .from("plans")
        .select("id, name, is_active")
        .order("price_cents", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PlanOption[];
    },
  });
  const plans = plansQuery.data ?? [];

  function resetForm() {
    setCompanyName("");
    setOwnerName("");
    setOwnerEmail("");
    setPlanId(NO_PLAN);
    setStatus("trialing");
    setDone(null);
  }

  async function handleCreate() {
    const name = companyName.trim();
    const oName = ownerName.trim();
    const oEmail = ownerEmail.trim().toLowerCase();

    if (!name) return toast.error("Informe o nome da empresa.");
    if (!oName) return toast.error("Informe o nome do dono.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(oEmail)) return toast.error("E-mail do dono inválido.");

    setSaving(true);
    const { data, error } = await supabase.functions.invoke("manage-platform", {
      body: {
        action: "create-client",
        companyName: name,
        ownerName: oName,
        ownerEmail: oEmail,
        planId: planId === NO_PLAN ? null : planId,
        status,
      },
    });
    setSaving(false);

    if (error || !data?.ok) {
      toast.error("Não foi possível criar a empresa", { description: data?.error ?? error?.message });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["platform-clients"] });
    setDone({ name, email: oEmail });
    toast.success("Empresa criada");
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-gray-50 dark:bg-background">
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-xl">
          <PageHeader title="Nova empresa" subtitle="Cadastre uma empresa-cliente e convide o responsável." />

          {done ? (
            <div className="rounded-lg border border-border bg-card p-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="text-base font-semibold text-foreground">Empresa “{done.name}” criada</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Enviamos um convite para <span className="font-medium text-foreground">{done.email}</span> definir a
                própria senha e acessar.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to="/master/companies">
                    Ver empresas <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
                <Button size="sm" onClick={resetForm}>
                  <Plus className="mr-1 h-4 w-4" /> Cadastrar outra
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 rounded-lg border border-border bg-card p-6">
              <div className="space-y-1.5">
                <Label htmlFor="nc-company">Nome da empresa</Label>
                <Input id="nc-company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Ex.: Duli Consulting" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="nc-owner">Nome do dono</Label>
                <Input id="nc-owner" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Ex.: Renato" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="nc-email">E-mail do dono</Label>
                <Input id="nc-email" type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="dono@empresa.com" />
                <p className="text-xs text-muted-foreground">
                  O dono recebe um e-mail com um link para definir a própria senha e acessar.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="nc-plan">Plano</Label>
                  <Select value={planId} onValueChange={setPlanId}>
                    <SelectTrigger id="nc-plan"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_PLAN}>Sem plano</SelectItem>
                      {plans.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}{!p.is_active ? " (inativo)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nc-status">Assinatura</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger id="nc-status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SUB_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="pt-1">
                <Button onClick={handleCreate} disabled={saving} className="w-full sm:w-auto">
                  {saving ? "Criando…" : (<><Plus className="mr-1 h-4 w-4" /> Criar empresa</>)}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
