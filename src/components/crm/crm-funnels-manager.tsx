import { useEffect, useMemo, useState } from "react";
import { Settings2, Trash2, Plus, ArrowUp, ArrowDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

import {
  useCreateFunnel,
  useRenameFunnel,
  useDeleteFunnel,
  useFunnelStages,
  useCreateStage,
  useRenameStage,
  useRecolorStage,
  useDeleteStage,
  useReorderStages,
  type CrmFunnel,
  type CrmStage,
} from "@/hooks/use-crm";

const PALETTE = ["#3B82F6", "#22C55E", "#EF4444", "#F59E0B", "#8B5CF6", "#EC4899", "#14B8A6", "#64748B"];
const DEFAULT_STAGE_COLOR = "#64748B";

export function CrmFunnelsManager({ funnels }: { funnels: CrmFunnel[] }) {
  const [open, setOpen] = useState(false);

  // ----- Funis -----
  const [newName, setNewName] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const createFunnel = useCreateFunnel();
  const renameFunnel = useRenameFunnel();
  const deleteFunnel = useDeleteFunnel();

  // ----- Etapas -----
  const [stageFunnelId, setStageFunnelId] = useState<string | null>(null);
  const stagesQuery = useFunnelStages(open ? stageFunnelId : null);
  const stages = useMemo(() => stagesQuery.data ?? [], [stagesQuery.data]);
  const [stageDrafts, setStageDrafts] = useState<Record<string, string>>({});
  const [newStageName, setNewStageName] = useState("");
  const [confirmStageId, setConfirmStageId] = useState<string | null>(null);

  const createStage = useCreateStage();
  const renameStage = useRenameStage();
  const recolorStage = useRecolorStage();
  const deleteStage = useDeleteStage();
  const reorderStages = useReorderStages();

  const openStages = useMemo(
    () => stages.filter((s) => s.kind === "open").sort((a, b) => a.position - b.position),
    [stages],
  );
  const wonStage = stages.find((s) => s.kind === "won") ?? null;
  const lostStage = stages.find((s) => s.kind === "lost") ?? null;
  const endStages = [wonStage, lostStage].filter(Boolean) as CrmStage[];

  // Ao abrir (ou quando a lista muda), recarrega os nomes editáveis dos funis.
  useEffect(() => {
    if (!open) return;
    const d: Record<string, string> = {};
    for (const f of funnels) d[f.id] = f.name;
    setDrafts(d);
    setConfirmId(null);
  }, [open, funnels]);

  // Garante um funil escolhido na seção de etapas.
  useEffect(() => {
    if (!open) return;
    if (funnels.length === 0) {
      setStageFunnelId(null);
      return;
    }
    const exists = !!stageFunnelId && funnels.some((f) => f.id === stageFunnelId);
    if (!exists) setStageFunnelId(funnels[0].id);
  }, [open, funnels, stageFunnelId]);

  // Recarrega os nomes editáveis das etapas.
  useEffect(() => {
    const d: Record<string, string> = {};
    for (const s of stages) d[s.id] = s.name;
    setStageDrafts(d);
    setConfirmStageId(null);
  }, [stages]);

  // ---- ações de funil ----
  async function handleCreateFunnel() {
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

  async function handleRenameFunnel(id: string) {
    const name = (drafts[id] ?? "").trim();
    if (!name) return;
    try {
      await renameFunnel.mutateAsync({ id, name });
      toast.success("Funil renomeado.");
    } catch {
      toast.error("Não foi possível renomear o funil.");
    }
  }

  async function handleDeleteFunnel(id: string) {
    try {
      await deleteFunnel.mutateAsync({ id });
      toast.success("Funil excluído.");
    } catch (err) {
      const msg = (err as { message?: string })?.message;
      if (msg === "LAST_FUNNEL") toast.error("A empresa precisa de pelo menos um funil.");
      else if (msg === "HAS_CARDS") toast.error("Esse funil tem cartões. Mova ou remova os cartões antes de excluir.");
      else toast.error("Não foi possível excluir o funil.");
    } finally {
      setConfirmId(null);
    }
  }

  // ---- ações de etapa ----
  async function handleAddStage() {
    if (!stageFunnelId) return;
    const name = newStageName.trim();
    if (!name) return;
    try {
      await createStage.mutateAsync({ funnelId: stageFunnelId, name, color: DEFAULT_STAGE_COLOR });
      toast.success("Etapa criada.");
      setNewStageName("");
    } catch {
      toast.error("Não foi possível criar a etapa.");
    }
  }

  async function handleRenameStage(id: string) {
    const name = (stageDrafts[id] ?? "").trim();
    if (!name) return;
    try {
      await renameStage.mutateAsync({ id, name });
      toast.success("Etapa renomeada.");
    } catch {
      toast.error("Não foi possível renomear a etapa.");
    }
  }

  async function handleRecolor(id: string, color: string) {
    try {
      await recolorStage.mutateAsync({ id, color });
    } catch {
      toast.error("Não foi possível mudar a cor.");
    }
  }

  async function handleDeleteStage(id: string) {
    if (!stageFunnelId) return;
    try {
      await deleteStage.mutateAsync({ id, funnelId: stageFunnelId });
      toast.success("Etapa excluída.");
    } catch (err) {
      const msg = (err as { message?: string })?.message;
      if (msg === "HAS_CARDS") toast.error("Essa etapa tem cartões. Mova os cartões antes de excluir.");
      else toast.error("Não foi possível excluir a etapa.");
    } finally {
      setConfirmStageId(null);
    }
  }

  function moveOpen(index: number, dir: -1 | 1) {
    if (!stageFunnelId) return;
    const ids = openStages.map((s) => s.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    const tmp = ids[index];
    ids[index] = ids[j];
    ids[j] = tmp;
    reorderStages.mutate({
      funnelId: stageFunnelId,
      openIdsInOrder: ids,
      wonId: wonStage?.id ?? null,
      lostId: lostStage?.id ?? null,
    });
  }

  // ---- pecinha visual: paleta de cores ----
  function Palette({ stage }: { stage: CrmStage }) {
    return (
      <div className="flex flex-wrap gap-1">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => handleRecolor(stage.id, c)}
            className={`h-5 w-5 rounded-full border ${
              stage.color === c ? "ring-2 ring-offset-1 ring-foreground" : "border-border"
            }`}
            style={{ backgroundColor: c }}
            title="Definir cor"
          />
        ))}
      </div>
    );
  }

  return (
    <>
      <Button variant="outline" size="icon" onClick={() => setOpen(true)} title="Gerenciar funis e etapas">
        <Settings2 className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gerenciar funis e etapas</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* =================== FUNIS =================== */}
            <div className="space-y-3">
              <Label>Funis</Label>

              <div className="flex gap-2">
                <Input
                  placeholder="Novo funil (ex.: Funil de Suporte)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateFunnel();
                  }}
                />
                <Button onClick={handleCreateFunnel} disabled={!newName.trim() || createFunnel.isPending}>
                  <Plus className="mr-1 h-4 w-4" />
                  Criar
                </Button>
              </div>

              {funnels.map((f) => {
                const draft = drafts[f.id] ?? "";
                const changed = draft.trim() !== f.name && draft.trim().length > 0;
                return (
                  <div key={f.id} className="flex items-center gap-2">
                    <Input
                      value={draft}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [f.id]: e.target.value }))}
                      className="h-8"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRenameFunnel(f.id)}
                      disabled={renameFunnel.isPending || !changed}
                    >
                      Salvar
                    </Button>
                    {confirmId === f.id ? (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteFunnel(f.id)}
                        disabled={deleteFunnel.isPending}
                      >
                        Confirmar
                      </Button>
                    ) : (
                      <Button variant="ghost" size="icon" onClick={() => setConfirmId(f.id)} title="Excluir funil">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* =================== ETAPAS =================== */}
            <div className="space-y-3 border-t border-border pt-5">
              <Label>Etapas do funil</Label>

              <Select value={stageFunnelId ?? undefined} onValueChange={setStageFunnelId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolher funil" />
                </SelectTrigger>
                <SelectContent>
                  {funnels.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* nova etapa */}
              <div className="flex gap-2">
                <Input
                  placeholder="Nova etapa (ex.: Em negociação)"
                  value={newStageName}
                  onChange={(e) => setNewStageName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddStage();
                  }}
                />
                <Button
                  onClick={handleAddStage}
                  disabled={!newStageName.trim() || !stageFunnelId || createStage.isPending}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Adicionar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                A etapa nova entra antes de Ganho e Perdido (que ficam sempre no fim).
              </p>

              {/* etapas reordenáveis (open) */}
              {openStages.map((s, i) => {
                const draft = stageDrafts[s.id] ?? "";
                const changed = draft.trim() !== s.name && draft.trim().length > 0;
                return (
                  <div key={s.id} className="space-y-2 rounded-md border border-border p-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: s.color ?? "#94A3B8" }}
                      />
                      <Input
                        value={draft}
                        onChange={(e) => setStageDrafts((prev) => ({ ...prev, [s.id]: e.target.value }))}
                        className="h-8"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRenameStage(s.id)}
                        disabled={renameStage.isPending || !changed}
                      >
                        Salvar
                      </Button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <Palette stage={s} />
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => moveOpen(i, -1)}
                          disabled={i === 0 || reorderStages.isPending}
                          title="Subir"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => moveOpen(i, 1)}
                          disabled={i === openStages.length - 1 || reorderStages.isPending}
                          title="Descer"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        {confirmStageId === s.id ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteStage(s.id)}
                            disabled={deleteStage.isPending}
                          >
                            Confirmar
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setConfirmStageId(s.id)}
                            title="Excluir etapa"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* etapas fixas (Ganho / Perdido) — renomear e cor, sem excluir/mover */}
              {endStages.map((s) => {
                const draft = stageDrafts[s.id] ?? "";
                const changed = draft.trim() !== s.name && draft.trim().length > 0;
                return (
                  <div key={s.id} className="space-y-2 rounded-md border border-border bg-muted/30 p-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: s.color ?? "#94A3B8" }}
                      />
                      <Input
                        value={draft}
                        onChange={(e) => setStageDrafts((prev) => ({ ...prev, [s.id]: e.target.value }))}
                        className="h-8"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRenameStage(s.id)}
                        disabled={renameStage.isPending || !changed}
                      >
                        Salvar
                      </Button>
                      <span className="whitespace-nowrap text-xs text-muted-foreground">
                        {s.kind === "won" ? "Ganho" : "Perdido"}
                      </span>
                    </div>
                    <Palette stage={s} />
                  </div>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
