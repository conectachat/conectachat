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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { findCatalogItem } from "./node-catalog";

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
