import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  formatDuration,
  useReportByAgent,
  useReportByChannel,
  useReportByDepartment,
  useReportFilterOptions,
  useReportOverview,
  useReportTimeseries,
  type ReportFilters,
} from "@/components/reports/use-reports";

const BRAND_GREEN = "#8FC549";
const BRAND_BLUE = "#0055A6";

type Period = "hoje" | "7d" | "30d" | "custom";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function computeRange(period: Period, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date();
  const end = new Date(now.getTime() + 1000); // inclui o instante atual
  if (period === "hoje") return { from: startOfDay(now).toISOString(), to: end.toISOString() };
  if (period === "7d")
    return { from: startOfDay(new Date(now.getTime() - 6 * 86400000)).toISOString(), to: end.toISOString() };
  if (period === "30d")
    return { from: startOfDay(new Date(now.getTime() - 29 * 86400000)).toISOString(), to: end.toISOString() };
  // custom
  const f = customFrom ? new Date(customFrom + "T00:00:00") : startOfDay(now);
  const t = customTo ? new Date(customTo + "T23:59:59") : end;
  return { from: f.toISOString(), to: t.toISOString() };
}

function fmtDay(iso: string) {
  // iso = 'YYYY-MM-DD'
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </Card>
  );
}

export function ReportsScreen() {
  const { activeMembership } = useCurrentUser();
  const orgId = activeMembership?.org_id ?? null;

  const [period, setPeriod] = useState<Period>("7d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [channelId, setChannelId] = useState<string | null>(null);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const range = useMemo(() => computeRange(period, customFrom, customTo), [period, customFrom, customTo]);
  const filters: ReportFilters = useMemo(
    () => ({ from: range.from, to: range.to, channelId, departmentId, userId }),
    [range, channelId, departmentId, userId],
  );

  const options = useReportFilterOptions(orgId);
  const overview = useReportOverview(orgId, filters);
  const series = useReportTimeseries(orgId, filters);
  const byAgent = useReportByAgent(orgId, filters);
  const byChannel = useReportByChannel(orgId, filters);
  const byDept = useReportByDepartment(orgId, filters);

  const o = overview.data;

  function exportCSV() {
    const lines: string[] = [];
    lines.push("Métrica;Valor");
    if (o) {
      lines.push(`Conversas novas;${o.novas}`);
      lines.push(`Encerradas;${o.encerradas}`);
      lines.push(`Em aberto;${o.abertas}`);
      lines.push(`Aguardando;${o.aguardando}`);
      lines.push(`Mensagens recebidas;${o.recebidas}`);
      lines.push(`Mensagens enviadas;${o.enviadas}`);
      lines.push(`Transferências;${o.transferencias}`);
      lines.push(`Tempo médio 1ª resposta;${formatDuration(o.tma_primeira_resposta_seg)}`);
      lines.push(`Tempo médio atendimento;${formatDuration(o.tma_atendimento_seg)}`);
      lines.push(`Aguardando +1h;${o.aguardando_mais_1h}`);
    }
    lines.push("");
    lines.push("Atendente;Conversas;Enviadas;Encerradas;Tempo 1ª resposta");
    for (const a of byAgent.data ?? []) {
      lines.push(`${a.nome};${a.conversas};${a.enviadas};${a.encerradas};${formatDuration(a.tma_1a_resp_seg)}`);
    }
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `relatorio_${range.from.slice(0, 10)}_${range.to.slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const onSelect = (set: (x: string | null) => void) => (val: string) => set(val === "all" ? null : val);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      {/* Cabeçalho + filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto flex items-center gap-2 text-lg font-semibold">
          <BarChart3 className="h-5 w-5 text-brand-green" />
          Relatórios
        </h1>

        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="h-9 w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hoje">Hoje</SelectItem>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
            <SelectItem value="custom">Personalizado</SelectItem>
          </SelectContent>
        </Select>

        {period === "custom" && (
          <>
            <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 w-40" />
            <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9 w-40" />
          </>
        )}

        <Select value={channelId ?? "all"} onValueChange={onSelect(setChannelId)}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue placeholder="Canal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os canais</SelectItem>
            {(options.data?.channels ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={departmentId ?? "all"} onValueChange={onSelect(setDepartmentId)}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder="Departamento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os departamentos</SelectItem>
            {(options.data?.departments ?? []).map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={userId ?? "all"} onValueChange={onSelect(setUserId)}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue placeholder="Atendente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os atendentes</SelectItem>
            {(options.data?.agents ?? []).map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" className="h-9 gap-1" onClick={exportCSV} disabled={!o}>
          <Download className="h-4 w-4" />
          CSV
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Conversas novas" value={o ? String(o.novas) : "—"} />
        <KpiCard label="Encerradas" value={o ? String(o.encerradas) : "—"} />
        <KpiCard label="Em aberto" value={o ? String(o.abertas) : "—"} />
        <KpiCard label="Aguardando" value={o ? String(o.aguardando) : "—"} hint={o ? `${o.aguardando_mais_1h} há +1h` : undefined} />
        <KpiCard label="Transferências" value={o ? String(o.transferencias) : "—"} />
        <KpiCard label="Recebidas" value={o ? String(o.recebidas) : "—"} />
        <KpiCard label="Enviadas" value={o ? String(o.enviadas) : "—"} />
        <KpiCard label="Tempo 1ª resposta" value={formatDuration(o?.tma_primeira_resposta_seg)} />
        <KpiCard label="Tempo de atendimento" value={formatDuration(o?.tma_atendimento_seg)} />
      </div>

      {/* Série temporal */}
      <Card className="p-4">
        <p className="mb-3 text-sm font-medium">Atividade por dia</p>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series.data ?? []} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="gConv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={BRAND_GREEN} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={BRAND_GREEN} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gMsg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={BRAND_BLUE} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={BRAND_BLUE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              <XAxis dataKey="dia" tickFormatter={fmtDay} fontSize={11} tickLine={false} axisLine={false} />
              <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
              <Tooltip
                labelFormatter={(l) => fmtDay(String(l))}
                formatter={(v: number, n: string) => [v, n === "conversas" ? "Conversas" : n === "recebidas" ? "Recebidas" : "Enviadas"]}
              />
              <Area type="monotone" dataKey="conversas" stroke={BRAND_GREEN} fill="url(#gConv)" strokeWidth={2} />
              <Area type="monotone" dataKey="recebidas" stroke={BRAND_BLUE} fill="url(#gMsg)" strokeWidth={2} />
              <Area type="monotone" dataKey="enviadas" stroke="#94a3b8" fillOpacity={0} strokeWidth={1.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Por atendente */}
      <Card className="p-4">
        <p className="mb-2 text-sm font-medium">Por atendente</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Atendente</TableHead>
              <TableHead className="text-right">Conversas</TableHead>
              <TableHead className="text-right">Enviadas</TableHead>
              <TableHead className="text-right">Encerradas</TableHead>
              <TableHead className="text-right">1ª resposta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(byAgent.data ?? []).map((a) => (
              <TableRow key={a.user_id}>
                <TableCell className="font-medium">{a.nome}</TableCell>
                <TableCell className="text-right tabular-nums">{a.conversas}</TableCell>
                <TableCell className="text-right tabular-nums">{a.enviadas}</TableCell>
                <TableCell className="text-right tabular-nums">{a.encerradas}</TableCell>
                <TableCell className="text-right tabular-nums">{formatDuration(a.tma_1a_resp_seg)}</TableCell>
              </TableRow>
            ))}
            {(byAgent.data ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  Sem dados no período.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Por canal / por departamento */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <p className="mb-2 text-sm font-medium">Por canal</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Canal</TableHead>
                <TableHead className="text-right">Conversas</TableHead>
                <TableHead className="text-right">Recebidas</TableHead>
                <TableHead className="text-right">Enviadas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(byChannel.data ?? []).map((c) => (
                <TableRow key={c.channel_id}>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.conversas}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.recebidas}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.enviadas}</TableCell>
                </TableRow>
              ))}
              {(byChannel.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    Sem dados.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

        <Card className="p-4">
          <p className="mb-2 text-sm font-medium">Por departamento</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Departamento</TableHead>
                <TableHead className="text-right">Conversas</TableHead>
                <TableHead className="text-right">Recebidas</TableHead>
                <TableHead className="text-right">Enviadas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(byDept.data ?? []).map((d) => (
                <TableRow key={d.department_id}>
                  <TableCell className="font-medium">{d.nome}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.conversas}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.recebidas}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.enviadas}</TableCell>
                </TableRow>
              ))}
              {(byDept.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    Sem dados.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
