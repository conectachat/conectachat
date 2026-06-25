import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";

// ===================================================================
//  TIPOS
// ===================================================================

export type AiProvider = "openai" | "gemini" | "claude";
export type AgentActivationMode = "sempre" | "quando_ninguem_atende" | "fora_do_horario";

// Janela de um dia da semana no horário comercial do agente.
export type BusinessDay = { enabled: boolean; start: string; end: string };
// Mapa seg→dom. Chaves: mon, tue, wed, thu, fri, sat, sun.
export type BusinessHours = Record<string, BusinessDay>;

// Um agente na listagem (campos leves).
export type AiAgentListItem = {
  id: string;
  name: string;
  is_active: boolean;
  provider: AiProvider;
  model: string;
  activation_mode: AgentActivationMode;
  updated_at: string;
};

// Um agente completo (tela de edição).
export type AiAgent = AiAgentListItem & {
  org_id: string;
  persona: string;
  knowledge_base: string;
  business_hours: BusinessHours;
  handoff_enabled: boolean;
  handoff_department_id: string | null;
  handoff_message: string;
  handoff_keywords: string;
  greeting: string;
  created_at: string;
};

// Um canal (conexão) com o agente atualmente alocado nele.
export type ChannelBinding = {
  id: string;
  name: string;
  default_department_id: string | null;
  ai_agent_id: string | null;
};

// A tabela ai_agents e a coluna channels.ai_agent_id NÃO estão no types.ts
// gerado, então acessamos via (supabase as any) — padrão do projeto (CLAUDE.md §8).
const sb = supabase as any;

// ===================================================================
//  LISTAR — agentes da empresa
// ===================================================================
export function useAiAgents() {
  const { activeMembership } = useCurrentUser();
  const orgId = activeMembership?.org_id ?? null;

  return useQuery({
    queryKey: ["ai-agents", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<AiAgentListItem[]> => {
      const { data, error } = await sb
        .from("ai_agents")
        .select("id, name, is_active, provider, model, activation_mode, updated_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AiAgentListItem[];
    },
  });
}

// ===================================================================
//  CARREGAR UM AGENTE — todos os campos (para a tela de edição)
// ===================================================================
export function useAiAgent(agentId: string | null) {
  return useQuery({
    queryKey: ["ai-agent", agentId],
    enabled: !!agentId,
    queryFn: async (): Promise<AiAgent> => {
      const { data, error } = await sb.from("ai_agents").select("*").eq("id", agentId).single();
      if (error) throw error;
      const row = data as any;
      return {
        ...row,
        business_hours: (row.business_hours ?? {}) as BusinessHours,
      } as AiAgent;
    },
  });
}

// ===================================================================
//  CRIAR — agente novo com valores padrão
// ===================================================================
export function useCreateAiAgent() {
  const { activeMembership } = useCurrentUser();
  const orgId = activeMembership?.org_id ?? null;
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { name: string }): Promise<string> => {
      if (!orgId) throw new Error("Empresa não encontrada.");
      const name = input.name.trim();
      if (!name) throw new Error("Informe um nome para o agente.");

      const { data, error } = await sb
        .from("ai_agents")
        .insert({ org_id: orgId, name, is_active: false })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-agents"] });
    },
  });
}

// ===================================================================
//  ATUALIZAR — salva os campos editados
// ===================================================================
export function useUpdateAiAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; patch: Partial<AiAgent> }) => {
      const { error } = await sb
        .from("ai_agents")
        .update({ ...input.patch, updated_at: new Date().toISOString() })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["ai-agents"] });
      qc.invalidateQueries({ queryKey: ["ai-agent", vars.id] });
    },
  });
}

// ===================================================================
//  ATIVAR / DESATIVAR
// ===================================================================
export function useToggleAiAgentActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; isActive: boolean }) => {
      const { error } = await sb
        .from("ai_agents")
        .update({ is_active: input.isActive, updated_at: new Date().toISOString() })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["ai-agents"] });
      qc.invalidateQueries({ queryKey: ["ai-agent", vars.id] });
    },
  });
}

// ===================================================================
//  EXCLUIR
// ===================================================================
export function useDeleteAiAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string }) => {
      const { error } = await sb.from("ai_agents").delete().eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-agents"] });
    },
  });
}

// ===================================================================
//  CANAIS (conexões) — para alocar o agente
// ===================================================================
export function useOrgChannels() {
  const { activeMembership } = useCurrentUser();
  const orgId = activeMembership?.org_id ?? null;
  return useQuery({
    queryKey: ["ai-agent-channels", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<ChannelBinding[]> => {
      const { data, error } = await sb
        .from("channels")
        .select("id, name, default_department_id, ai_agent_id")
        .eq("org_id", orgId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as ChannelBinding[];
    },
  });
}

// Aloca o agente nos canais escolhidos: limpa os canais que apontavam para ele
// e que saíram da seleção, e aponta os selecionados para este agente.
export function useSetAgentChannels() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { agentId: string; channelIds: string[] }) => {
      // 1) Solta os canais que estavam neste agente (depois reaplicamos os escolhidos).
      const { error: clearErr } = await sb
        .from("channels")
        .update({ ai_agent_id: null })
        .eq("ai_agent_id", input.agentId);
      if (clearErr) throw clearErr;
      // 2) Aponta os canais escolhidos para este agente.
      if (input.channelIds.length > 0) {
        const { error: setErr } = await sb
          .from("channels")
          .update({ ai_agent_id: input.agentId })
          .in("id", input.channelIds);
        if (setErr) throw setErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-agent-channels"] });
    },
  });
}

// ===================================================================
//  CHAVES DE IA configuradas (para avisar se falta a chave do provedor)
// ===================================================================
export function useOrgAiKeys() {
  const { activeMembership } = useCurrentUser();
  const orgId = activeMembership?.org_id ?? null;
  return useQuery({
    queryKey: ["ai-agent-keys", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Set<AiProvider>> => {
      const { data, error } = await sb
        .from("ai_credentials")
        .select("provider, is_active")
        .eq("org_id", orgId);
      if (error) throw error;
      const set = new Set<AiProvider>();
      for (const row of (data ?? []) as any[]) {
        if (row.is_active !== false) set.add(row.provider as AiProvider);
      }
      return set;
    },
  });
}
