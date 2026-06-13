import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, ChevronLeft, ChevronRight, Paperclip, X, Pencil, Ban } from "lucide-react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
  addMonths,
  addWeeks,
  addDays,
  eachDayOfInterval,
  format,
  isSameMonth,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

// ===================================================================
//  TIPOS
// ===================================================================
type ScheduleRow = {
  id: string;
  scheduled_at: string;
  content: string | null;
  status: string;
  error: string | null;
  sent_at: string | null;
  media_type: string | null;
  media_name: string | null;
  contact: { id: string; name: string | null; external_id: string } | null;
  channel: { id: string; name: string } | null;
};

type ContactLite = { id: string; name: string | null; external_id: string };
type ChannelLite = { id: string; name: string };
type QuickReply = { id: string; shortcut: string; title: string | null; content: string };

type ViewMode = "month" | "week" | "day" | "agenda";

// ===================================================================
//  AJUDA DE FUSO HORÁRIO
//  Convertemos o "relógio de parede" (o que a pessoa digita) para um
//  instante absoluto USANDO O FUSO ESCOLHIDO PELO USUÁRIO — e não o do
//  navegador. E exibimos de volta no mesmo fuso.
// ===================================================================
function tzOffsetMs(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) p[part.type] = part.value;
  const asWallUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asWallUTC - date.getTime();
}

// "2026-06-15T14:00" + tz  ->  instante absoluto (Date em UTC)
function wallClockToUtc(wall: string, timeZone: string): Date {
  const [datePart, timePart] = wall.split("T");
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, mi] = (timePart ?? "00:00").split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi, 0);
  const offset = tzOffsetMs(timeZone, new Date(guess));
  return new Date(guess - offset);
}

// instante -> "2026-06-15T14:00" no fuso escolhido (para o input)
function utcToWallClock(date: Date, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) p[part.type] = part.value;
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

