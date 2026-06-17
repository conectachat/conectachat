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
//  ETAPAS de um funil (usado no quadro e no gerenciador)
// ===================================================================
export function useFunnelStages(funnelId: string | null) {
  return useQuery({
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

      const moveOne = async (id: string, stageId: string, index: number) => {
        const trocaStatus = id === input.movedId && input.dest.kind !== input.prevStatus;

        const { error } = trocaStatus
          ? await supabase
              .from("crm_cards")
              .update({
                stage_id: stageId,
                position: index,
                status: input.dest.kind,
                won_at: input.dest.kind === "won" ? now : null,
                lost_at: input.dest.kind === "lost" ? now : null,
              })
              .eq("id", id)
          : await supabase.from("crm_cards").update({ stage_id: stageId, position: index }).eq("id", id);

        if (error) throw error;
      };

      const tasks: Promise<void>[] = [];

      input.dest.cardIds.forEach((id, index) => {
        tasks.push(moveOne(id, input.dest.stageId, index));
      });

      if (input.source && input.source.stageId !== input.dest.stageId) {
        const src = input.source;
        src.cardIds.forEach((id, index) => {
          tasks.push(moveOne(id, src.stageId, index));
        });
      }

      await Promise.all(tasks);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["crm-cards"] });
    },
  });
}

// ===================================================================
//  FUNIS — criar / renomear / excluir (gerenciamento; só dono/admin)
// ===================================================================
export function useCreateFunnel() {
  const { activeMembership } = useCurrentUser();
  const orgId = activeMembership?.org_id ?? null;
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { name: string }) => {
      if (!orgId) throw new Error("Empresa não encontrada.");

      const { data: last } = await supabase
        .from("crm_funnels")
        .select("position")
        .eq("org_id", orgId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      const position = (last?.position ?? -1) + 1;

      const { data, error } = await supabase
        .from("crm_funnels")
        .insert({ org_id: orgId, name: input.name, position })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-funnels"] });
    },
  });
}

export function useRenameFunnel() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; name: string }) => {
      const { error } = await supabase.from("crm_funnels").update({ name: input.name }).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-funnels"] });
    },
  });
}

export function useDeleteFunnel() {
  const { activeMembership } = useCurrentUser();
  const orgId = activeMembership?.org_id ?? null;
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string }) => {
      if (!orgId) throw new Error("Empresa não encontrada.");

      const { count: funnelCount } = await supabase
        .from("crm_funnels")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId);
      if ((funnelCount ?? 0) <= 1) throw new Error("LAST_FUNNEL");

      const { count: cardCount } = await supabase
        .from("crm_cards")
        .select("id", { count: "exact", head: true })
        .eq("funnel_id", input.id);
      if ((cardCount ?? 0) > 0) throw new Error("HAS_CARDS");

      const { error: stErr } = await supabase.from("crm_stages").delete().eq("funnel_id", input.id);
      if (stErr) throw stErr;
      const { error: fnErr } = await supabase.from("crm_funnels").delete().eq("id", input.id);
      if (fnErr) throw fnErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-funnels"] });
      qc.invalidateQueries({ queryKey: ["crm-stages"] });
    },
  });
}

// ===================================================================
//  ETAPAS — criar / renomear / cor / ordem / excluir
//  Regras: Ganho (won) e Perdido (lost) ficam SEMPRE no fim; só as
//  etapas "open" são reordenáveis e excluíveis.
// ===================================================================

// Renumera as posições garantindo a ordem: open... < won < lost
async function normalizeStagePositions(funnelId: string) {
  const { data, error } = await supabase
    .from("crm_stages")
    .select("id, kind, position")
    .eq("funnel_id", funnelId)
    .order("position", { ascending: true });
  if (error) throw error;

  const rows = data ?? [];
  const rank = (k: string) => (k === "open" ? 0 : k === "won" ? 1 : 2);
  const sorted = [...rows].sort((a, b) => {
    const d = rank(a.kind) - rank(b.kind);
    return d !== 0 ? d : a.position - b.position;
  });

  const tasks: Promise<void>[] = [];
  sorted.forEach((row, index) => {
    if (row.position !== index) {
      tasks.push(
        (async () => {
          const { error: e } = await supabase.from("crm_stages").update({ position: index }).eq("id", row.id);
          if (e) throw e;
        })(),
      );
    }
  });
  await Promise.all(tasks);
}

export function useCreateStage() {
  const { activeMembership } = useCurrentUser();
  const orgId = activeMembership?.org_id ?? null;
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { funnelId: string; name: string; color: string | null }) => {
      if (!orgId) throw new Error("Empresa não encontrada.");
      // position alta temporária → vira a última etapa "open"; depois normaliza
      const { error } = await supabase.from("crm_stages").insert({
        org_id: orgId,
        funnel_id: input.funnelId,
        name: input.name,
        kind: "open",
        color: input.color,
        position: 1000,
      });
      if (error) throw error;
      await normalizeStagePositions(input.funnelId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-stages"] });
    },
  });
}

export function useRenameStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; name: string }) => {
      const { error } = await supabase.from("crm_stages").update({ name: input.name }).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-stages"] });
    },
  });
}

export function useRecolorStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; color: string }) => {
      const { error } = await supabase.from("crm_stages").update({ color: input.color }).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-stages"] });
    },
  });
}

export function useDeleteStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; funnelId: string }) => {
      const { count } = await supabase
        .from("crm_cards")
        .select("id", { count: "exact", head: true })
        .eq("stage_id", input.id);
      if ((count ?? 0) > 0) throw new Error("HAS_CARDS");

      const { error } = await supabase.from("crm_stages").delete().eq("id", input.id);
      if (error) throw error;
      await normalizeStagePositions(input.funnelId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-stages"] });
      qc.invalidateQueries({ queryKey: ["crm-cards"] });
    },
  });
}

export function useReorderStages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      funnelId: string;
      openIdsInOrder: string[];
      wonId: string | null;
      lostId: string | null;
    }) => {
      const upd = (id: string, position: number) =>
        (async () => {
          const { error } = await supabase.from("crm_stages").update({ position }).eq("id", id);
          if (error) throw error;
        })();

      const tasks: Promise<void>[] = [];
      input.openIdsInOrder.forEach((id, index) => tasks.push(upd(id, index)));
      const base = input.openIdsInOrder.length;
      if (input.wonId) tasks.push(upd(input.wonId, base));
      if (input.lostId) tasks.push(upd(input.lostId, base + 1));
      await Promise.all(tasks);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-stages"] });
    },
  });
}
