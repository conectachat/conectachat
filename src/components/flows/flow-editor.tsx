import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  NodeToolbar,
  MarkerType,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type NodeProps,
  type Connection,
} from "@xyflow/react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Copy, Maximize, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useFlow, useSaveFlowDefinition } from "@/hooks/use-flows";

import { FlowSidebar } from "./flow-sidebar";
import { findCatalogItem } from "./node-catalog";
import { NodeConfigDialog } from "./node-config-dialog";

// ---------------------------------------------------------------------------
// F6 — Saídas múltiplas (handles por opção/caminho).
// Para nós que ramificam (Menu/Botões/Lista/Condição/Horário), cada saída tem
// seu PRÓPRIO ponto de conexão (handle) com o id que o MOTOR espera:
//   - menu_text         -> id "a" + tecla da opção            (ex.: a1, a2)
//   - buttons / list     -> id "a" + (posição da opção)        (ex.: a1, a2, a3)
//   - condition          -> id "true" / "false"
//   - schedule (horário) -> id "in" / "out"
// Os demais tipos mantêm UMA saída padrão (sem id), como antes — assim os
// fluxos já desenhados continuam funcionando (o motor tem fallback de aresta
// única quando não há handle nomeado).
// ---------------------------------------------------------------------------
type FlowOutput = { id?: string; label: string };

function getNodeOutputs(nodeType: string | undefined, config: Record<string, any> | undefined): FlowOutput[] {
  const cfg = config ?? {};
  const opts: any[] = Array.isArray(cfg.options) ? cfg.options : [];

  switch (nodeType) {
    case "menu_text": {
      // Cada opção vira uma saída, identificada pela tecla digitada pelo contato.
      const outs = opts
        .map((o, i) => {
          const key = String(o?.key ?? "").trim();
          if (!key) return null;
          const label = String(o?.label ?? "").trim();
          return { id: "a" + key, label: label ? `${key} · ${label}` : key };
        })
        .filter(Boolean) as FlowOutput[];
      return outs.length > 0 ? outs : [{ label: "Sem opções" }];
    }
    case "buttons":
    case "list": {
      // Aqui o motor usa a POSIÇÃO (1, 2, 3...), não uma tecla digitada.
      const outs = opts.map((o, i) => {
        const label = String(o?.label ?? o?.title ?? "").trim();
        const n = i + 1;
        return { id: "a" + n, label: label ? `${n} · ${label}` : `Opção ${n}` };
      });
      return outs.length > 0 ? outs : [{ label: "Sem opções" }];
    }
    case "condition":
      return [
        { id: "true", label: "Verdadeiro" },
        { id: "false", label: "Falso" },
      ];
    case "schedule":
      return [
        { id: "in", label: "Dentro do horário" },
        { id: "out", label: "Fora do horário" },
      ];
    default:
      // Saída única padrão (sem id) — comportamento original.
      return [{ label: "" }];
  }
}

