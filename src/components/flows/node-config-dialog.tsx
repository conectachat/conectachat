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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { findCatalogItem } from "./node-catalog";
import {
  useOrgTags,
  useOrgDepartments,
  useOrgAgents,
  useOtherFlows,
} from "@/hooks/use-flow-resources";

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
}: NodeConfigDialogProps) {
  const [config, setConfig] = useState<Record<string, any>>({});

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
            <Label htmlFor="cfg-tagadd">Nome da tag a adicionar</Label>
            <Input
              id="cfg-tagadd"
              value={config.tag ?? ""}
              onChange={(e) => set("tag", e.target.value)}
              placeholder="ex.: lead-quente"
            />
            <p className="text-xs text-muted-foreground">
              Em breve será possível escolher de uma lista das suas tags.
            </p>
          </div>
        );
      case "tag_remove":
        return (
          <div className="space-y-2">
            <Label htmlFor="cfg-tagrem">Nome da tag a remover</Label>
            <Input
              id="cfg-tagrem"
              value={config.tag ?? ""}
              onChange={(e) => set("tag", e.target.value)}
              placeholder="ex.: lead-quente"
            />
            <p className="text-xs text-muted-foreground">
              Em breve será possível escolher de uma lista das suas tags.
            </p>
          </div>
        );
      case "queue":
        return (
          <div className="space-y-2">
            <Label htmlFor="cfg-queue">Departamento / Fila de destino</Label>
            <Input
              id="cfg-queue"
              value={config.department ?? ""}
              onChange={(e) => set("department", e.target.value)}
              placeholder="ex.: Comercial"
            />
            <p className="text-xs text-muted-foreground">
              Em breve será possível escolher de uma lista dos seus departamentos.
            </p>
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
                <Label htmlFor="cfg-attendant">Identificador do atendente</Label>
                <Input
                  id="cfg-attendant"
                  value={config.attendant ?? ""}
                  onChange={(e) => set("attendant", e.target.value)}
                  placeholder="ex.: e-mail ou nome do atendente"
                />
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Em breve será possível escolher de uma lista dos seus atendentes.
            </p>
          </div>
        );
      case "switch_flow":
        return (
          <div className="space-y-2">
            <Label htmlFor="cfg-switchflow">Fluxo de destino</Label>
            <Input
              id="cfg-switchflow"
              value={config.targetFlow ?? ""}
              onChange={(e) => set("targetFlow", e.target.value)}
              placeholder="ex.: Pós-venda"
            />
            <p className="text-xs text-muted-foreground">
              Em breve será possível escolher de uma lista dos seus fluxos.
            </p>
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
