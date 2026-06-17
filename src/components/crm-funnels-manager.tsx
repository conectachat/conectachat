import { useEffect, useState } from "react";
import { Settings2, Trash2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

import { useCreateFunnel, useRenameFunnel, useDeleteFunnel, type CrmFunnel } from "@/hooks/use-crm";

export function CrmFunnelsManager({ funnels }: { funnels: CrmFunnel[] }) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const createFunnel = useCreateFunnel();
  const renameFunnel = useRenameFunnel();
  const deleteFunnel = useDeleteFunnel();

  // Ao abrir (ou quando a lista muda), recarrega os nomes editáveis.
  useEffect(() => {
    if (!open) return;
    const d: Record<string, string> = {};
    for (const f of funnels) d[f.id] = f.name;
    setDrafts(d);
    setConfirmId(null);
  }, [open, funnels]);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    try {
      await createFunnel.mutateAsync({ name });
      toast.success("Funil criado.");
      setNewName("");
    } catch {
      toast.error("Não foi possível criar o funil.");
    }
  }

  async function handleRename(id: string) {
    const name = (drafts[id] ?? "").trim();
    if (!name) return;
    try {
      await renameFunnel.mutateAsync({ id, name });
      toast.success("Funil renomeado.");
    } catch {
      toast.error("Não foi possível renomear o funil.");
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteFunnel.mutateAsync({ id });
      toast.success("Funil excluído.");
    } catch (err) {
      const msg = (err as { message?: string })?.message;
      if (msg === "LAST_FUNNEL") {
        toast.error("A empresa precisa de pelo menos um funil.");
      } else if (msg === "HAS_CARDS") {
        toast.error("Esse funil tem cartões. Mova ou remova os cartões antes de excluir.");
      } else {
        toast.error("Não foi possível excluir o funil.");
      }
    } finally {
      setConfirmId(null);
    }
  }

  return (
    <>
      <Button variant="outline" size="icon" onClick={() => setOpen(true)} title="Gerenciar funis">
        <Settings2 className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerenciar funis</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* Criar novo */}
            <div className="space-y-1.5">
              <Label htmlFor="novo-funil">Novo funil</Label>
              <div className="flex gap-2">
                <Input
                  id="novo-funil"
                  placeholder="Ex.: Funil de Suporte"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                  }}
                />
                <Button onClick={handleCreate} disabled={!newName.trim() || createFunnel.isPending}>
                  <Plus className="mr-1 h-4 w-4" />
                  Criar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Todo funil novo já nasce com as etapas Novo Lead, Ganho e Perdido.
              </p>
            </div>

            {/* Lista de funis existentes */}
            <div className="space-y-2">
              <Label>Funis existentes</Label>
              {funnels.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum funil ainda.</p>
              ) : (
                funnels.map((f) => {
                  const draft = drafts[f.id] ?? "";
                  const changed = draft.trim() !== f.name && draft.trim().length > 0;
                  return (
                    <div key={f.id} className="flex items-center gap-2">
                      <Input
                        value={draft}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [f.id]: e.target.value }))}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRename(f.id)}
                        disabled={renameFunnel.isPending || !changed}
                      >
                        Salvar
                      </Button>
                      {confirmId === f.id ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(f.id)}
                          disabled={deleteFunnel.isPending}
                        >
                          Confirmar
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setConfirmId(f.id)}
                          title="Excluir funil"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
