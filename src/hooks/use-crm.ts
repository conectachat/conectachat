import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";

// ===================================================================
//  TIPOS
// ===================================================================
export type CrmFunnel = {
  id: string;
  name: string;
  color: string | null;
  position: number;
};

export type CrmStageKind = "open" | "won" | "lost";

export type CrmStage = {
  id: string;
  funnel_id: string;
  name: string;
  kind: CrmStageKind;
  color: string | null;
  position: number;
};

export type CrmCardContact = {
  id: string;
  name: string | null;
  avatar_url: string | null;
  external_id: string;
};

export type CrmCard = {
  id: string;
  funnel_id: string;
  stage_id: string;
  contact_id: string;
  conversation_id: string | null;
  title: string | null;
  value_cents: number | null;
  currency: string | null;
  status: CrmStageKind;
  position: number;
  contact: CrmCardContact | null;
};

// ===================================================================
//  FUNIS — lista os funis da empresa (ordem definida no banco)
// ===================================================================
export function useFunnels() {
  const { activeMembership } = useCurrentUser();
  const orgId = activeMembership?.org_id ?? null;

  return useQuery({
    queryKey: ["crm-funnels", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<CrmFunnel[]> => {
      const { data, error } = await supabase
        .from("crm_funnels")
        .select("id, name, color, position")
        .eq("org_id", orgId!)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CrmFunnel[];
    },
  });
}

// ===================================================================
//  QUADRO — etapas + cartões do funil escolhido, atualizando AO VIVO
// ===================================================================
export function useFunnelBoard(funnelId: string | null) {
  const { activeMembership } = useCurrentUser();
  const orgId = activeMembership?.org_id ?? null;
  const qc = useQueryClient();

  const stagesQuery = useQuery({
    queryKey: ["crm-stages", funnelId],
    enabled: !!funnelId,
    queryFn: async (): Promise<CrmStage[]> => {
      const { data, error } = await supabase
        .from("crm_stages")
        .select("id, funnel_id, name, kind, color, position")
        .eq("funnel_id", funnelId!)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CrmStage[];
    },
  });

  const cardsQuery = useQuery({
    queryKey: ["crm-cards", funnelId],
    enabled: !!funnelId,
    queryFn: async (): Promise<CrmCard[]> => {
      const { data, error } = await supabase
        .from("crm_cards")
        .select(
          "id, funnel_id, stage_id, contact_id, conversation_id, title, value_cents, currency, status, position, contact:contacts ( id, name, avatar_url, external_id )",
        )
        .eq("funnel_id", funnelId!)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CrmCard[];
    },
  });

  // Tempo real: qualquer mudança nos cartões/etapas da empresa recarrega o quadro.
  useEffect(() => {
    if (!orgId) return;
    const ch = supabase
      .channel(`crm-rt-${orgId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crm_cards", filter: `org_id=eq.${orgId}` },
        () => qc.invalidateQueries({ queryKey: ["crm-cards"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crm_stages", filter: `org_id=eq.${orgId}` },
        () => qc.invalidateQueries({ queryKey: ["crm-stages"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [orgId, qc]);

  return {
    stages: stagesQuery.data ?? [],
    cards: cardsQuery.data ?? [],
    isLoading: stagesQuery.isLoading || cardsQuery.isLoading,
  };
}

// ===================================================================
//  CRIAR CARTÃO — a partir de um contato existente
// ===================================================================
export function useCreateCard() {
  const { activeMembership } = useCurrentUser();
  const orgId = activeMembership?.org_id ?? null;
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      funnelId: string;
      stageId: string;
      contactId: string;
      title: string | null;
      valueCents: number | null;
      position: number;
    }) => {
      if (!orgId) throw new Error("Empresa não encontrada.");
      const { error } = await supabase.from("crm_cards").insert({
        org_id: orgId,
        funnel_id: input.funnelId,
        stage_id: input.stageId,
        contact_id: input.contactId,
        title: input.title,
        value_cents: input.valueCents,
        status: "open",
        position: input.position,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-cards"] });
    },
  });
}
