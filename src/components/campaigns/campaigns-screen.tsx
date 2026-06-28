import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Megaphone, Plus, Pause, Play, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useOrgTags } from "@/components/contacts/contact-tags";
import {
  useCampaigns,
  useCampaignChannels,
  channelRiskInfo,
  invokeManageCampaign,
  type CampaignRow,
  type CampaignStatus,
} from "@/hooks/use-campaigns";

const STATUS_LABEL: Record<CampaignStatus, { label: string; cls: string }> = {
  draft: { label: "Rascunho", cls: "bg-gray-100 text-gray-700" },
  scheduled: { label: "Agendada", cls: "bg-amber-100 text-amber-800" },
  running: { label: "Enviando", cls: "bg-blue-100 text-blue-800" },
  paused: { label: "Pausada", cls: "bg-amber-100 text-amber-800" },
  completed: { label: "Concluída", cls: "bg-green-100 text-green-800" },
  cancelled: { label: "Cancelada", cls: "bg-gray-100 text-gray-500" },
};

const VARS = [
  { key: "{primeiro_nome}", label: "Primeiro nome" },
  { key: "{nome}", label: "Nome completo" },
];

const PRESETS = {
  conservador: { rate: 8, daily: 300 },
  normal: { rate: 15, daily: 800 },
};

