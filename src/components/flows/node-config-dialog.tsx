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
