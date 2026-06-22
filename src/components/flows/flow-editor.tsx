import "@xyflow/react/dist/style.css";

import { useCallback, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  type Connection,
} from "@xyflow/react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useFlow, useSaveFlowDefinition } from "@/hooks/use-flows";

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

const nodeTypes = { start: StartNode };

export function FlowEditor({ flowId }: { flowId: string }) {
  const { data: flow, isLoading } = useFlow(flowId);
  const saveDefinition = useSaveFlowDefinition();
  const navigate = useNavigate();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

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
    <div className="flex h-full flex-col">
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

      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}