export function CampaignsScreen() {
  const { activeMembership } = useCurrentUser();
  const orgId = activeMembership?.org_id ?? null;
  const qc = useQueryClient();

  const campaignsQuery = useCampaigns();
  const channelsQuery = useCampaignChannels();
  const tags = useOrgTags(orgId);

  const campaigns = campaignsQuery.data ?? [];
  const channels = channelsQuery.data ?? [];

  // ---- form (nova campanha) ----
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fName, setFName] = useState("");
  const [fChannel, setFChannel] = useState("");
  const [fTargetType, setFTargetType] = useState<"tag" | "all">("tag");
  const [fTagId, setFTagId] = useState("");
  const [fMessage, setFMessage] = useState("");
  const [fPreset, setFPreset] = useState<"conservador" | "normal" | "custom">("conservador");
  const [fRate, setFRate] = useState(8);
  const [fDaily, setFDaily] = useState(300);
  const [fHumanize, setFHumanize] = useState(true);
  const [fBusinessHours, setFBusinessHours] = useState(true);
  const [fWhen, setFWhen] = useState(""); // datetime-local; vazio = agora

  const selectedChannel = useMemo(
    () => channels.find((c) => c.id === fChannel) ?? null,
    [channels, fChannel],
  );
  const risk = selectedChannel ? channelRiskInfo(selectedChannel.type) : null;

  function openNew() {
    setFName("");
    setFChannel(channels[0]?.id ?? "");
    setFTargetType("tag");
    setFTagId("");
    setFMessage("");
    setFPreset("conservador");
    setFRate(PRESETS.conservador.rate);
    setFDaily(PRESETS.conservador.daily);
    setFHumanize(true);
    setFBusinessHours(true);
    setFWhen("");
    setOpen(true);
  }

  function applyPreset(p: "conservador" | "normal" | "custom") {
    setFPreset(p);
    if (p !== "custom") {
      setFRate(PRESETS[p].rate);
      setFDaily(PRESETS[p].daily);
    }
  }

  function insertVar(v: string) {
    setFMessage((m) => (m ? `${m} ${v}` : v));
  }

  async function createCampaign() {
    if (!orgId) return;
    if (!fName.trim()) return toast.error("Dê um nome à campanha.");
    if (!fChannel) return toast.error("Escolha o canal de envio.");
    if (fTargetType === "tag" && !fTagId) return toast.error("Escolha a etiqueta do público.");
    if (!fMessage.trim()) return toast.error("Escreva a mensagem.");
    setBusy(true);
    try {
      const res = await invokeManageCampaign({
        action: "create",
        orgId,
        channelId: fChannel,
        name: fName.trim(),
        messageText: fMessage,
        targetType: fTargetType,
        targetTagId: fTargetType === "tag" ? fTagId : null,
        ratePerMin: fRate,
        dailyCap: fDaily,
        humanize: fHumanize,
        businessHoursOnly: fBusinessHours,
        startAt: fWhen ? new Date(fWhen).toISOString() : null,
      });
      if (res?.total === 0) {
        toast.warning(res?.warning || "Nenhum contato no público escolhido.");
      } else {
        toast.success(`Campanha criada para ${res?.total ?? 0} contato(s).`);
      }
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível criar a campanha.");
    } finally {
      setBusy(false);
    }
  }

  async function action(c: CampaignRow, act: "pause" | "resume" | "cancel") {
    try {
      await invokeManageCampaign({ action: act, campaignId: c.id });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível atualizar a campanha.");
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-gray-50 dark:bg-background">
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-5xl">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <SidebarTrigger className="shrink-0 md:hidden" />
              <div>
                <h1 className="flex items-center gap-2 text-xl font-semibold">
                  <Megaphone size={20} /> Campanhas
                </h1>
                <p className="text-sm text-muted-foreground">Disparo em massa para listas de contatos.</p>
              </div>
            </div>
            <Button onClick={openNew} className="gap-1">
              <Plus size={16} /> Nova campanha
            </Button>
          </div>

          {campaignsQuery.isLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : campaigns.length === 0 ? (
            <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
              Nenhuma campanha ainda. Clique em “Nova campanha” para começar.
            </div>
          ) : (
            <div className="space-y-2">
              {campaigns.map((c) => {
                const st = STATUS_LABEL[c.status];
                const pct = c.total_count > 0 ? Math.round((c.sent_count / c.total_count) * 100) : 0;
                return (
                  <div key={c.id} className="rounded-lg border bg-white p-4 dark:bg-background">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{c.name}</span>
                          <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {c.sent_count}/{c.total_count} enviadas
                          {c.failed_count > 0 ? ` · ${c.failed_count} falhas` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {(c.status === "running" || c.status === "scheduled") && (
                          <button
                            onClick={() => action(c, "pause")}
                            title="Pausar"
                            className="flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                          >
                            <Pause size={13} /> Pausar
                          </button>
                        )}
                        {c.status === "paused" && (
                          <button
                            onClick={() => action(c, "resume")}
                            title="Retomar"
                            className="flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                          >
                            <Play size={13} /> Retomar
                          </button>
                        )}
                        {c.status !== "completed" && c.status !== "cancelled" && (
                          <button
                            onClick={() => action(c, "cancel")}
                            title="Cancelar"
                            className="flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                          >
                            <X size={13} /> Cancelar
                          </button>
                        )}
                      </div>
                    </div>
                    {c.total_count > 0 && (
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full bg-brand-green" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal: nova campanha */}
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova campanha</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="c-name">Nome da campanha</Label>
              <Input id="c-name" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="Ex.: Black Friday" />
            </div>

            <div className="space-y-1.5">
              <Label>Canal de envio</Label>
              <select
                value={fChannel}
                onChange={(e) => setFChannel(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-blue focus:outline-none"
              >
                <option value="">Selecione…</option>
                {channels.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.name} {ch.status !== "connected" ? "(desconectado)" : ""}
                  </option>
                ))}
              </select>
              {risk && (
                <div
                  className={`mt-1 flex gap-2 rounded-md border p-2 text-xs ${
                    risk.level === "alto"
                      ? "border-red-200 bg-red-50 text-red-700"
                      : risk.level === "medio"
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : "border-gray-200 bg-gray-50 text-gray-600"
                  }`}
                >
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>{risk.text}</span>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Público</Label>
              <div className="flex gap-2">
                {(
                  [
                    ["tag", "Por etiqueta"],
                    ["all", "Todos os contatos"],
                  ] as const
                ).map(([k, lbl]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setFTargetType(k)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                      fTargetType === k
                        ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                        : "border-gray-300 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
              {fTargetType === "tag" && (
                <select
                  value={fTagId}
                  onChange={(e) => setFTagId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-blue focus:outline-none"
                >
                  <option value="">Selecione a etiqueta…</option>
                  {(tags.data ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
              <p className="text-[11px] text-muted-foreground">
                Contatos bloqueados (que pediram para sair) são sempre excluídos.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="c-msg">Mensagem</Label>
              <Textarea
                id="c-msg"
                rows={4}
                value={fMessage}
                onChange={(e) => setFMessage(e.target.value)}
                placeholder="Olá {primeiro_nome}! ..."
              />
              <div className="flex flex-wrap gap-1">
                {VARS.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVar(v.key)}
                    className="rounded-full border border-gray-300 px-2 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50"
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Ritmo de envio (anti-banimento)</Label>
              <div className="flex gap-2">
                {(
                  [
                    ["conservador", "Conservador"],
                    ["normal", "Normal"],
                    ["custom", "Personalizado"],
                  ] as const
                ).map(([k, lbl]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => applyPreset(k)}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium ${
                      fPreset === k
                        ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                        : "border-gray-300 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
              {fPreset === "custom" && (
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Por minuto</Label>
                    <Input
                      type="number"
                      min={1}
                      max={60}
                      value={fRate}
                      onChange={(e) => setFRate(Math.max(1, Math.min(60, parseInt(e.target.value, 10) || 1)))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Máx. por dia</Label>
                    <Input
                      type="number"
                      min={1}
                      max={5000}
                      value={fDaily}
                      onChange={(e) => setFDaily(Math.max(1, Math.min(5000, parseInt(e.target.value, 10) || 1)))}
                    />
                  </div>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                Atual: ~{fRate} msg/min, até {fDaily}/dia. Mais rápido = maior risco de banimento.
              </p>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Só em horário comercial</p>
                <p className="text-xs text-muted-foreground">Envia só entre 8h e 20h (fuso da empresa).</p>
              </div>
              <Switch checked={fBusinessHours} onCheckedChange={setFBusinessHours} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Humanizar envio</p>
                <p className="text-xs text-muted-foreground">Pequena variação de tempo entre mensagens.</p>
              </div>
              <Switch checked={fHumanize} onCheckedChange={setFHumanize} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="c-when">Quando enviar</Label>
              <Input id="c-when" type="datetime-local" value={fWhen} onChange={(e) => setFWhen(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">Deixe em branco para começar agora.</p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={busy}>
                Cancelar
              </Button>
              <Button size="sm" onClick={createCampaign} disabled={busy}>
                {busy ? "Criando…" : "Criar campanha"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
