import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { AiModelSelect } from "@/components/shared/ai-model-select";
import { defaultModelFor, isKnownModel } from "@/lib/ai-models";
import { findCatalogItem } from "./node-catalog";
import {
  useOrgTags,
  useOrgDepartments,
  useOrgAgents,
  useOtherFlows,
} from "@/hooks/use-flow-resources";
import { useAiAgents } from "@/hooks/use-ai-agents";

export type FlowNodeData = {
  nodeType?: string;
  label?: string;
  color?: string;
  config?: Record<string, any>;
};

type NodeConfigDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string | null;
  nodeType: string | null;
  initialConfig: Record<string, any>;
  canDelete: boolean;
  onSave: (nodeId: string, config: Record<string, any>) => void;
  onDelete: (nodeId: string) => void;
  currentFlowId?: string | null;
};

export function NodeConfigDialog({
  open,
  onOpenChange,
  nodeId,
  nodeType,
  initialConfig,
  canDelete,
  onSave,
  onDelete,
  currentFlowId,
}: NodeConfigDialogProps) {
  const [config, setConfig] = useState<Record<string, any>>({});

  const tags = useOrgTags();
  const departments = useOrgDepartments();
  const agents = useOrgAgents();
  const otherFlows = useOtherFlows(currentFlowId ?? null);
  const aiAgents = useAiAgents();

  useEffect(() => {
    if (open) {
      setConfig(initialConfig ?? {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, nodeId]);

  const set = (key: string, value: any) =>
    setConfig((c) => ({ ...c, [key]: value }));

  const options: any[] = Array.isArray(config.options) ? config.options : [];
  const setOptions = (next: any[]) => set("options", next);
  const addOption = (template: any) => setOptions([...options, template]);
  const updateOption = (idx: number, patch: any) =>
    setOptions(options.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  const removeOption = (idx: number) =>
    setOptions(options.filter((_, i) => i !== idx));

  const found = nodeType ? findCatalogItem(nodeType) : null;

  function renderForm() {
    switch (nodeType) {
      case "message":
        return (
          <div className="space-y-2">
            <Label htmlFor="cfg-text">Mensagem</Label>
            <Textarea
              id="cfg-text"
              value={config.text ?? ""}
              onChange={(e) => set("text", e.target.value)}
              rows={5}
              placeholder="Digite a mensagem que será enviada..."
            />
            <p className="text-xs text-muted-foreground">
              Você pode usar variáveis como {"{nome}"} e {"{email}"}.
            </p>
          </div>
        );
      case "media":
        return (
          <>
            <div className="space-y-2">
              <Label>Tipo de mídia</Label>
              <Select
                value={config.mediaType ?? ""}
                onValueChange={(v) => set("mediaType", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="image">Imagem</SelectItem>
                  <SelectItem value="video">Vídeo</SelectItem>
                  <SelectItem value="audio">Áudio</SelectItem>
                  <SelectItem value="document">Documento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cfg-url">URL da mídia</Label>
              <Input
                id="cfg-url"
                value={config.url ?? ""}
                onChange={(e) => set("url", e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cfg-caption">Legenda (opcional)</Label>
              <Input
                id="cfg-caption"
                value={config.caption ?? ""}
                onChange={(e) => set("caption", e.target.value)}
              />
            </div>
          </>
        );
      case "question":
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="cfg-q">Pergunta</Label>
              <Textarea
                id="cfg-q"
                value={config.text ?? ""}
                onChange={(e) => set("text", e.target.value)}
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cfg-var">Salvar resposta na variável</Label>
              <Input
                id="cfg-var"
                value={config.variable ?? ""}
                onChange={(e) => set("variable", e.target.value)}
                placeholder="ex.: email"
              />
            </div>
          </>
        );
      case "validation":
        return (
          <>
            <div className="space-y-2">
              <Label>Validar como</Label>
              <Select
                value={config.validationType ?? ""}
                onValueChange={(v) => set("validationType", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">E-mail</SelectItem>
                  <SelectItem value="phone">Telefone</SelectItem>
                  <SelectItem value="number">Número</SelectItem>
                  <SelectItem value="text">Texto livre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cfg-err">Mensagem de erro</Label>
              <Input
                id="cfg-err"
                value={config.errorMessage ?? ""}
                onChange={(e) => set("errorMessage", e.target.value)}
                placeholder="ex.: E-mail inválido, tente novamente"
              />
            </div>
          </>
        );
      case "menu_text":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cfg-menu-text">Texto do menu</Label>
              <Textarea
                id="cfg-menu-text"
                value={config.text ?? ""}
                onChange={(e) => set("text", e.target.value)}
                rows={4}
                placeholder="Ex.: Escolha uma opção:"
              />
            </div>
            <div className="space-y-2">
              <Label>Opções</Label>
              <div className="space-y-2">
                {options.map((option, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      className="w-16 text-center"
                      value={option.key ?? ""}
                      onChange={(e) => updateOption(idx, { key: e.target.value })}
                      placeholder="1"
                    />
                    <Input
                      className="flex-1"
                      value={option.label ?? ""}
                      onChange={(e) => updateOption(idx, { label: e.target.value })}
                      placeholder="Falar com vendas"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive shrink-0"
                      onClick={() => removeOption(idx)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => addOption({ key: "", label: "" })}
              >
                <Plus className="mr-2 h-4 w-4" />
                Adicionar opção
              </Button>
            </div>
            <div className="space-y-2 rounded-lg border p-3">
              <Label htmlFor="cfg-menu-invalid">
                Mensagem de opção inválida (opcional)
              </Label>
              <Input
                id="cfg-menu-invalid"
                value={config.invalidMessage ?? ""}
                onChange={(e) => set("invalidMessage", e.target.value)}
                placeholder="Opção inválida. Por favor, escolha uma das opções."
              />
              <div className="pt-2">
                <Label htmlFor="cfg-menu-maxtries">Máximo de tentativas</Label>
                <Input
                  id="cfg-menu-maxtries"
                  type="number"
                  min={1}
                  value={config.maxTries ?? ""}
                  onChange={(e) => set("maxTries", e.target.value)}
                  placeholder="3"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Se o contato errar a opção, o bot avisa e repete o menu. Após o
                número máximo de tentativas, o fluxo segue por uma saída "solta"
                do menu (uma seta que NÃO sai de uma opção numerada) — ligue-a a
                um nó "Atendente" ou "Encerrar". Sem essa saída, a conversa do
                bot é encerrada. Padrão: 3 tentativas.
              </p>
            </div>
          </div>
        );
      case "buttons":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cfg-buttons-text">Texto</Label>
              <Textarea
                id="cfg-buttons-text"
                value={config.text ?? ""}
                onChange={(e) => set("text", e.target.value)}
                rows={4}
                placeholder="Texto antes dos botões..."
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Botões</Label>
                <span className="text-xs text-muted-foreground">
                  O WhatsApp permite no máximo 3 botões.
                </span>
              </div>
              <div className="space-y-2">
                {options.map((option, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      className="flex-1"
                      value={option.label ?? ""}
                      onChange={(e) => updateOption(idx, { label: e.target.value })}
                      placeholder="Texto do botão"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive shrink-0"
                      onClick={() => removeOption(idx)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                disabled={options.length >= 3}
                onClick={() => addOption({ label: "" })}
              >
                <Plus className="mr-2 h-4 w-4" />
                Adicionar botão
              </Button>
            </div>
          </div>
        );
      case "list":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cfg-list-text">Texto</Label>
              <Textarea
                id="cfg-list-text"
                value={config.text ?? ""}
                onChange={(e) => set("text", e.target.value)}
                rows={4}
                placeholder="Texto antes da lista..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cfg-list-btn-lbl">Rótulo do botão da lista</Label>
              <Input
                id="cfg-list-btn-lbl"
                value={config.buttonLabel ?? ""}
                onChange={(e) => set("buttonLabel", e.target.value)}
                placeholder="Ver opções"
              />
            </div>
            <div className="space-y-2">
              <Label>Itens da Lista</Label>
              <div className="space-y-2">
                {options.map((option, idx) => (
                  <div key={idx} className="flex items-start gap-2 border rounded-lg p-2 bg-muted/10">
                    <div className="flex-1 space-y-2">
                      <Input
                        value={option.title ?? ""}
                        onChange={(e) => updateOption(idx, { title: e.target.value })}
                        placeholder="Título do item"
                      />
                      <Input
                        value={option.description ?? ""}
                        onChange={(e) => updateOption(idx, { description: e.target.value })}
                        placeholder="Descrição (opcional)"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive shrink-0 mt-1"
                      onClick={() => removeOption(idx)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => addOption({ title: "", description: "" })}
              >
                <Plus className="mr-2 h-4 w-4" />
                Adicionar item
              </Button>
            </div>
          </div>
        );
      case "condition":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cfg-cond-var">Variável a verificar</Label>
              <Input
                id="cfg-cond-var"
                value={config.variable ?? ""}
                onChange={(e) => set("variable", e.target.value)}
                placeholder="ex.: email"
              />
            </div>
            <div className="space-y-2">
              <Label>Operador</Label>
              <Select
                value={config.operator ?? ""}
                onValueChange={(v) => set("operator", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="equals">É igual a</SelectItem>
                  <SelectItem value="not_equals">É diferente de</SelectItem>
                  <SelectItem value="contains">Contém</SelectItem>
                  <SelectItem value="greater">Maior que</SelectItem>
                  <SelectItem value="less">Menor que</SelectItem>
                  <SelectItem value="empty">Está vazio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cfg-cond-val">Valor de comparação</Label>
              <Input
                id="cfg-cond-val"
                value={config.value ?? ""}
                onChange={(e) => set("value", e.target.value)}
                placeholder="ex.: sim"
                disabled={config.operator === "empty"}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              As saídas Verdadeiro/Falso poderão seguir caminhos diferentes do fluxo (configuração das conexões em breve).
            </p>
          </div>
        );
      case "schedule":
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="cfg-sched-start">Início do expediente</Label>
                <Input
                  id="cfg-sched-start"
                  type="time"
                  value={config.startTime ?? ""}
                  onChange={(e) => set("startTime", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cfg-sched-end">Fim do expediente</Label>
                <Input
                  id="cfg-sched-end"
                  type="time"
                  value={config.endTime ?? ""}
                  onChange={(e) => set("endTime", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cfg-sched-days">Dias de atendimento</Label>
              <Input
                id="cfg-sched-days"
                value={config.days ?? ""}
                onChange={(e) => set("days", e.target.value)}
                placeholder="ex.: seg, ter, qua, qui, sex"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Fora do horário/dias definidos, o fluxo poderá seguir um caminho diferente (configuração das conexões em breve).
            </p>
          </div>
        );
      case "delay":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cfg-delay-amount">Duração</Label>
              <Input
                id="cfg-delay-amount"
                type="number"
                min={0}
                value={config.amount ?? ""}
                onChange={(e) => set("amount", e.target.value)}
                placeholder="ex.: 5"
              />
            </div>
            <div className="space-y-2">
              <Label>Unidade</Label>
              <Select
                value={config.unit ?? ""}
                onValueChange={(v) => set("unit", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="seconds">Segundos</SelectItem>
                  <SelectItem value="minutes">Minutos</SelectItem>
                  <SelectItem value="hours">Horas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      case "variable":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cfg-var-name">Nome da variável</Label>
              <Input
                id="cfg-var-name"
                value={config.name ?? ""}
                onChange={(e) => set("name", e.target.value)}
                placeholder="ex.: status"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cfg-var-value">Valor</Label>
              <Input
                id="cfg-var-value"
                value={config.value ?? ""}
                onChange={(e) => set("value", e.target.value)}
                placeholder="ex.: lead_qualificado"
              />
              <p className="text-xs text-muted-foreground">
                Você pode usar outras variáveis, como {"{nome}"}.
              </p>
            </div>
          </div>
        );
      case "tag_add":
        return (
          <div className="space-y-2">
            <Label>Tag a adicionar</Label>
            <Select
              value={config.tagId ?? ""}
              onValueChange={(v) => set("tagId", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma tag..." />
              </SelectTrigger>
              <SelectContent>
                {(tags.data ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(tags.data?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhuma tag cadastrada ainda.
              </p>
            ) : null}
          </div>
        );
      case "tag_remove":
        return (
          <div className="space-y-2">
            <Label>Tag a remover</Label>
            <Select
              value={config.tagId ?? ""}
              onValueChange={(v) => set("tagId", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma tag..." />
              </SelectTrigger>
              <SelectContent>
                {(tags.data ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(tags.data?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhuma tag cadastrada ainda.
              </p>
            ) : null}
          </div>
        );
      case "queue":
        return (
          <div className="space-y-2">
            <Label>Departamento / Fila de destino</Label>
            <Select
              value={config.departmentId ?? ""}
              onValueChange={(v) => set("departmentId", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um departamento..." />
              </SelectTrigger>
              <SelectContent>
                {(departments.data ?? []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(departments.data?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhum departamento cadastrado ainda.
              </p>
            ) : null}
          </div>
        );
      case "attendant":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Transferir para</Label>
              <Select
                value={config.target ?? ""}
                onValueChange={(v) => set("target", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Qualquer atendente disponível</SelectItem>
                  <SelectItem value="specific">Atendente específico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {config.target === "specific" ? (
              <div className="space-y-2">
                <Label>Atendente</Label>
                <Select
                  value={config.agentId ?? ""}
                  onValueChange={(v) => set("agentId", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um atendente..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(agents.data ?? []).map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(agents.data?.length ?? 0) === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nenhum atendente encontrado.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      case "switch_flow":
        return (
          <div className="space-y-2">
            <Label>Fluxo de destino</Label>
            <Select
              value={config.targetFlowId ?? ""}
              onValueChange={(v) => set("targetFlowId", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um fluxo..." />
              </SelectTrigger>
              <SelectContent>
                {(otherFlows.data ?? []).map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(otherFlows.data?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhum outro fluxo disponível.
              </p>
            ) : null}
          </div>
        );
      case "end":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cfg-end-msg">Mensagem de despedida (opcional)</Label>
              <Textarea
                id="cfg-end-msg"
                value={config.farewell ?? ""}
                onChange={(e) => set("farewell", e.target.value)}
                rows={3}
                placeholder="ex.: Obrigado pelo contato! Até logo."
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="cfg-end-resolve">Marcar conversa como resolvida</Label>
                <p className="text-xs text-muted-foreground">
                  Encerra e marca a conversa como finalizada.
                </p>
              </div>
              <Switch
                id="cfg-end-resolve"
                checked={!!config.markResolved}
                onCheckedChange={(v) => set("markResolved", v)}
              />
            </div>
          </div>
        );
      case "http":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Método</Label>
              <Select
                value={config.method ?? "GET"}
                onValueChange={(v) => set("method", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cfg-http-url">URL</Label>
              <Input
                id="cfg-http-url"
                value={config.url ?? ""}
                onChange={(e) => set("url", e.target.value)}
                placeholder="https://api.exemplo.com/endpoint"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cfg-http-headers">Cabeçalhos (JSON, opcional)</Label>
              <Textarea
                id="cfg-http-headers"
                value={config.headers ?? ""}
                onChange={(e) => set("headers", e.target.value)}
                rows={3}
                placeholder='{"Authorization": "Bearer ..."}'
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cfg-http-body">Corpo da requisição (JSON, opcional)</Label>
              <Textarea
                id="cfg-http-body"
                value={config.body ?? ""}
                onChange={(e) => set("body", e.target.value)}
                rows={3}
                placeholder='{"nome": "{nome}"}'
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cfg-http-var">Salvar resposta na variável</Label>
              <Input
                id="cfg-http-var"
                value={config.responseVariable ?? ""}
                onChange={(e) => set("responseVariable", e.target.value)}
                placeholder="ex.: resposta_api"
              />
            </div>
          </div>
        );
      case "ai":
        return (
          <Tabs defaultValue="config" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="config">Configuração</TabsTrigger>
              <TabsTrigger value="advanced">Avançado</TabsTrigger>
            </TabsList>
            <TabsContent value="config" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Usar um agente de IA</Label>
                <Select
                  value={config.aiAgentId ? config.aiAgentId : "manual"}
                  onValueChange={(v) => set("aiAgentId", v === "manual" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Não — configurar manualmente</SelectItem>
                    {(aiAgents.data ?? []).map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Use a persona, a base de conhecimento, o provedor e o modelo de um agente já criado em
                  "Agentes". Os campos manuais abaixo ficam desativados.
                  {(aiAgents.data ?? []).length === 0
                    ? " Nenhum agente criado ainda — crie um no menu Agentes."
                    : ""}
                </p>
              </div>
              {config.aiAgentId ? (
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  Este nó usará as configurações do agente «
                  {(aiAgents.data ?? []).find((a) => a.id === config.aiAgentId)?.name ?? "selecionado"}
                  ». Provedor, modelo e prompt do sistema vêm do agente.
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Provedor de IA</Label>
                    <Select
                      value={config.provider ?? ""}
                      onValueChange={(v) => {
                        set("provider", v);
                        if (!config.model || !isKnownModel(v, config.model)) set("model", defaultModelFor(v));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openai">OpenAI (ChatGPT)</SelectItem>
                        <SelectItem value="gemini">Google Gemini</SelectItem>
                        <SelectItem value="claude">Anthropic Claude</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      A chave de API é configurada em Integrações → Inteligência Artificial e usada com segurança no
                      servidor.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Modelo</Label>
                    <AiModelSelect
                      provider={config.provider ?? ""}
                      value={config.model ?? ""}
                      onChange={(m) => set("model", m)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cfg-ai-prompt">Prompt do sistema</Label>
                    <Textarea
                      id="cfg-ai-prompt"
                      value={config.systemPrompt ?? ""}
                      onChange={(e) => set("systemPrompt", e.target.value)}
                      rows={6}
                      placeholder="Descreva como a IA deve se comportar..."
                    />
                  </div>
                </>
              )}
              <div className="space-y-2">
                <Label>Comportamento</Label>
                <Select
                  value={config.behavior ?? "once"}
                  onValueChange={(v) => set("behavior", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once">Responder uma vez</SelectItem>
                    <SelectItem value="permanent">Assumir a conversa</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  "Responder uma vez": a IA responde e o fluxo segue adiante.
                  "Assumir a conversa": a IA continua respondendo cada mensagem
                  do cliente até ele pedir um atendente ou um humano assumir.
                </p>
              </div>
              {config.behavior === "permanent" ? (
                <div className="space-y-2">
                  <Label htmlFor="cfg-ai-exit">Palavras de saída</Label>
                  <Input
                    id="cfg-ai-exit"
                    value={config.exitKeywords ?? ""}
                    onChange={(e) => set("exitKeywords", e.target.value)}
                    placeholder="ex.: atendente, humano, pessoa"
                  />
                  <p className="text-xs text-muted-foreground">
                    Se o cliente digitar uma destas palavras, a IA encerra e o
                    fluxo segue pela saída do nó (ligue-a a um nó "Transferir
                    para atendente", por exemplo). Separe por vírgulas.
                  </p>
                </div>
              ) : null}
            </TabsContent>
            <TabsContent value="advanced" className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="cfg-ai-temp">Temperatura</Label>
                  <Input
                    id="cfg-ai-temp"
                    type="number"
                    step="0.1"
                    min={0}
                    max={2}
                    value={config.temperature ?? ""}
                    onChange={(e) => set("temperature", e.target.value)}
                    placeholder="0.7"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cfg-ai-tokens">Máx. tokens</Label>
                  <Input
                    id="cfg-ai-tokens"
                    type="number"
                    min={1}
                    value={config.maxTokens ?? ""}
                    onChange={(e) => set("maxTokens", e.target.value)}
                    placeholder="1000"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cfg-ai-history">Histórico de mensagens</Label>
                <Input
                  id="cfg-ai-history"
                  type="number"
                  min={0}
                  value={config.history ?? ""}
                  onChange={(e) => set("history", e.target.value)}
                  placeholder="ex.: 10"
                />
                <p className="text-xs text-muted-foreground">
                  Quantas mensagens anteriores a IA deve lembrar.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cfg-ai-var">Salvar resposta na variável</Label>
                <Input
                  id="cfg-ai-var"
                  value={config.responseVariable ?? ""}
                  onChange={(e) => set("responseVariable", e.target.value)}
                  placeholder="ex.: resposta_ia"
                />
              </div>
            </TabsContent>
          </Tabs>
        );
      default:
        return (
          <p className="text-sm text-muted-foreground">
            Configuração em breve para este tipo de nó.
          </p>
        );
    }
  }

  if (!nodeId) {
    return (
      <Dialog open={false} onOpenChange={onOpenChange}>
        <DialogContent />
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{found?.item.label ?? "Configurar nó"}</DialogTitle>
          <DialogDescription>
            Configure o comportamento deste nó.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">{renderForm()}</div>

        <DialogFooter>
          <div className="flex w-full items-center justify-between">
            <div>
              {canDelete ? (
                <Button
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    onDelete(nodeId);
                    onOpenChange(false);
                  }}
                >
                  Excluir
                </Button>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                className="text-white hover:opacity-90"
                style={{ backgroundColor: "#8FC549" }}
                onClick={() => {
                  onSave(nodeId, config);
                  onOpenChange(false);
                }}
              >
                Salvar
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