function StartNode(_props: NodeProps) {
  return (
    <div
      className="min-w-[160px] rounded-xl px-5 py-3 text-center text-white shadow-md"
      style={{ backgroundColor: "#8FC549" }}
    >
      <div className="font-bold">Início</div>
      <div className="text-xs opacity-90">Gatilho do fluxo</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function FlowNode({ id, data, selected }: NodeProps) {
  const d = data as {
    nodeType?: string;
    label?: string;
    color?: string;
    config?: Record<string, any>;
  };
  const color = d.color ?? "#64748b";
  const found = d.nodeType ? findCatalogItem(d.nodeType) : null;
  const Icon = found?.item.icon;
  const { setNodes, setEdges } = useReactFlow();

  const cfg = d.config;
  let resumo = "Clique para configurar";
  if (cfg && Object.keys(cfg).length > 0) {
    if ((d.nodeType === "message" || d.nodeType === "question") && cfg.text) {
      resumo = String(cfg.text);
    } else {
      resumo = "Configurado";
    }
  }

  // F6 — saídas deste nó (uma ou várias, conforme o tipo + config).
  const outputs = getNodeOutputs(d.nodeType, cfg);
  const multi = outputs.length > 1 || !!outputs[0]?.id;

  const handleDuplicate = () => {
    setNodes((nds) => {
      const original = nds.find((n) => n.id === id);
      if (!original) return nds;
      const copy = {
        ...original,
        id: `${d.nodeType ?? "node"}-${Date.now()}`,
        position: {
          x: original.position.x + 40,
          y: original.position.y + 40,
        },
        selected: false,
      };
      return nds.concat(copy as any);
    });
  };

  const handleDelete = () => {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
  };

  return (
    <div className="min-w-[200px] overflow-hidden rounded-xl border bg-white shadow-sm">
      <NodeToolbar isVisible={selected} position={Position.Top} className="flex gap-1">
        <button
          onClick={handleDuplicate}
          className="rounded-md border bg-white p-1.5 shadow hover:bg-muted"
          aria-label="Duplicar"
        >
          <Copy className="h-4 w-4 text-muted-foreground" />
        </button>
        <button
          onClick={handleDelete}
          className="rounded-md border bg-white p-1.5 shadow hover:bg-muted"
          aria-label="Excluir"
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </button>
      </NodeToolbar>
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2 px-3 py-2 text-white" style={{ backgroundColor: color }}>
        {Icon ? <Icon className="h-4 w-4" /> : null}
        <span className="text-sm font-semibold">{found?.item.label ?? d.label ?? "Nó"}</span>
      </div>
      <div className="px-3 py-2 text-xs text-muted-foreground line-clamp-2">{resumo}</div>

      {multi ? (
        // F6 — saídas múltiplas: uma linha por saída, com rótulo e o seu
        // próprio handle ancorado à direita (id = o que o motor espera).
        <div className="border-t">
          {outputs.map((out, i) => (
            <div
              key={out.id ?? `out-${i}`}
              className="relative flex items-center justify-end gap-2 border-b px-3 py-1.5 pr-5 text-right text-xs last:border-b-0"
            >
              <span className="truncate text-muted-foreground" title={out.label}>
                {out.label || "Saída"}
              </span>
              <Handle type="source" position={Position.Right} id={out.id} style={{ top: "50%" }} />
            </div>
          ))}
        </div>
      ) : (
        // Saída única (comportamento original): handle embaixo, sem id.
        <Handle type="source" position={Position.Bottom} />
      )}
    </div>
  );
}

const nodeTypes = { start: StartNode, generic: FlowNode };

function FlowEditorInner({ flowId }: { flowId: string }) {
  const { data: flow, isLoading } = useFlow(flowId);
  const saveDefinition = useSaveFlowDefinition();
  const navigate = useNavigate();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<{
    id: string;
    type: string;
  } | null>(null);

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    if (node.type === "start") return;
    const t = (node.data as any)?.nodeType as string | undefined;
    setSelectedNode({ id: node.id, type: t ?? "" });
    setConfigOpen(true);
  }, []);

  const handleConfigSave = useCallback(
    (nodeId: string, config: Record<string, any>) => {
      setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...(n.data as any), config } } : n)));
    },
    [setNodes],
  );

  const handleConfigDelete = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    },
    [setNodes, setEdges],
  );

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, fitView } = useReactFlow();

  useEffect(() => {
    if (!flow) return;
    const def = flow.definition as { nodes?: unknown; edges?: unknown } | null;
    const loadedNodes = (def?.nodes as Node[] | undefined) ?? [];
    const loadedEdges = (def?.edges as Edge[] | undefined) ?? [];
    if (loadedNodes.length === 0) {
      setNodes([
        {
          id: "start",
          type: "start",
          position: { x: 240, y: 80 },
          data: {},
        },
      ]);
    } else {
      setNodes(loadedNodes);
    }
    setEdges(loadedEdges);
  }, [flow, setNodes, setEdges]);

  const onConnect = useCallback((connection: Connection) => setEdges((eds) => addEdge(connection, eds)), [setEdges]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/reactflow");
      if (!type) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const found = findCatalogItem(type);

      const newNode = {
        id: `${type}-${Date.now()}`,
        type: "generic",
        position,
        data: {
          nodeType: type,
          label: found?.item.label ?? type,
          color: found?.color ?? "#64748b",
        },
      } as any;

      setNodes((nds) => nds.concat(newNode));
    },
    [screenToFlowPosition, setNodes],
  );

  async function handleSave() {
    try {
      const definition = { nodes, edges };
      await saveDefinition.mutateAsync({
        id: flowId,
        definition: definition as any,
      });
      toast.success("Fluxo salvo.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar fluxo.");
    }
  }

  if (isLoading) {
    return <div className="flex h-full items-center justify-center text-muted-foreground">Carregando editor...</div>;
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => navigate({ to: "/flows" })} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          <div className="text-base font-semibold">{flow?.name}</div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => fitView()} aria-label="Ajustar à tela">
            <Maximize className="h-4 w-4" />
          </Button>
          <Button
            onClick={handleSave}
            disabled={saveDefinition.isPending}
            className="gap-2 text-white hover:opacity-90"
            style={{ backgroundColor: "#8FC549" }}
          >
            <Save className="h-4 w-4" />
            {saveDefinition.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {/* Canvas ocupa todo o fundo */}
        <div className="absolute inset-0" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={{
              type: "smoothstep",
              markerEnd: { type: MarkerType.ArrowClosed, color: "#8FC549" },
              style: { stroke: "#8FC549", strokeWidth: 2 },
            }}
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>

        {/* Barra de componentes flutuante sobre o canvas */}
        <div className="absolute left-4 top-4 bottom-4 z-10">
          <FlowSidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />
        </div>
      </div>

      <NodeConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        nodeId={selectedNode?.id ?? null}
        nodeType={selectedNode?.type ?? null}
        initialConfig={selectedNode ? ((nodes.find((n) => n.id === selectedNode.id)?.data as any)?.config ?? {}) : {}}
        canDelete={true}
        onSave={handleConfigSave}
        onDelete={handleConfigDelete}
        currentFlowId={flowId}
      />
    </div>
  );
}

export function FlowEditor({ flowId }: { flowId: string }) {
  return (
    <ReactFlowProvider>
      <FlowEditorInner flowId={flowId} />
    </ReactFlowProvider>
  );
}
