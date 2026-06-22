import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MoreVertical, Plus, Workflow } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  useCreateFlow,
  useDeleteFlow,
  useFlows,
  useRenameFlow,
  useToggleFlowActive,
  type FlowListItem,
} from "@/hooks/use-flows";

function formatDate(iso: string) {
  try {
    return format(new Date(iso), "dd 'de' MMM 'de' yyyy", { locale: ptBR });
  } catch {
    return iso;
  }
}

export function FlowsScreen() {
  const { data: flows, isLoading } = useFlows();
  const createFlow = useCreateFlow();

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");

  async function handleCreate() {
    const name = newName.trim();
    if (!name) {
      toast.error("Informe um nome para o fluxo.");
      return;
    }
    try {
      await createFlow.mutateAsync({ name });
      toast.success("Fluxo criado com sucesso.");
      setNewName("");
      setCreateOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar fluxo.");
    }
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Fluxos</h1>
          <p className="text-sm text-muted-foreground">
            Crie e gerencie os fluxos de atendimento automático.
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="text-white hover:opacity-90"
          style={{ backgroundColor: "#8FC549" }}
        >
          <Plus className="mr-1 h-4 w-4" />
          Novo fluxo
        </Button>
      </div>

      {/* Conteúdo */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando fluxos...</p>
      ) : !flows || flows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-12 text-center">
          <Workflow className="h-10 w-10 text-muted-foreground" />
          <p className="text-base font-medium text-foreground">Nenhum fluxo ainda</p>
          <Button
            onClick={() => setCreateOpen(true)}
            className="text-white hover:opacity-90"
            style={{ backgroundColor: "#8FC549" }}
          >
            <Plus className="mr-1 h-4 w-4" />
            Criar primeiro fluxo
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {flows.map((flow) => (
            <FlowCard key={flow.id} flow={flow} />
          ))}
        </div>
      )}

      {/* Dialog de criação */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo fluxo</DialogTitle>
            <DialogDescription>Dê um nome para identificar o fluxo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="flow-name">Nome do fluxo</Label>
            <Input
              id="flow-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ex.: Boas-vindas"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreate();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createFlow.isPending}
              className="text-white hover:opacity-90"
              style={{ backgroundColor: "#8FC549" }}
            >
              {createFlow.isPending ? "Criando..." : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FlowCard({ flow }: { flow: FlowListItem }) {
  const navigate = useNavigate();
  const toggleActive = useToggleFlowActive();
  const renameFlow = useRenameFlow();
  const deleteFlow = useDeleteFlow();

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(flow.name);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function handleToggle(checked: boolean) {
    try {
      await toggleActive.mutateAsync({ id: flow.id, isActive: checked });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar fluxo.");
    }
  }

  async function handleRename() {
    const name = renameValue.trim();
    if (!name) {
      toast.error("Informe um nome para o fluxo.");
      return;
    }
    try {
      await renameFlow.mutateAsync({ id: flow.id, name });
      toast.success("Fluxo renomeado.");
      setRenameOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao renomear fluxo.");
    }
  }

  async function handleDelete() {
    try {
      await deleteFlow.mutateAsync({ id: flow.id });
      toast.success("Fluxo excluído.");
      setDeleteOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir fluxo.");
    }
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="min-w-0">
          <CardTitle className="truncate text-base">{flow.name}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Criado em {formatDate(flow.created_at)}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                setRenameValue(flow.name);
                setRenameOpen(true);
              }}
            >
              Renomear
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => setDeleteOpen(true)}
            >
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="mt-auto flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Switch
            checked={flow.is_active}
            onCheckedChange={handleToggle}
            disabled={toggleActive.isPending}
          />
          <span className="text-sm text-muted-foreground">Ativo</span>
        </div>
        <Button
          variant="secondary"
          onClick={() => navigate({ to: "/flows/$flowId", params: { flowId: flow.id } })}
        >
          Abrir
        </Button>
      </CardContent>

      {/* Dialog de renomear */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renomear fluxo</DialogTitle>
            <DialogDescription>Atualize o nome do fluxo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`rename-${flow.id}`}>Nome do fluxo</Label>
            <Input
              id={`rename-${flow.id}`}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleRename();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleRename}
              disabled={renameFlow.isPending}
              style={{ backgroundColor: "#0055A6" }}
              className="text-white hover:opacity-90"
            >
              {renameFlow.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fluxo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente e não poderá ser desfeita. O fluxo
              &quot;{flow.name}&quot; será removido definitivamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
