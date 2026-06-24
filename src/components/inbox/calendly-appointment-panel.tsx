/* eslint-disable @typescript-eslint/no-explicit-any */
// =====================================================================
//  Painel "Agendamento (Calendly)" no painel de dados do contato (C3).
//  - Mostra os agendamentos da conversa (card com data/hora, link,
//    Cancelar via API e Remarcar abrindo o link do Calendly).
//  - Botão "Agendar" abre um diálogo com o embed do Calendly (modo Light,
//    vale para todos). Ao concluir, captura o evento (capture_booking) e
//    grava em appointments. Atualiza sozinho via Realtime.
//  Tabelas calendly_connections/appointments via (supabase as any) (CLAUDE.md §8).
// =====================================================================
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarClock, CalendarPlus, ExternalLink, Loader2, X, CalendarX } from "lucide-react";
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

type EventType = { uri: string; name: string; duration: number | null; scheduling_url: string };

const sb = supabase as any;

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
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [open, setOpen] = useState(false);
  const [types, setTypes] = useState<EventType[] | null>(null);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [chosen, setChosen] = useState<EventType | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const embedRef = useRef<HTMLDivElement | null>(null);

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
      .select("status")
      .eq("org_id", orgId)
      .maybeSingle();
    setConnected(!!data && data.status === "active");
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

  // Captura o agendamento concluído no embed do Calendly.
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
        body: { action: "capture_booking", orgId, conversationId, contactId, eventUri, inviteeUri },
      });
      if (error || !data?.ok) {
        toast.error("Agendou no Calendly, mas falhou ao registrar aqui.", { description: data?.error ?? error?.message });
        return;
      }
      toast.success("Agendamento registrado!");
      setOpen(false);
      setChosen(null);
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

  // Monta o embed quando um tipo de evento é escolhido.
  useEffect(() => {
    if (!open || !chosen || !embedRef.current) return;
    let cancelled = false;
    const params = new URLSearchParams();
    if (contactName) params.set("name", contactName);
    if (contactEmail) params.set("email", contactEmail);
    const sep = chosen.scheduling_url.includes("?") ? "&" : "?";
    const url = params.toString() ? `${chosen.scheduling_url}${sep}${params.toString()}` : chosen.scheduling_url;
    loadCalendlyScript().then(() => {
      if (cancelled || !embedRef.current) return;
      embedRef.current.innerHTML = "";
      (window as any).Calendly?.initInlineWidget({ url, parentElement: embedRef.current });
    });
    return () => {
      cancelled = true;
    };
  }, [open, chosen, contactName, contactEmail]);

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
                  <a
                    href={a.reschedule_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    <CalendarClock className="h-3 w-3" /> Remarcar
                  </a>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Agendar reunião</DialogTitle>
          </DialogHeader>

          {loadingTypes ? (
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
          ) : (
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
