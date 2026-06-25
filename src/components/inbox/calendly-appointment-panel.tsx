/* eslint-disable @typescript-eslint/no-explicit-any */
// =====================================================================
//  Painel "Agendamento (Calendly)" no painel de dados do contato (C3 + C5).
//  - Mostra os agendamentos da conversa (card com data/hora, link,
//    Cancelar via API e Remarcar abrindo o link do Calendly).
//  - Botão "Agendar":
//      • Light (grátis): abre o EMBED do Calendly (iframe). Ao concluir,
//        captura o evento (capture_booking) e grava em appointments.
//      • Pro (pago, C5): agendamento NATIVO — escolhe o tipo, um horário
//        livre e preenche e-mail + perguntas obrigatórias; chama a ação
//        "book" (Scheduling API, sem iframe).
//  - "Remarcar" sempre usa o embed do reschedule_url (não há API de
//    remarcação no Calendly), nos dois planos.
//  Atualiza sozinho via Realtime.
//  Tabelas calendly_connections/appointments via (supabase as any) (CLAUDE.md §8).
// =====================================================================
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarClock, CalendarPlus, ExternalLink, Loader2, X, CalendarX, ChevronLeft } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Appointment = {
  id: string;
  event_type_name: string | null;
  start_time: string;
  status: string;
  join_url: string | null;
  reschedule_url: string | null;
  invitee_name: string | null;
  invitee_timezone: string | null;
};

type CustomQ = {
  name: string;
  type: string; // "text" | "phone_number" | "single_select" | "multi_select" | ...
  position: number;
  enabled: boolean;
  required: boolean;
  answer_choices: string[];
};

type EventType = {
  uri: string;
  name: string;
  duration: number | null;
  scheduling_url: string;
  pooling_type?: string | null;
  locations?: any[];
  custom_questions?: CustomQ[];
};

type Slot = { start_time: string; status: string; scheduling_url: string; invitees_remaining?: number };

const sb = supabase as any;
// Fuso padrão para exibir os horários e mandar ao Calendly (cliente BR).
const TZ = "America/Sao_Paulo";
const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 14; // quanto carregamos por vez no seletor de horários

function loadCalendlyScript(): Promise<void> {
  return new Promise((resolve) => {
    if ((window as any).Calendly) return resolve();
    const id = "calendly-widget-script";
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      return;
    }
    const s = document.createElement("script");
    s.id = id;
    s.src = "https://assets.calendly.com/assets/external/widget.js";
    s.async = true;
    s.onload = () => resolve();
    document.body.appendChild(s);
  });
}

function fmtDateTime(iso: string, tz: string | null): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: tz || undefined,
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString("pt-BR");
  }
}

