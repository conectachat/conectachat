import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";

// ===================================================================
//  TIPOS
// ===================================================================

// O desenho do fluxo (nós + conexões) que o React Flow usa.
// Mantemos genérico por enquanto; os tipos de cada nó chegam no F3.
export type FlowDefinition = {
  nodes: unknown[];
  edges: unknown[];
};

// Um fluxo na listagem (sem o desenho pesado).
export type FlowListItem = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

// Um fluxo completo (inclui o desenho).
export type Flow = FlowListItem & {
  definition: FlowDefinition;
};

// Desenho inicial de um fluxo novo: só o nó "Início".
function startingDefinition(): FlowDefinition {
  return {
    nodes: [
      {
        id: "start",
        type: "start",
        position: { x: 240, y: 80 },
        data: { label: "Início" },
        deletable: false,
      },
    ],
    edges: [],
  };
}

// ===================================================================
//  LISTAR — fluxos da empresa (sem o campo definition, mais leve)
// ===================================================================
export function useFlows() {
  const { activeMembership } = useCurrentUser();
  const orgId = activeMembership?.org_id ?? null;

  return useQuery({
    queryKey: ["flows", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<FlowListItem[]> => {
      const { data, error } = await supabase
        .from("flows")
        .select("id, name, description, is_active, created_at, updated_at")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FlowListItem[];
    },
  });
}

// ===================================================================
//  CARREGAR UM FLUXO — inclui o desenho (definition) para o editor
// ===================================================================
export function useFlow(flowId: string | null) {
  return useQuery({
    queryKey: ["flow", flowId],
    enabled: !!flowId,
    queryFn: async (): Promise<Flow> => {
      const { data, error } = await supabase
        .from("flows")
        .select("id, name, description, is_active, created_at, updated_at, definition")
        .eq("id", flowId!)
        .single();
      if (error) throw error;
      return data as unknown as Flow;
    },
  });
}

// ===================================================================
//  CRIAR — novo fluxo já nasce com o nó "Início"
// ===================================================================
export function useCreateFlow() {
  const { activeMembership } = useCurrentUser();
  const orgId = activeMembership?.org_id ?? null;
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { name: string }): Promise<string> => {
      if (!orgId) throw new Error("Empresa não encontrada.");
      const name = input.name.trim();
      if (!name) throw new Error("Informe um nome para o fluxo.");

      const { data, error } = await supabase
        .from("flows")
        .insert({
          org_id: orgId,
          name,
          is_active: false,
          definition: startingDefinition() as any,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flows"] });
    },
  });
}

// ===================================================================
//  RENOMEAR
// ===================================================================
export function useRenameFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; name: string }) => {
      const name = input.name.trim();
      if (!name) throw new Error("Informe um nome para o fluxo.");
      const { error } = await supabase
        .from("flows")
        .update({ name, updated_at: new Date().toISOString() })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["flows"] });
      qc.invalidateQueries({ queryKey: ["flow", vars.id] });
    },
  });
}

// ===================================================================
//  ATIVAR / DESATIVAR
// ===================================================================
export function useToggleFlowActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from("flows")
        .update({ is_active: input.isActive, updated_at: new Date().toISOString() })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["flows"] });
      qc.invalidateQueries({ queryKey: ["flow", vars.id] });
    },
  });
}

// ===================================================================
//  SALVAR O DESENHO — grava nós + conexões no campo definition
// ===================================================================
export function useSaveFlowDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; definition: FlowDefinition }) => {
      const { error } = await supabase
        .from("flows")
        .update({ definition: input.definition, updated_at: new Date().toISOString() })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["flow", vars.id] });
    },
  });
}

// ===================================================================
//  EXCLUIR
// ===================================================================
export function useDeleteFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string }) => {
      const { error } = await supabase.from("flows").delete().eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flows"] });
    },
  });
}
