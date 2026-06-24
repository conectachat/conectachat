/* eslint-disable @typescript-eslint/no-explicit-any */
// Camada de dados dos Relatórios (Fase B).
// As funções report_* vivem no banco (agregam em SQL e validam is_member_of).
// Aqui só chamamos via rpc; tabelas/RPCs novas → acesso solto (CLAUDE.md §8).
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export type ReportFilters = {
  from: string; // ISO
  to: string; // ISO
  channelId: string | null;
  departmentId: string | null;
  userId: string | null;
};

export type ReportOverview = {
  novas: number;
  encerradas: number;
  abertas: number;
  aguardando: number;
  recebidas: number;
  enviadas: number;
  transferencias: number;
  tma_primeira_resposta_seg: number | null;
  tma_atendimento_seg: number | null;
  aguardando_mais_1h: number;
};

export type TimeseriesPoint = { dia: string; conversas: number; recebidas: number; enviadas: number };
export type AgentRow = {
  user_id: string;
  nome: string;
  conversas: number;
  enviadas: number;
  encerradas: number;
  tma_1a_resp_seg: number | null;
};
export type ChannelRow = { channel_id: string; nome: string; conversas: number; recebidas: number; enviadas: number };
export type DepartmentRow = {
  department_id: string;
  nome: string;
  conversas: number;
  recebidas: number;
  enviadas: number;
};

const baseArgs = (orgId: string, f: ReportFilters) => ({
  p_org_id: orgId,
  p_from: f.from,
  p_to: f.to,
  p_channel_id: f.channelId,
  p_department_id: f.departmentId,
  p_user_id: f.userId,
});

const keyOf = (orgId: string | null, f: ReportFilters) =>
  [orgId, f.from, f.to, f.channelId, f.departmentId, f.userId] as const;

export function useReportOverview(orgId: string | null, f: ReportFilters) {
  return useQuery({
    queryKey: ["report-overview", ...keyOf(orgId, f)],
    enabled: !!orgId,
    queryFn: async (): Promise<ReportOverview> => {
      const { data, error } = await sb.rpc("report_overview", baseArgs(orgId!, f));
      if (error) throw error;
      return data as ReportOverview;
    },
  });
}

export function useReportTimeseries(orgId: string | null, f: ReportFilters) {
  return useQuery({
    queryKey: ["report-timeseries", ...keyOf(orgId, f)],
    enabled: !!orgId,
    queryFn: async (): Promise<TimeseriesPoint[]> => {
      const { data, error } = await sb.rpc("report_timeseries", baseArgs(orgId!, f));
      if (error) throw error;
      return (data ?? []) as TimeseriesPoint[];
    },
  });
}

export function useReportByAgent(orgId: string | null, f: ReportFilters) {
  return useQuery({
    queryKey: ["report-agent", orgId, f.from, f.to, f.channelId, f.departmentId],
    enabled: !!orgId,
    queryFn: async (): Promise<AgentRow[]> => {
      const { data, error } = await sb.rpc("report_by_agent", {
        p_org_id: orgId,
        p_from: f.from,
        p_to: f.to,
        p_channel_id: f.channelId,
        p_department_id: f.departmentId,
      });
      if (error) throw error;
      return (data ?? []) as AgentRow[];
    },
  });
}

export function useReportByChannel(orgId: string | null, f: ReportFilters) {
  return useQuery({
    queryKey: ["report-channel", orgId, f.from, f.to],
    enabled: !!orgId,
    queryFn: async (): Promise<ChannelRow[]> => {
      const { data, error } = await sb.rpc("report_by_channel", {
        p_org_id: orgId,
        p_from: f.from,
        p_to: f.to,
      });
      if (error) throw error;
      return (data ?? []) as ChannelRow[];
    },
  });
}

export function useReportByDepartment(orgId: string | null, f: ReportFilters) {
  return useQuery({
    queryKey: ["report-department", orgId, f.from, f.to],
    enabled: !!orgId,
    queryFn: async (): Promise<DepartmentRow[]> => {
      const { data, error } = await sb.rpc("report_by_department", {
        p_org_id: orgId,
        p_from: f.from,
        p_to: f.to,
      });
      if (error) throw error;
      return (data ?? []) as DepartmentRow[];
    },
  });
}

// Listas para os seletores de filtro.
export function useReportFilterOptions(orgId: string | null) {
  return useQuery({
    queryKey: ["report-filter-options", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const [channels, departments, members] = await Promise.all([
        sb.from("channels").select("id, name").eq("org_id", orgId),
        sb.from("departments").select("id, name").eq("org_id", orgId),
        sb.from("org_members").select("user_id, profiles(full_name, email)").eq("org_id", orgId),
      ]);
      return {
        channels: (channels.data ?? []).map((c: any) => ({ id: c.id, name: c.name || "Canal" })),
        departments: (departments.data ?? []).map((d: any) => ({ id: d.id, name: d.name || "Departamento" })),
        agents: (members.data ?? []).map((m: any) => ({
          id: m.user_id,
          name: m.profiles?.full_name || m.profiles?.email || "Usuário",
        })),
      };
    },
  });
}

// Segundos → "Xh Ym" / "Xm Ys" / "Xs" (ou "—").
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || Number.isNaN(seconds)) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}