function dayLabel(iso: string): string {
  const s = new Intl.DateTimeFormat("pt-BR", {
    weekday: "short", day: "2-digit", month: "2-digit", timeZone: TZ,
  }).format(new Date(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
}

export function CalendlyAppointmentPanel({
  orgId,
  conversationId,
  contactId,
  contactName,
  contactEmail,
}: {
  orgId: string | null;
  conversationId: string;
  contactId: string;
  contactName?: string | null;
  contactEmail?: string | null;
}) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [planTier, setPlanTier] = useState<"light" | "pro" | null>(null);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [open, setOpen] = useState(false);
  const [types, setTypes] = useState<EventType[] | null>(null);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [chosen, setChosen] = useState<EventType | null>(null);
  const [rescheduleUrl, setRescheduleUrl] = useState<string | null>(null);
  const reschedulingRef = useRef<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const embedRef = useRef<HTMLDivElement | null>(null);

  // ---- Estado do agendamento nativo (Pro) ----
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotRangeEnd, setSlotRangeEnd] = useState<number>(0);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [fName, setFName] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fLocation, setFLocation] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [booking, setBooking] = useState(false);

  const isPro = planTier === "pro";
  const firstLoc = chosen?.locations?.[0];
  const needsLocationInput =
    !!firstLoc && (firstLoc.kind === "ask_invitee" || firstLoc.kind === "outbound_call");

  function resetDialog() {
    setChosen(null);
    setRescheduleUrl(null);
    reschedulingRef.current = null;
    setSlots([]);
    setSelectedSlot(null);
    setFLocation("");
    setAnswers({});
  }

  async function loadAppointments() {
    const { data } = await sb
      .from("appointments")
      .select("id, event_type_name, start_time, status, join_url, reschedule_url, invitee_name, invitee_timezone")
      .eq("conversation_id", conversationId)
      .order("start_time", { ascending: false });
    setAppts((data ?? []) as Appointment[]);
  }

  async function checkConnection() {
    if (!orgId) return;
    const { data } = await sb
      .from("calendly_connections")
      .select("status, plan_tier")
      .eq("org_id", orgId)
      .maybeSingle();
    setConnected(!!data && data.status === "active");
    setPlanTier((data?.plan_tier as "light" | "pro") ?? null);
  }

  useEffect(() => {
    checkConnection();
    loadAppointments();
    const channel = supabase
      .channel(`appts-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments", filter: `conversation_id=eq.${conversationId}` },
        () => loadAppointments(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, orgId]);

  // Captura o agendamento concluído no embed do Calendly (Light + Remarcar).
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (typeof e.origin === "string" && !e.origin.includes("calendly.com")) return;
      const data: any = e.data;
      if (data?.event === "calendly.event_scheduled") {
        const eventUri = data?.payload?.event?.uri;
        const inviteeUri = data?.payload?.invitee?.uri;
        if (eventUri && inviteeUri) void capture(eventUri, inviteeUri);
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, contactId, orgId]);

  async function capture(eventUri: string, inviteeUri: string) {
    try {
      const { data, error } = await supabase.functions.invoke("calendly-api", {
        body: {
          action: "capture_booking",
          orgId,
          conversationId,
          contactId,
          eventUri,
          inviteeUri,
          rescheduledFromId: reschedulingRef.current,
        },
      });
      if (error || !data?.ok) {
        toast.error("Agendou no Calendly, mas falhou ao registrar aqui.", { description: data?.error ?? error?.message });
        return;
      }
      toast.success(reschedulingRef.current ? "Reunião remarcada!" : "Agendamento registrado!");
      setOpen(false);
      resetDialog();
      await loadAppointments();
    } catch (e) {
      toast.error("Falha ao registrar o agendamento", { description: String((e as Error)?.message ?? e) });
    }
  }

  async function abrirAgendar() {
    setOpen(true);
    setChosen(null);
    if (types || !orgId) return;
    setLoadingTypes(true);
    try {
      const { data, error } = await supabase.functions.invoke("calendly-api", {
        body: { action: "event_types", orgId },
      });
      if (error || !data?.ok) {
        toast.error("Não foi possível carregar os tipos de evento", { description: data?.error ?? error?.message });
        setTypes([]);
        return;
      }
      const list = (data.event_types ?? []) as EventType[];
      setTypes(list);
      if (list.length === 1) setChosen(list[0]);
    } finally {
      setLoadingTypes(false);
    }
  }

  // Quando um tipo é escolhido (nome/e-mail prefill) ao entrar no fluxo nativo.
  useEffect(() => {
    if (chosen) {
      setFName(contactName ?? "");
      setFEmail(contactEmail ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen]);

  // ----- Horários livres (Pro nativo) -----
  async function loadSlots(fromMs: number, toMs: number, append: boolean) {
    if (!chosen || !orgId) return;
    setLoadingSlots(true);
    try {
      const { data, error } = await supabase.functions.invoke("calendly-api", {
        body: {
          action: "available_times",
          orgId,
          eventType: chosen.uri,
          start: new Date(fromMs).toISOString(),
          end: new Date(toMs).toISOString(),
        },
      });
      if (error || !data?.ok) {
        toast.error("Não foi possível carregar os horários", { description: data?.error ?? error?.message });
        if (!append) setSlots([]);
        return;
      }
      const list = ((data.available_times ?? []) as Slot[]).filter((s) => s.status === "available");
      setSlots((prev) => (append ? [...prev, ...list] : list));
      setSlotRangeEnd(toMs);
    } finally {
      setLoadingSlots(false);
    }
  }

  // Carrega os horários ao escolher o tipo no modo Pro.
  useEffect(() => {
    if (!open || !isPro || !chosen || rescheduleUrl) return;
    const from = Date.now() + 60000;
    const to = from + WINDOW_DAYS * DAY_MS;
    setSlots([]);
    setSelectedSlot(null);
    void loadSlots(from, to, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isPro, chosen, rescheduleUrl]);

  // Monta o embed (Light) ou a remarcação (ambos os planos).
  useEffect(() => {
    if (!open || !embedRef.current) return;
    let url: string | null = null;
    if (rescheduleUrl) {
      url = rescheduleUrl;
    } else if (chosen && !isPro) {
      // Light: embed da página. encodeURIComponent → espaço vira %20.
      const parts: string[] = [];
      if (contactName) parts.push(`name=${encodeURIComponent(contactName)}`);
      if (contactEmail) parts.push(`email=${encodeURIComponent(contactEmail)}`);
      const sep = chosen.scheduling_url.includes("?") ? "&" : "?";
      url = parts.length ? `${chosen.scheduling_url}${sep}${parts.join("&")}` : chosen.scheduling_url;
    }
    if (!url) return;
    const target = url;
    let cancelled = false;
    loadCalendlyScript().then(() => {
      if (cancelled || !embedRef.current) return;
      embedRef.current.innerHTML = "";
      (window as any).Calendly?.initInlineWidget({ url: target, parentElement: embedRef.current });
    });
    return () => {
      cancelled = true;
    };
  }, [open, chosen, rescheduleUrl, isPro, contactName, contactEmail]);

  async function confirmBooking() {
    if (!chosen || !selectedSlot) return;
    if (!fEmail.trim()) {
      toast.error("Informe o e-mail do convidado para agendar.");
      return;
    }
    const enabledQs = (chosen.custom_questions ?? []).filter((q) => q.enabled);
    const missingReq = enabledQs.filter((q) => q.required && !(answers[q.name] ?? "").trim());
    if (missingReq.length) {
      toast.error("Responda as perguntas obrigatórias.", { description: missingReq.map((q) => q.name).join(", ") });
      return;
    }
    if (needsLocationInput && !fLocation.trim()) {
      toast.error("Informe o local/telefone da reunião.");
      return;
    }
    setBooking(true);
    try {
      const answersPayload = enabledQs
        .filter((q) => (answers[q.name] ?? "").trim())
        .map((q) => ({ question: q.name, answer: answers[q.name].trim(), position: q.position }));
      const { data, error } = await supabase.functions.invoke("calendly-api", {
        body: {
          action: "book",
          orgId,
          eventType: chosen.uri,
          startTime: selectedSlot,
          conversationId,
          contactId,
          invitee: { name: fName.trim() || contactName || "Convidado", email: fEmail.trim(), timezone: TZ },
          answers: answersPayload,
          rescheduledFromId: reschedulingRef.current ?? null,
          locationInput: needsLocationInput ? fLocation.trim() : undefined,
        },
      });
      if (error) {
        toast.error("Falha ao agendar", { description: error.message });
        return;
      }
      if (data?.error === "slot_taken") {
        toast.error("Esse horário acabou de ser ocupado. Escolha outro.");
        setSelectedSlot(null);
        const from = Date.now() + 60000;
        void loadSlots(from, from + WINDOW_DAYS * DAY_MS, false);
        return;
      }
      if (data?.error === "missing_fields") {
        toast.error("Faltam dados obrigatórios.", { description: (data.fields ?? []).join(", ") });
        return;
      }
      if (data?.error === "forbidden") {
        toast.error("A conta Calendly não permite agendamento nativo (plano).");
        return;
      }
      if (!data?.ok) {
        toast.error("Não foi possível agendar", { description: data?.detail ?? data?.error });
        return;
      }
      toast.success(reschedulingRef.current ? "Reunião remarcada!" : "Agendamento criado!");
      setOpen(false);
      resetDialog();
      await loadAppointments();
    } finally {
      setBooking(false);
    }
  }

  async function cancelar(appointmentId: string) {
    setBusyId(appointmentId);
    try {
      const { data, error } = await supabase.functions.invoke("calendly-api", {
        body: { action: "cancel", orgId, appointmentId },
      });
      if (error || !data?.ok) {
        toast.error("Não foi possível cancelar", { description: data?.error ?? error?.message });
        return;
      }
      toast.success("Agendamento cancelado.");
      await loadAppointments();
    } finally {
      setBusyId(null);
    }
  }

  const active = appts.filter((a) => a.status === "active");

  // Agrupa os horários por dia, preservando a ordem.
  const slotGroups: { day: string; items: Slot[] }[] = [];
  for (const s of slots) {
    const day = dayLabel(s.start_time);
    let g = slotGroups.find((x) => x.day === day);
    if (!g) {
      g = { day, items: [] };
      slotGroups.push(g);
    }
    g.items.push(s);
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Agendamentos</h4>
        {connected && (
          <Button size="sm" variant="outline" className="h-7 gap-1" onClick={abrirAgendar}>
            <CalendarPlus className="h-3.5 w-3.5" /> Agendar
          </Button>
        )}
      </div>

      {connected === false ? (
        <p className="text-xs text-muted-foreground">
          Conecte o Calendly em{" "}
          <Link to="/integracoes/$slug" params={{ slug: "calendly" }} className="text-brand-blue hover:underline">
            Integrações
          </Link>{" "}
          para agendar reuniões pela conversa.
        </p>
      ) : active.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum agendamento ativo nesta conversa.</p>
      ) : (
        <ul className="space-y-2">
          {active.map((a) => (
            <li key={a.id} className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 shrink-0 text-brand-green" />
                <span className="text-sm font-medium text-gray-900">{a.event_type_name ?? "Reunião"}</span>
              </div>
              <p className="mt-1 text-xs text-gray-600">{fmtDateTime(a.start_time, a.invitee_timezone)}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {a.join_url && (
                  <a
                    href={a.join_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    <ExternalLink className="h-3 w-3" /> Entrar
                  </a>
                )}
                {a.reschedule_url && (
                  <button
                    onClick={() => {
                      reschedulingRef.current = a.id;
                      setChosen(null);
                      setRescheduleUrl(a.reschedule_url);
                      setOpen(true);
                    }}
                    className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    <CalendarClock className="h-3 w-3" /> Remarcar
                  </button>
                )}
                <button
                  onClick={() => cancelar(a.id)}
                  disabled={busyId === a.id}
                  className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  {busyId === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CalendarX className="h-3 w-3" />} Cancelar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) resetDialog();
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{rescheduleUrl ? "Remarcar reunião" : "Agendar reunião"}</DialogTitle>
          </DialogHeader>

          {rescheduleUrl ? (
            // Remarcação: embed do reschedule_url (não há API de remarcação).
            <div ref={embedRef} style={{ minWidth: "320px", height: "640px" }} />
          ) : loadingTypes ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando tipos de evento…</p>
          ) : !chosen ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Escolha o tipo de reunião:</p>
              {(types ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum tipo de evento ativo na conta Calendly.</p>
              ) : (
                (types ?? []).map((t) => (
                  <button
                    key={t.uri}
                    onClick={() => setChosen(t)}
                    className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    <span className="font-medium text-gray-900">{t.name}</span>
                    {t.duration != null && <span className="text-xs text-gray-500">{t.duration} min</span>}
                  </button>
                ))
              )}
            </div>
          ) : isPro ? (
            // ---------- Pro: agendamento NATIVO ----------
            <div className="space-y-3">
              <button
                onClick={() => {
                  setChosen(null);
                  setSelectedSlot(null);
                }}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" /> trocar tipo de evento
              </button>

              <div className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <span className="font-medium text-gray-900">{chosen.name}</span>
                {chosen.duration != null && <span className="ml-2 text-xs text-gray-500">{chosen.duration} min</span>}
              </div>

              {!selectedSlot ? (
                // Seletor de horário
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Escolha um horário disponível:</p>
                  {loadingSlots && slots.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">Carregando horários…</p>
                  ) : slots.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      Nenhum horário disponível nas próximas semanas.
                    </p>
                  ) : (
                    <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                      {slotGroups.map((g) => (
                        <div key={g.day}>
                          <p className="mb-1 text-xs font-semibold text-gray-500">{g.day}</p>
                          <div className="flex flex-wrap gap-2">
                            {g.items.map((s) => (
                              <button
                                key={s.start_time}
                                onClick={() => setSelectedSlot(s.start_time)}
                                className="rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:border-brand-green hover:bg-brand-green/10"
                              >
                                {timeLabel(s.start_time)}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        disabled={loadingSlots}
                        onClick={() => loadSlots(slotRangeEnd, slotRangeEnd + WINDOW_DAYS * DAY_MS, true)}
                      >
                        {loadingSlots ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ver mais horários"}
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                // Formulário do convidado
                <div className="space-y-3">
                  <button
                    onClick={() => setSelectedSlot(null)}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ChevronLeft className="h-3 w-3" /> trocar horário
                  </button>
                  <div className="rounded-lg bg-brand-green/10 px-3 py-2 text-sm font-medium text-gray-800">
                    {dayLabel(selectedSlot)} às {timeLabel(selectedSlot)}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700">Nome do convidado</label>
                    <input
                      value={fName}
                      onChange={(e) => setFName(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-green focus:outline-none"
                      placeholder="Nome"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700">E-mail do convidado *</label>
                    <input
                      type="email"
                      value={fEmail}
                      onChange={(e) => setFEmail(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-green focus:outline-none"
                      placeholder="email@exemplo.com"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      O Calendly exige um e-mail para criar o agendamento.
                    </p>
                  </div>

                  {needsLocationInput && (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-700">
                        {firstLoc?.kind === "outbound_call" ? "Telefone para a ligação *" : "Local da reunião *"}
                      </label>
                      <input
                        value={fLocation}
                        onChange={(e) => setFLocation(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-green focus:outline-none"
                        placeholder={firstLoc?.kind === "outbound_call" ? "+55 11 99999-9999" : "Endereço ou detalhe"}
                      />
                    </div>
                  )}

                  {(chosen.custom_questions ?? [])
                    .filter((q) => q.enabled)
                    .sort((a, b) => a.position - b.position)
                    .map((q) => (
                      <div key={q.name} className="space-y-1">
                        <label className="text-xs font-medium text-gray-700">
                          {q.name} {q.required && "*"}
                        </label>
                        {q.type === "single_select" && q.answer_choices.length > 0 ? (
                          <select
                            value={answers[q.name] ?? ""}
                            onChange={(e) => setAnswers((p) => ({ ...p, [q.name]: e.target.value }))}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-green focus:outline-none"
                          >
                            <option value="">Selecione…</option>
                            {q.answer_choices.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={answers[q.name] ?? ""}
                            onChange={(e) => setAnswers((p) => ({ ...p, [q.name]: e.target.value }))}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-green focus:outline-none"
                            placeholder={q.type === "phone_number" ? "Telefone" : "Resposta"}
                          />
                        )}
                      </div>
                    ))}

                  <Button className="w-full gap-1" onClick={confirmBooking} disabled={booking}>
                    {booking ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
                    Confirmar agendamento
                  </Button>
                </div>
              )}
            </div>
          ) : (
            // ---------- Light: embed da página do Calendly ----------
            <div>
              <button
                onClick={() => setChosen(null)}
                className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" /> trocar tipo de evento
              </button>
              <div ref={embedRef} style={{ minWidth: "320px", height: "640px" }} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
