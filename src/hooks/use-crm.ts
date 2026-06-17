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
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_cards", filter: `org_id=eq.${orgId}` }, () =>
        qc.invalidateQueries({ queryKey: ["crm-cards"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_stages", filter: `org_id=eq.${orgId}` }, () =>
        qc.invalidateQueries({ queryKey: ["crm-stages"] }),
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

// ===================================================================
//  MOVER CARTÃO — salva nova etapa/ordem após arrastar-e-soltar.
//  Renumera a(s) coluna(s) afetada(s) e, se a etapa de destino for
//  Ganho/Perdido, marca o status e a data correspondente.
// ===================================================================
export function useMoveCard() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      movedId: string;
      prevStatus: CrmStageKind;
      dest: { stageId: string; kind: CrmStageKind; cardIds: string[] };
      source: { stageId: string; cardIds: string[] } | null;
    }) => {
      const now = new Date().toISOString();
      const ops: PromiseLike<{ error: unknown }>[] = [];

      // Coluna de destino: cada cartão recebe a etapa e a posição (índice).
      input.dest.cardIds.forEach((id, index) => {
        const patch: Record<string, unknown> = {
          stage_id: input.dest.stageId,
          position: index,
        };
        // Só o cartão movido muda de status (e só se o tipo da etapa mudou).
        if (id === input.movedId && input.dest.kind !== input.prevStatus) {
          patch.status = input.dest.kind;
          patch.won_at = input.dest.kind === "won" ? now : null;
          patch.lost_at = input.dest.kind === "lost" ? now : null;
        }
        ops.push(supabase.from("crm_cards").update(patch).eq("id", id));
      });

      // Coluna de origem (quando o cartão mudou de coluna): renumera o resto.
      if (input.source && input.source.stageId !== input.dest.stageId) {
        input.source.cardIds.forEach((id, index) => {
          ops.push(
            supabase.from("crm_cards").update({ stage_id: input.source!.stageId, position: index }).eq("id", id),
          );
        });
      }

      const results = await Promise.all(ops);
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    },
    // Recarrega do banco para garantir que o quadro reflete o estado real.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["crm-cards"] });
    },
  });
}