// data/hora amigável no fuso escolhido
function fmtInTz(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

// só a hora, no fuso escolhido
function timeInTz(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

// dia (yyyy-mm-dd) no fuso escolhido, para agrupar no calendário
function dayKeyInTz(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

// ===================================================================
//  STATUS
// ===================================================================
const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  sending: "Enviando",
  sent: "Enviado",
  failed: "Falhou",
  cancelled: "Cancelado",
};
const STATUS_CLASS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  sending: "bg-blue-100 text-blue-800 border-blue-200",
  sent: "bg-green-100 text-green-800 border-green-200",
  failed: "bg-red-100 text-red-800 border-red-200",
  cancelled: "bg-gray-100 text-gray-700 border-gray-200",
};

function mediaTypeFromMime(mime: string): "image" | "video" | "audio" | "document" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

function contactLabel(c: { name: string | null; external_id: string } | null): string {
  if (!c) return "—";
  return c.name?.trim() || c.external_id;
}

// ===================================================================
//  COMPONENTE PRINCIPAL
// ===================================================================
export function SchedulesScreen() {
  const { user, activeMembership } = useCurrentUser();
  const orgId = activeMembership?.org_id ?? null;
  const qc = useQueryClient();

  const [view, setView] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState<Date>(new Date());
  const [search, setSearch] = useState("");

  // ---- fuso efetivo do usuário (perfil > empresa > navegador) ----
  const prefsQuery = useQuery({
    queryKey: ["sched-prefs", user?.id, orgId],
    enabled: !!user && !!orgId,
    queryFn: async () => {
      const [{ data: prof }, { data: org }] = await Promise.all([
        supabase.from("profiles").select("timezone").eq("id", user!.id).maybeSingle(),
        supabase.from("organizations").select("timezone").eq("id", orgId!).maybeSingle(),
      ]);
      return {
        tz: prof?.timezone || org?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo",
      };
    },
  });
  const tz = prefsQuery.data?.tz ?? "America/Sao_Paulo";

  // ---- intervalo carregado conforme a visão ----
  const range = useMemo(() => {
    if (view === "month") {
      return {
        start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 }),
        end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 }),
      };
    }
    if (view === "week") {
      return { start: startOfWeek(cursor, { weekStartsOn: 0 }), end: endOfWeek(cursor, { weekStartsOn: 0 }) };
    }
    if (view === "day") {
      return { start: startOfDay(cursor), end: endOfDay(cursor) };
    }
    // agenda: de hoje até +1 ano
    return { start: startOfDay(new Date()), end: addDays(new Date(), 365) };
  }, [view, cursor]);

  // ---- consulta dos agendamentos no intervalo (com folga de 1 dia) ----
  const listQuery = useQuery({
    queryKey: ["schedules", orgId, range.start.toISOString(), range.end.toISOString()],
    enabled: !!orgId,
    queryFn: async (): Promise<ScheduleRow[]> => {
      const from = addDays(range.start, -1).toISOString();
      const to = addDays(range.end, 1).toISOString();
      const { data, error } = await supabase
        .from("scheduled_messages")
        .select(
          "id, scheduled_at, content, status, error, sent_at, media_type, media_name, contact:contacts(id, name, external_id), channel:channels(id, name)",
        )
        .gte("scheduled_at", from)
        .lte("scheduled_at", to)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ScheduleRow[];
    },
  });

  // ---- tempo real: qualquer mudança recarrega ----
  useEffect(() => {
    if (!orgId) return;
    const ch = supabase
      .channel("schedules-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "scheduled_messages" }, () =>
        qc.invalidateQueries({ queryKey: ["schedules"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [orgId, qc]);

  // ---- filtro de busca (cliente) ----
  const items = useMemo(() => {
    const all = listQuery.data ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return all;
    return all.filter(
      (s) => contactLabel(s.contact).toLowerCase().includes(term) || (s.content ?? "").toLowerCase().includes(term),
    );
  }, [listQuery.data, search]);

  // agrupado por dia (yyyy-mm-dd no fuso) para grade e listas
  const byDay = useMemo(() => {
    const map: Record<string, ScheduleRow[]> = {};
    for (const s of items) {
      const k = dayKeyInTz(s.scheduled_at, tz);
      (map[k] ??= []).push(s);
    }
    return map;
  }, [items, tz]);

  // ===================================================================
  //  DIÁLOGO DE CRIAR / EDITAR
  // ===================================================================
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fContactId, setFContactId] = useState<string>("");
  const [fContactLabel, setFContactLabel] = useState<string>("");
  const [fChannelId, setFChannelId] = useState<string>("");
  const [fWhen, setFWhen] = useState<string>("");
  const [fText, setFText] = useState<string>("");
  const [fFile, setFFile] = useState<File | null>(null);
  const [fExistingMedia, setFExistingMedia] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  // canais (whatsapp) para o seletor de conexão
  const channelsQuery = useQuery({
    queryKey: ["sched-channels", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<ChannelLite[]> => {
      const { data } = await supabase
        .from("channels")
        .select("id, name")
        .eq("type", "whatsapp_baileys")
        .order("created_at", { ascending: true });
      return (data ?? []) as ChannelLite[];
    },
  });
  const channels = channelsQuery.data ?? [];

  // respostas rápidas
  const qrQuery = useQuery({
    queryKey: ["sched-qr", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<QuickReply[]> => {
      const { data } = await supabase
        .from("quick_replies")
        .select("id, shortcut, title, content")
        .eq("active", true)
        .order("shortcut");
      return (data ?? []) as QuickReply[];
    },
  });
  const quickReplies = qrQuery.data ?? [];

  // busca de contato (typeahead no servidor)
  const [contactSearch, setContactSearch] = useState("");
  const [contactResults, setContactResults] = useState<ContactLite[]>([]);
  const [contactPopOpen, setContactPopOpen] = useState(false);
  useEffect(() => {
    if (!orgId) return;
    let active = true;
    const t = setTimeout(async () => {
      let q = supabase
        .from("contacts")
        .select("id, name, external_id")
        .eq("is_group", false)
        .order("name", { ascending: true })
        .limit(20);
      const term = contactSearch.trim();
      if (term) q = q.or(`name.ilike.%${term}%,external_id.ilike.%${term}%`);
      const { data } = await q;
      if (active) setContactResults((data ?? []) as ContactLite[]);
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [contactSearch, orgId]);

  function resetForm() {
    setEditingId(null);
    setFContactId("");
    setFContactLabel("");
    setFChannelId(channels[0]?.id ?? "");
    setFWhen(utcToWallClock(new Date(Date.now() + 60 * 60 * 1000), tz)); // padrão: daqui a 1h
    setFText("");
    setFFile(null);
    setFExistingMedia(null);
    setFormError(null);
  }

  function openNew(prefillDay?: Date, prefillContact?: ContactLite) {
    resetForm();
    if (prefillDay) {
      // mantém a hora padrão, troca o dia
      const base = new Date(Date.now() + 60 * 60 * 1000);
      const wall = utcToWallClock(base, tz).split("T")[1];
      setFWhen(`${format(prefillDay, "yyyy-MM-dd")}T${wall}`);
    }
    if (prefillContact) {
      setFContactId(prefillContact.id);
      setFContactLabel(contactLabel(prefillContact));
    }
    setDialogOpen(true);
  }

  function openEdit(s: ScheduleRow) {
    setEditingId(s.id);
    setFContactId(s.contact?.id ?? "");
    setFContactLabel(contactLabel(s.contact));
    setFChannelId(s.channel?.id ?? channels[0]?.id ?? "");
    setFWhen(utcToWallClock(new Date(s.scheduled_at), tz));
    setFText(s.content ?? "");
    setFFile(null);
    setFExistingMedia(s.media_name ?? null);
    setFormError(null);
    setDialogOpen(true);
  }

  // inserir variável/resposta no texto (na posição do cursor)
  function insertAtCursor(snippet: string) {
    const el = textRef.current;
    if (!el) {
      setFText((t) => t + snippet);
      return;
    }
    const start = el.selectionStart ?? fText.length;
    const end = el.selectionEnd ?? fText.length;
    const next = fText.slice(0, start) + snippet + fText.slice(end);
    setFText(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + snippet.length;
      el.setSelectionRange(pos, pos);
    });
  }

  async function handleSave() {
    setFormError(null);
    if (!orgId || !user) return;
    if (!fContactId) return setFormError("Escolha o contato.");
    if (!fChannelId) return setFormError("Escolha a conexão (canal).");
    if (!fWhen) return setFormError("Escolha a data e a hora.");
    const hasText = fText.trim().length > 0;
    const hasMedia = !!fFile || !!fExistingMedia;
    if (!hasText && !hasMedia) return setFormError("Escreva uma mensagem ou anexe um arquivo.");

    const scheduledAt = wallClockToUtc(fWhen, tz);
    if (!editingId && scheduledAt.getTime() < Date.now() - 60 * 1000) {
      return setFormError("A data/hora já passou. Escolha um horário futuro.");
    }

    setSaving(true);
    try {
      // upload do anexo novo (se houver)
      let mediaPatch: Record<string, unknown> = {};
      if (fFile) {
        const mime = fFile.type || "application/octet-stream";
        const ext = fFile.name.includes(".") ? fFile.name.split(".").pop() : "bin";
        const path = `${orgId}/scheduled/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from("media").upload(path, fFile, { contentType: mime, upsert: false });
        if (up.error) throw up.error;
        mediaPatch = {
          media_path: path,
          media_type: mediaTypeFromMime(mime),
          media_mime: mime,
          media_name: fFile.name,
        };
      } else if (!fExistingMedia && editingId) {
        // editou e removeu o anexo
        mediaPatch = { media_path: null, media_type: null, media_mime: null, media_name: null };
      }

      if (editingId) {
        const { error } = await supabase
          .from("scheduled_messages")
          .update({
            contact_id: fContactId,
            channel_id: fChannelId,
            scheduled_at: scheduledAt.toISOString(),
            content: hasText ? fText : null,
            status: "pending",
            error: null,
            ...mediaPatch,
          })
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("scheduled_messages").insert({
          org_id: orgId,
          contact_id: fContactId,
          channel_id: fChannelId,
          scheduled_at: scheduledAt.toISOString(),
          content: hasText ? fText : null,
          created_by: user.id,
          status: "pending",
          ...mediaPatch,
        });
        if (error) throw error;
      }

      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["schedules"] });
    } catch (e) {
      setFormError("Não foi possível salvar. " + String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel(s: ScheduleRow) {
    if (!window.confirm("Cancelar este agendamento? Ele não será enviado.")) return;
    await supabase.from("scheduled_messages").update({ status: "cancelled" }).eq("id", s.id);
    qc.invalidateQueries({ queryKey: ["schedules"] });
  }

  // abre o popup já com o contato, quando vier da conversa (Passo 4)
  useEffect(() => {
    if (!orgId) return;
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem("scheduleForContact");
    } catch {
      raw = null;
    }
    if (!raw) return;
    try {
      sessionStorage.removeItem("scheduleForContact");
    } catch {
      /* ignore */
    }
    try {
      const c = JSON.parse(raw) as ContactLite;
      if (c?.id) openNew(undefined, c);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, channels.length, tz]);

  // ===================================================================
  //  NAVEGAÇÃO
  // ===================================================================
  function go(delta: number) {
    if (view === "month") setCursor((c) => addMonths(c, delta));
    else if (view === "week") setCursor((c) => addWeeks(c, delta));
    else if (view === "day") setCursor((c) => addDays(c, delta));
  }
  const periodLabel = useMemo(() => {
    if (view === "month") return format(cursor, "MMMM yyyy", { locale: ptBR });
    if (view === "week") {
      const s = startOfWeek(cursor, { weekStartsOn: 0 });
      const e = endOfWeek(cursor, { weekStartsOn: 0 });
      return `${format(s, "dd/MM")} – ${format(e, "dd/MM/yyyy")}`;
    }
    if (view === "day") return format(cursor, "EEEE, dd 'de' MMMM", { locale: ptBR });
    return "Próximos agendamentos";
  }, [view, cursor]);

  const weekdayNames = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

  // ===================================================================
  //  RENDER
  // ===================================================================
  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-50 p-4 md:p-6">
      {/* Cabeçalho (padrão) */}
      <PageHeader
        title="Agendamentos"
        subtitle="Agende o envio de mensagens."
        actions={
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar..."
                className="w-48 pl-8"
              />
            </div>
            <Button onClick={() => openNew()} size="sm">
              <Plus className="mr-1 h-4 w-4" /> Novo Agendamento
            </Button>
          </>
        }
      />

      {/* Barra de navegação e visões */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>
            Hoje
          </Button>
          {view !== "agenda" && (
            <>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => go(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => go(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
          <span className="ml-1 text-sm font-medium capitalize text-foreground">{periodLabel}</span>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          {(["month", "week", "day", "agenda"] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {v === "month" ? "Mês" : v === "week" ? "Semana" : v === "day" ? "Dia" : "Agenda"}
            </button>
          ))}
        </div>
      </div>

      {/* Conteúdo */}
      <div className="mt-4 flex-1 overflow-auto">
        {listQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : view === "month" ? (
          <MonthGrid
            cursor={cursor}
            byDay={byDay}
            tz={tz}
            weekdayNames={weekdayNames}
            onDayClick={(d) => openNew(d)}
            onItemClick={openEdit}
          />
        ) : (
          <GroupedList
            items={items}
            view={view}
            cursor={cursor}
            tz={tz}
            onItemClick={openEdit}
            onCancel={handleCancel}
          />
        )}
      </div>

      {/* DIÁLOGO */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar agendamento" : "Novo agendamento"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Contato + Data */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Contato</Label>
                <Popover open={contactPopOpen} onOpenChange={setContactPopOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between font-normal">
                      <span className="truncate">{fContactLabel || "Selecione o contato"}</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Buscar contato..."
                        value={contactSearch}
                        onValueChange={setContactSearch}
                      />
                      <CommandList>
                        <CommandEmpty>Nenhum contato.</CommandEmpty>
                        <CommandGroup>
                          {contactResults.map((c) => (
                            <CommandItem
                              key={c.id}
                              value={c.id}
                              onSelect={() => {
                                setFContactId(c.id);
                                setFContactLabel(contactLabel(c));
                                setContactPopOpen(false);
                              }}
                            >
                              {contactLabel(c)}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sched-when">Data e hora do envio</Label>
                <Input id="sched-when" type="datetime-local" value={fWhen} onChange={(e) => setFWhen(e.target.value)} />
                <p className="text-[11px] text-muted-foreground">Fuso: {tz}</p>
              </div>
            </div>

            {/* Mensagem */}
            <div className="space-y-2">
              <Label htmlFor="sched-text">Mensagem</Label>
              <Textarea
                id="sched-text"
                ref={textRef}
                value={fText}
                onChange={(e) => setFText(e.target.value)}
                placeholder="Escreva a mensagem..."
                className="min-h-28"
              />
              {/* Variáveis */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">Variáveis:</span>
                <Badge
                  variant="secondary"
                  className="cursor-pointer"
                  onClick={() => insertAtCursor("{{primeiro_nome}}")}
                >
                  Primeiro Nome
                </Badge>
                <Badge variant="secondary" className="cursor-pointer" onClick={() => insertAtCursor("{{nome}}")}>
                  Nome
                </Badge>
              </div>
              {/* Respostas rápidas */}
              {quickReplies.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">Resposta rápida:</span>
                  <Select
                    value=""
                    onValueChange={(id) => {
                      const q = quickReplies.find((x) => x.id === id);
                      if (q) insertAtCursor(q.content);
                    }}
                  >
                    <SelectTrigger className="h-8 w-56">
                      <SelectValue placeholder="Inserir resposta..." />
                    </SelectTrigger>
                    <SelectContent>
                      {quickReplies.map((q) => (
                        <SelectItem key={q.id} value={q.id}>
                          /{q.shortcut} {q.title ? `— ${q.title}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Conexão + Anexo */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Conexão</Label>
                <Select value={fChannelId} onValueChange={setFChannelId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o canal" />
                  </SelectTrigger>
                  <SelectContent>
                    {channels.map((ch) => (
                      <SelectItem key={ch.id} value={ch.id}>
                        {ch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Anexo (opcional)</Label>
                {fFile || fExistingMedia ? (
                  <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                    <span className="truncate">{fFile?.name ?? fExistingMedia}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setFFile(null);
                        setFExistingMedia(null);
                      }}
                      className="ml-2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
                    <Paperclip className="h-4 w-4" />
                    Anexar arquivo
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*,video/*,audio/*,application/pdf"
                      onChange={(e) => setFFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                )}
              </div>
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : editingId ? "Salvar" : "Agendar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===================================================================
//  GRADE DO MÊS
// ===================================================================
function MonthGrid({
  cursor,
  byDay,
  tz,
  weekdayNames,
  onDayClick,
  onItemClick,
}: {
  cursor: Date;
  byDay: Record<string, ScheduleRow[]>;
  tz: string;
  weekdayNames: string[];
  onDayClick: (d: Date) => void;
  onItemClick: (s: ScheduleRow) => void;
}) {
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 }),
  });
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="grid grid-cols-7 border-b border-border bg-muted/40">
        {weekdayNames.map((w) => (
          <div key={w} className="px-2 py-1.5 text-center text-[11px] font-medium capitalize text-muted-foreground">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          const dayItems = byDay[key] ?? [];
          const inMonth = isSameMonth(d, cursor);
          return (
            <div
              key={key}
              onClick={() => onDayClick(d)}
              className={`min-h-24 cursor-pointer border-b border-r border-border p-1.5 transition-colors hover:bg-muted/40 ${
                inMonth ? "" : "bg-muted/20 text-muted-foreground"
              }`}
            >
              <div className="mb-1 text-right text-xs">{format(d, "d")}</div>
              <div className="space-y-1">
                {dayItems.slice(0, 3).map((s) => (
                  <button
                    key={s.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onItemClick(s);
                    }}
                    className={`block w-full truncate rounded px-1 py-0.5 text-left text-[11px] ${STATUS_CLASS[s.status] ?? ""}`}
                    title={`${timeInTz(s.scheduled_at, tz)} — ${contactLabel(s.contact)}`}
                  >
                    {timeInTz(s.scheduled_at, tz)} {contactLabel(s.contact)}
                  </button>
                ))}
                {dayItems.length > 3 && (
                  <div className="text-[10px] text-muted-foreground">+{dayItems.length - 3} mais</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===================================================================
//  LISTA AGRUPADA (semana / dia / agenda)
// ===================================================================
function GroupedList({
  items,
  view,
  cursor,
  tz,
  onItemClick,
  onCancel,
}: {
  items: ScheduleRow[];
  view: ViewMode;
  cursor: Date;
  tz: string;
  onItemClick: (s: ScheduleRow) => void;
  onCancel: (s: ScheduleRow) => void;
}) {
  // limita ao período da visão
  const filtered = useMemo(() => {
    if (view === "day") {
      const k = format(cursor, "yyyy-MM-dd");
      return items.filter((s) => dayKeyInTz(s.scheduled_at, tz) === k);
    }
    if (view === "week") {
      const s0 = startOfWeek(cursor, { weekStartsOn: 0 });
      const e0 = endOfWeek(cursor, { weekStartsOn: 0 });
      return items.filter((s) => {
        const t = new Date(s.scheduled_at).getTime();
        return t >= s0.getTime() && t <= e0.getTime();
      });
    }
    return items; // agenda
  }, [items, view, cursor, tz]);

  const groups = useMemo(() => {
    const map: Record<string, ScheduleRow[]> = {};
    for (const s of filtered) {
      const k = dayKeyInTz(s.scheduled_at, tz);
      (map[k] ??= []).push(s);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered, tz]);

  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum agendamento neste período.</p>;
  }

  return (
    <div className="space-y-5">
      {groups.map(([day, rows]) => (
        <div key={day}>
          <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            {format(new Date(day + "T12:00:00"), "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </h3>
          <div className="space-y-2">
            {rows.map((s) => (
              <div key={s.id} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
                <div className="w-12 shrink-0 text-sm font-medium text-foreground">{timeInTz(s.scheduled_at, tz)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{contactLabel(s.contact)}</span>
                    <Badge variant="outline" className={`h-5 ${STATUS_CLASS[s.status] ?? ""}`}>
                      {STATUS_LABEL[s.status] ?? s.status}
                    </Badge>
                    {s.channel && <span className="text-[11px] text-muted-foreground">{s.channel.name}</span>}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {s.media_name ? `📎 ${s.media_name} ` : ""}
                    {s.content ?? ""}
                  </p>
                  {s.status === "failed" && s.error && (
                    <p className="mt-0.5 text-[11px] text-destructive">Erro: {s.error}</p>
                  )}
                </div>
                {(s.status === "pending" || s.status === "failed") && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onItemClick(s)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onCancel(s)}>
                      <Ban className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
