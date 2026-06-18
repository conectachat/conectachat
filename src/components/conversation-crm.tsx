import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useFunnels, useFunnelStages, type CrmStage } from "@/hooks/use-crm";

// ===================================================================
//  Bloco "Funil / Etapa (CRM)" dentro do painel do contato (inbox).
//  - Mostra em qual funil/etapa o contato está (cartão ABERTO).
//  - Deixa MUDAR a etapa (move dentro do funil) e MUDAR o funil
//    (move o cartão para o 1º estágio do funil de destino).
//  - Se o contato ainda não estiver em nenhum funil, deixa ALOCAR
//    (cria o cartão no funil/etapa escolhidos, já ligado à conversa).
//  Observação: o modelo é "1 cartão aberto por contato/funil". Se houver
//  vários, este bloco edita o primeiro (caso raro).
// ===================================================================

type OpenCard = {
  id: string;
  funnel_id: string;
  stage_id: string;
  conversation_id: string | null;
  status: "open" | "won" | "lost";
};

export function ConversationCrmCard({
  conversationId,
  contactId,
  orgId,
}: {
  conversationId: string;
  contactId: string;
  orgId: string | null;
}) {
  const qc = useQueryClient();

  const funnelsQuery = useFunnels();
  const funnels = useMemo(() => funnelsQuery.data ?? [], [funnelsQuery.data]);

  const [busy, setBusy] = useState(false);
  const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null);
  const [addStageId, setAddStageId] = useState<string>("");

  // Cartões ABERTOS deste contato (em qualquer funil).
  const cardsQuery = useQuery({
    queryKey: ["crm-conv-cards", contactId],
    enabled: !!contactId,
    queryFn: async (): Promise<OpenCard[]> => {
      const { data, error } = await supabase
        .from("crm_cards")
        .select("id, funnel_id, stage_id, conversation_id, status")
        .eq("contact_id", contactId)
        .eq("status", "open")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as OpenCard[];
    },
  });
  const openCards = useMemo(() => cardsQuery.data ?? [], [cardsQuery.data]);

  // "Negócio" atual = 1º cartão aberto do contato (modelo: 1 por funil).
  const deal = openCards[0] ?? null;

  // Funil em foco: o do negócio (se houver) ou o escolhido na caixinha.
  const activeFunnelId = deal?.funnel_id ?? selectedFunnelId;

  // Default do seletor + mantém sincronizado com o negócio.
  useEffect(() => {
    if (deal) {
      if (selectedFunnelId !== deal.funnel_id) setSelectedFunnelId(deal.funnel_id);
    } else if (!selectedFunnelId && funnels.length > 0) {
      setSelectedFunnelId(funnels[0].id);
    }
  }, [deal, funnels, selectedFunnelId]);

  const stagesQuery = useFunnelStages(activeFunnelId);
  const stages = useMemo(() => stagesQuery.data ?? [], [stagesQuery.data]);

  // No modo "sem negócio", pré-seleciona a 1ª etapa "open" do funil escolhido.
  useEffect(() => {
    if (deal) return;
    const firstOpen = stages.find((s) => s.kind === "open") ?? stages[0];
    setAddStageId(firstOpen?.id ?? "");
  }, [deal, activeFunnelId, stages]);

  // Conserta o vínculo da conversa no cartão (se faltava) ao abrir o painel.
  useEffect(() => {
    if (deal && !deal.conversation_id) {
      supabase
        .from("crm_cards")
        .update({ conversation_id: conversationId })
        .eq("id", deal.id)
        .then(() => {
          qc.invalidateQueries({ queryKey: ["crm-conv-cards", contactId] });
          qc.invalidateQueries({ queryKey: ["crm-cards"] });
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal?.id, deal?.conversation_id, conversationId]);

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ["crm-conv-cards", contactId] });
    qc.invalidateQueries({ queryKey: ["crm-cards"] });
    qc.invalidateQueries({ queryKey: ["crm-stages"] });
  }

  // "No topo": posição menor que a de todos os cartões da etapa.
  async function topPosition(stageId: string): Promise<number> {
    const { data } = await supabase
      .from("crm_cards")
      .select("position")
      .eq("stage_id", stageId)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    return (data?.position ?? 0) - 1;
  }

  // Move o cartão para uma etapa (dentro do mesmo funil). Ganho/Perdido
  // fecham o negócio (mesma regra do quadro).
  async function moveToStage(card: OpenCard, stage: CrmStage) {
    if (card.stage_id === stage.id) return;
    setBusy(true);
    const now = new Date().toISOString();
    const patch =
      stage.kind === "won"
        ? { stage_id: stage.id, status: "won" as const, won_at: now, lost_at: null }
        : stage.kind === "lost"
          ? { stage_id: stage.id, status: "lost" as const, lost_at: now, won_at: null }
          : { stage_id: stage.id, status: "open" as const, won_at: null, lost_at: null };
    const { error } = await supabase.from("crm_cards").update(patch).eq("id", card.id);
    setBusy(false);
    if (error) {
      toast.error("Não foi possível mudar a etapa.");
      return;
    }
    toast.success("Etapa atualizada.");
    invalidateAll();
  }

  // Move o cartão para outro funil (vai para a 1ª etapa "open" do destino).
  async function moveToFunnel(card: OpenCard, funnelId: string) {
    if (card.funnel_id === funnelId) return;
    setBusy(true);
    const { data: stage, error: stErr } = await supabase
      .from("crm_stages")
      .select("id")
      .eq("funnel_id", funnelId)
      .eq("kind", "open")
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (stErr || !stage) {
      setBusy(false);
      toast.error("Funil de destino sem etapa inicial.");
      return;
    }
    const position = await topPosition(stage.id);
    const { error } = await supabase
      .from("crm_cards")
      .update({ funnel_id: funnelId, stage_id: stage.id, status: "open", won_at: null, lost_at: null, position })
      .eq("id", card.id);
    setBusy(false);
    if (error) {
      const code = (error as { code?: string }).code;
      if (code === "23505") toast.error("O contato já tem um cartão aberto nesse funil.");
      else toast.error("Não foi possível mudar o funil.");
      return;
    }
    setSelectedFunnelId(funnelId);
    toast.success("Funil atualizado.");
    invalidateAll();
  }

  // Aloca o contato num funil/etapa (cria o cartão, ligado à conversa).
  async function addCard() {
    if (!orgId || !activeFunnelId || !addStageId) return;
    setBusy(true);
    const position = await topPosition(addStageId);
    const { error } = await supabase.from("crm_cards").insert({
      org_id: orgId,
      funnel_id: activeFunnelId,
      stage_id: addStageId,
      contact_id: contactId,
      conversation_id: conversationId,
      status: "open",
      position,
    });
    setBusy(false);
    if (error) {
      const code = (error as { code?: string }).code;
      if (code === "23505") toast.error("Esse contato já tem um cartão aberto neste funil.");
      else toast.error("Não foi possível adicionar ao funil.");
      return;
    }
    toast.success("Contato adicionado ao funil.");
    invalidateAll();
  }

  const heading = (
    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Funil / Etapa (CRM)</h4>
  );

  if (funnelsQuery.isLoading || cardsQuery.isLoading) {
    return (
      <>
        {heading}
        <p className="text-sm text-gray-400">Carregando…</p>
      </>
    );
  }

  if (funnels.length === 0) {
    return (
      <>
        {heading}
        <p className="text-sm text-gray-400">Crie um funil no CRM para usar aqui.</p>
      </>
    );
  }

  return (
    <>
      {heading}
      <div className="space-y-2">
        <div>
          <label className="text-xs font-medium text-gray-500">Funil</label>
          <select
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:outline-none disabled:opacity-60"
            value={activeFunnelId ?? ""}
            disabled={busy}
            onChange={(e) => {
              const v = e.target.value;
              if (deal) moveToFunnel(deal, v);
              else setSelectedFunnelId(v);
            }}
          >
            {funnels.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500">Etapa</label>
          <select
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:outline-none disabled:opacity-60"
            value={deal ? deal.stage_id : addStageId}
            disabled={busy || stagesQuery.isLoading || stages.length === 0}
            onChange={(e) => {
              const stage = stages.find((s) => s.id === e.target.value);
              if (!stage) return;
              if (deal) moveToStage(deal, stage);
              else setAddStageId(stage.id);
            }}
          >
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {!deal && (
          <button
            type="button"
            onClick={addCard}
            disabled={busy || !addStageId}
            className="w-full rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? "Adicionando…" : "Adicionar a este funil"}
          </button>
        )}

        <p className="text-[11px] text-gray-500">
          {deal
            ? "Mudar o funil ou a etapa acima já move o cartão deste contato no CRM."
            : "Este contato ainda não está em nenhum funil. Escolha e clique em Adicionar."}
        </p>
      </div>
    </>
  );
}
