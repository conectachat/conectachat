import { useEffect, useMemo } from "react";
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
  assigned_user_id: string | null;
  title: string | null;
  value_cents: number | null;
  currency: string | null;
  status: CrmStageKind;
  position: number;
  lost_reason: string | null;
  contact: CrmCardContact | null;
};

// Anotação do cartão (histórico), com o autor.
export type CrmCardNote = {
  id: string;
  body: string;
  created_at: string;
  author_user_id: string | null;
  author: { id: string; full_name: string | null; email: string | null } | null;
};

// Usuário da empresa (para o seletor de responsável).
export type OrgUser = {
  id: string;
  name: string;
  role: string;
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
          "id, funnel_id, stage_id, contact_id, conversation_id, assigned_user_id, title, value_cents, currency, status, position, lost_reason, contact:contacts ( id, name, avatar_url, external_id )",
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

  // IMPORTANTE: memoizar evita recriar as listas a cada render (senão a tela
  // entra em loop de atualização — o erro React #185).
  const stages = useMemo(() => stagesQuery.data ?? [], [stagesQuery.data]);
  const cards = useMemo(() => cardsQuery.data ?? [], [cardsQuery.data]);

  return {
    stages,
    cards,
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
//  ATUALIZAR CARTÃO — campos do detalhe (valor, moeda, título, responsável)
// ===================================================================
export function useUpdateCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      cardId: string;
      patch: {
        title?: string | null;
        value_cents?: number | null;
        currency?: string | null;
        assigned_user_id?: string | null;
      };
    }) => {
      const { error } = await supabase.from("crm_cards").update(input.patch).eq("id", input.cardId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-cards"] });
      qc.invalidateQueries({ queryKey: ["crm-conv-cards"] });
    },
  });
}

// ===================================================================
//  GANHO / PERDIDO / REABRIR — move o cartão para a etapa certa do funil
//  e grava status + data + motivo. (won/lost = 1ª etapa daquele tipo;
//  reabrir = 1ª etapa "open" do funil.)
// ===================================================================
export function useSetCardStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      cardId: string;
      funnelId: string;
      target: CrmStageKind; // "won" | "lost" | "open"
      lostReason?: string | null;
    }) => {
      // 1ª etapa do tipo alvo (Ganho/Perdido têm 1 só; "open" = Novo Lead).
      const { data: stage, error: stErr } = await supabase
        .from("crm_stages")
        .select("id")
        .eq("funnel_id", input.funnelId)
        .eq("kind", input.target)
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (stErr) throw stErr;
      if (!stage) throw new Error("Etapa de destino não encontrada.");

      // "No topo" da etapa de destino.
      const { data: top } = await supabase
        .from("crm_cards")
        .select("position")
        .eq("stage_id", stage.id)
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle();
      const position = (top?.position ?? 0) - 1;

      const now = new Date().toISOString();
      const { error } = await supabase
        .from("crm_cards")
        .update({
          stage_id: stage.id,
          position,
          status: input.target,
          won_at: input.target === "won" ? now : null,
          lost_at: input.target === "lost" ? now : null,
          lost_reason: input.target === "lost" ? (input.lostReason ?? null) : null,
        })
        .eq("id", input.cardId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-cards"] });
      qc.invalidateQueries({ queryKey: ["crm-conv-cards"] });
    },
  });
}

// ===================================================================
//  EXCLUIR CARTÃO
// ===================================================================
export function useDeleteCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { cardId: string }) => {
      const { error } = await supabase.from("crm_cards").delete().eq("id", input.cardId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-cards"] });
      qc.invalidateQueries({ queryKey: ["crm-conv-cards"] });
    },
  });
}

// ===================================================================
//  EQUIPE — usuários da empresa (para o seletor de responsável)
// ===================================================================
export function useOrgUsers() {
  const { activeMembership } = useCurrentUser();
  const orgId = activeMembership?.org_id ?? null;

  return useQuery({
    queryKey: ["crm-org-users", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<OrgUser[]> => {
      const { data: members, error } = await supabase.from("org_members").select("user_id, role").eq("org_id", orgId!);
      if (error) throw error;
      const ids = (members ?? []).map((m) => m.user_id);
      if (ids.length === 0) return [];

      const { data: profs, error: pErr } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      if (pErr) throw pErr;

      const byId = new Map((profs ?? []).map((p) => [p.id, p]));
      return (members ?? []).map((m) => {
        const p = byId.get(m.user_id);
        return {
          id: m.user_id,
          name: p?.full_name?.trim() || p?.email || "Usuário",
          role: m.role as string,
        };
      });
    },
  });
}

// ===================================================================
//  ANOTAÇÕES do cartão (histórico) — listar (ao vivo) / criar / apagar
// ===================================================================
export function useCardNotes(cardId: string | null) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["crm-card-notes", cardId],
    enabled: !!cardId,
    queryFn: async (): Promise<CrmCardNote[]> => {
      const { data, error } = await supabase
        .from("crm_card_notes")
        .select(
          "id, body, created_at, author_user_id, author:profiles!crm_card_notes_author_user_id_fkey ( id, full_name, email )",
        )
        .eq("card_id", cardId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CrmCardNote[];
    },
  });

  // Tempo real: novas notas (de qualquer atendente) aparecem na hora.
  useEffect(() => {
    if (!cardId) return;
    const ch = supabase
      .channel(`crm-notes-${cardId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crm_card_notes", filter: `card_id=eq.${cardId}` },
        () => qc.invalidateQueries({ queryKey: ["crm-card-notes", cardId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [cardId, qc]);

  return query;
}

export function useAddCardNote() {
  const { activeMembership } = useCurrentUser();
  const orgId = activeMembership?.org_id ?? null;
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { cardId: string; body: string }) => {
      if (!orgId) throw new Error("Empresa não encontrada.");
      const body = input.body.trim();
      if (!body) throw new Error("Anotação vazia.");
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Sessão não encontrada.");
      const { error } = await supabase.from("crm_card_notes").insert({
        org_id: orgId,
        card_id: input.cardId,
        author_user_id: uid,
        body,
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-card-notes", vars.cardId] });
    },
  });
}

export function useDeleteCardNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { noteId: string; cardId: string }) => {
      const { error } = await supabase.from("crm_card_notes").delete().eq("id", input.noteId);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-card-notes", vars.cardId] });
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
