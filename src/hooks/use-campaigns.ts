import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";

// Tabelas campaigns/* não estão no types.ts gerado → acesso via (supabase as any) (CLAUDE.md §8).
const sb = supabase as any;

export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "running"
  | "paused"
  | "completed"
  | "cancelled";

export type CampaignRow = {
  id: string;
  name: string;
  status: CampaignStatus;
  channel_id: string;
  target_type: "tag" | "list" | "all";
  start_at: string | null;
  total_count: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
};

export function useCampaigns() {
  const { activeMembership } = useCurrentUser();
  const orgId = activeMembership?.org_id ?? null;
  return useQuery({
    queryKey: ["campaigns", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<CampaignRow[]> => {
      const { data, error } = await sb
        .from("campaigns")
        .select(
          "id, name, status, channel_id, target_type, start_at, total_count, sent_count, failed_count, created_at",
        )
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CampaignRow[];
    },
  });
}

export type CampaignChannel = {
  id: string;
  name: string;
  type: string;
  status: string;
};

// Canais (conexões) da empresa, com tipo e status — para escolher de qual número a campanha sai
// e mostrar o alerta de risco específico do canal.
export function useCampaignChannels() {
  const { activeMembership } = useCurrentUser();
  const orgId = activeMembership?.org_id ?? null;
  return useQuery({
    queryKey: ["campaign-channels", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<CampaignChannel[]> => {
      const { data, error } = await sb
        .from("channels")
        .select("id, name, type, status")
        .eq("org_id", orgId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as CampaignChannel[];
    },
  });
}

// Aviso de risco por TIPO de canal (somos multicanal). Estende quando ativar novos canais.
export function channelRiskInfo(type: string): { level: "alto" | "medio" | "info"; text: string } {
  switch (type) {
    case "whatsapp_baileys":
      return {
        level: "alto",
        text: "Conexão via QR Code (WhatsApp NÃO-OFICIAL). Disparos em massa têm RISCO DE BANIMENTO do número. Use listas com opt-in, comece no ritmo Conservador e evite enviar para quem nunca te respondeu.",
      };
    case "whatsapp_cloud":
      return {
        level: "medio",
        text: "API Oficial do WhatsApp (Meta): para mensagens de marketing, exige modelo (template) aprovado e respeita a janela de 24h. Menor risco de banimento, mas siga as políticas da Meta.",
      };
    case "instagram":
    case "messenger":
      return {
        level: "medio",
        text: "Canal da Meta: siga as regras de mensagem da plataforma (janelas de resposta e consentimento). Disparos fora das regras podem bloquear a conta.",
      };
    default:
      return {
        level: "info",
        text: "Envie com responsabilidade: prefira contatos que optaram por receber e comece devagar.",
      };
  }
}

// Chama a Edge Function manage-campaign (JWT automático). Convenção { ok, error } com HTTP 200.
export async function invokeManageCampaign(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("manage-campaign", { body });
  if (error || !(data as any)?.ok) {
    throw new Error((data as any)?.error || "Não foi possível concluir a ação da campanha.");
  }
  return data as any;
}
