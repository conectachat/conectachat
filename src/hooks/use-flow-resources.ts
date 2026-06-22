import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";

export type ResourceItem = { id: string; name: string };

// Tags da empresa
export function useOrgTags() {
  const { activeMembership } = useCurrentUser();
  const orgId = activeMembership?.org_id ?? null;
  return useQuery({
    queryKey: ["flow-res-tags", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<ResourceItem[]> => {
      const { data, error } = await supabase
        .from("tags")
        .select("id, name")
        .eq("org_id", orgId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as ResourceItem[];
    },
  });
}

// Departamentos da empresa
export function useOrgDepartments() {
  const { activeMembership } = useCurrentUser();
  const orgId = activeMembership?.org_id ?? null;
  return useQuery({
    queryKey: ["flow-res-departments", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<ResourceItem[]> => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, name")
        .eq("org_id", orgId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as ResourceItem[];
    },
  });
}

// Atendentes (membros da org) com nome via profiles
export function useOrgAgents() {
  const { activeMembership } = useCurrentUser();
  const orgId = activeMembership?.org_id ?? null;
  return useQuery({
    queryKey: ["flow-res-agents", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<ResourceItem[]> => {
      const { data: members, error } = await supabase
        .from("org_members")
        .select("user_id")
        .eq("org_id", orgId!);
      if (error) throw error;
      const ids = (members ?? []).map((m: any) => m.user_id);
      if (ids.length === 0) return [];
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      if (pErr) throw pErr;
      return (profiles ?? []).map((p: any) => ({
        id: p.id,
        name: p.full_name || p.email || "Sem nome",
      })) as ResourceItem[];
    },
  });
}

// Outros fluxos da empresa (exclui o fluxo atual)
export function useOtherFlows(currentFlowId: string | null) {
  const { activeMembership } = useCurrentUser();
  const orgId = activeMembership?.org_id ?? null;
  return useQuery({
    queryKey: ["flow-res-flows", orgId, currentFlowId],
    enabled: !!orgId,
    queryFn: async (): Promise<ResourceItem[]> => {
      const { data, error } = await supabase
        .from("flows")
        .select("id, name")
        .eq("org_id", orgId!)
        .order("name");
      if (error) throw error;
      const all = (data ?? []) as ResourceItem[];
      return currentFlowId ? all.filter((f) => f.id !== currentFlowId) : all;
    },
  });
}
