import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bot, MoreVertical, Plus } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import {
  useAiAgents,
  useCreateAiAgent,
  useDeleteAiAgent,
  useToggleAiAgentActive,
  type AiAgentListItem,
} from "@/hooks/use-ai-agents";

const PROVIDER_LABEL: Record<string, string> = {
  openai: "OpenAI",
  gemini: "Google Gemini",
  claude: "Anthropic Claude",
};

const ACTIVATION_LABEL: Record<string, string> = {
  sempre: "Atende sempre",
  quando_ninguem_atende: "Quando ninguém atende",
  fora_do_horario: "Fora do horário",
};

function formatDate(iso: string) {
  try {
    return format(new Date(iso), "dd 'de' MMM 'de' yyyy", { locale: ptBR });
  } catch {
    return iso;
  }
}

export function AgentsScreen() {
  const { data: agents, isLoading } = useAiAgents();
  const createAgent = useCreateAiAgent();
  const navigate = useNavigate();

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");

  async function handleCreate() {
    const name = newName.trim();
    if (!name) {
      toast.error("Informe um nome para o agente.");
      return;
    }
    try {
      const id = await createAgent.mutateAsync({ name });
      toast.success("Agente criado. Configure a personalidade e a base de conhecimento.");
      setNewName("");
      setCreateOpen(false);
      navigate({ to: "/agentes/$agentId", params: { agentId: id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar agente.");
    }
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Agentes</h1>
          <p className="text-sm text-muted-foreground">
            Crie atendentes de IA que respondem seus clientes no WhatsApp e passam para um humano quando preciso.
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="text-white hover:opacity-90"
          style={{ backgroundColor: "#8FC549" }}
        >
          <Plus className="mr-1 h-4 w-4" />
          Novo agente
        </Button>
      </div>

      {/* Conteúdo */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando agentes...</p>
      ) : !agents || agents.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-12 text-center">
          <Bot className="h-10 w-10 text-muted-foreground" />
          <p className="text-base font-medium text-foreground">Nenhum agente de IA ainda</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Um agente é um atendente virtual com personalidade e base de conhecimento próprias. Você escolhe em
            quais conexões ele atua.
          </p>
          <Button
            onClick={() => setCreateOpen(true)}
            className="text-white hover:opacity-90"
            style={{ backgroundColor: "#8FC549" }}
          >
            <Plus className="mr-1 h-4 w-4" />
            Criar primeiro agente
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}

      {/* Dialog de criação */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo agente</DialogTitle>
            <DialogDescription>Dê um nome para identificar o agente (ex.: SDR Comercial).</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="agent-name">Nome do agente</Label>
            <Input
              id="agent-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ex.: SDR Comercial"
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
              disabled={createAgent.isPending}
              className="text-white hover:opacity-90"
              style={{ backgroundColor: "#8FC549" }}
            >
              {createAgent.isPending ? "Criando..." : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AgentCard({ agent }: { agent: AiAgentListItem }) {
  const navigate = useNavigate();
  const toggleActive = useToggleAiAgentActive();
  const deleteAgent = useDeleteAiAgent();

  const [deleteOpen, setDeleteOpen] = useState(false);

  async function handleToggle(checked: boolean) {
    try {
      await toggleActive.mutateAsync({ id: agent.id, isActive: checked });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar agente.");
    }
  }

  async function handleDelete() {
    try {
      await deleteAgent.mutateAsync({ id: agent.id });
      toast.success("Agente excluído.");
      setDeleteOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir agente.");
    }
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 truncate text-base">
            <Bot className="h-4 w-4 shrink-0 text-brand-blue" />
            {agent.name}
          </CardTitle>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="text-[11px]">
              {PROVIDER_LABEL[agent.provider] ?? agent.provider}
            </Badge>
            <Badge variant="outline" className="text-[11px]">
              {ACTIVATION_LABEL[agent.activation_mode] ?? agent.activation_mode}
            </Badge>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">Atualizado em {formatDate(agent.updated_at)}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => navigate({ to: "/agentes/$agentId", params: { agentId: agent.id } })}>
              Editar
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
          <Switch checked={agent.is_active} onCheckedChange={handleToggle} disabled={toggleActive.isPending} />
          <span className="text-sm text-muted-foreground">Ativo</span>
        </div>
        <Button
          variant="secondary"
          onClick={() => navigate({ to: "/agentes/$agentId", params: { agentId: agent.id } })}
        >
          Editar
        </Button>
      </CardContent>

      {/* Confirmação de exclusão */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir agente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente. O agente &quot;{agent.name}&quot; será removido e deixará de atender nas
              conexões em que estava alocado.
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
