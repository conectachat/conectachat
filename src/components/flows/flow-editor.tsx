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
  const d = data as { nodeType?: string; label?: string; color?: string };
  const color = d.color ?? "#64748b";
  const found = d.nodeType ? findCatalogItem(d.nodeType) : null;
  const Icon = found?.item.icon;
  const { setNodes, setEdges } = useReactFlow();

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
      <NodeToolbar
        isVisible={selected}
        position={Position.Top}
        className="flex gap-1"
      >
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
      <div
        className="flex items-center gap-2 px-3 py-2 text-white"
        style={{ backgroundColor: color }}
      >
        {Icon ? <Icon className="h-4 w-4" /> : null}
        <span className="text-sm font-semibold">
          {found?.item.label ?? d.label ?? "Nó"}
        </span>
      </div>
      <div className="px-3 py-2 text-xs text-muted-foreground">
        Clique para configurar
      </div>
      <Handle type="source" position={Position.Bottom} />
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

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges],
  );

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
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Carregando editor...
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={() => navigate({ to: "/flows" })}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          <div className="text-base font-semibold">{flow?.name}</div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => fitView()}
            aria-label="Ajustar à tela"
          >
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
            nodeTypes={nodeTypes}
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>

        {/* Barra de componentes flutuante sobre o canvas */}
        <div className="absolute left-4 top-4 bottom-4 z-10">
          <FlowSidebar
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed((c) => !c)}
          />
        </div>
      </div>
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
