import { useState, useRef, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useConversations } from "@/hooks/use-conversations";
import { useMessages } from "@/hooks/use-messages";
import { Logo } from "@/components/logo";
import { Paperclip } from "lucide-react";

function initials(name: string | null) {
  if (!name) return "?";
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}
function formatPhone(id?: string | null) {
  if (!id) return null;
  return "+" + String(id).replace(/\D/g, "");
}
function displayName(contact: { name: string | null; external_id?: string } | null) {
  if (contact?.name && contact.name.trim()) return contact.name;
  return formatPhone(contact?.external_id) ?? "Sem nome";
}
function timeAgo(iso: string | null) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return `há ${Math.floor(s / 86400)} d`;
}
function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function contentLabel(type: string, content: string | null) {
  if (content && content.trim()) return content;
  const map: Record<string, string> = {
    audio: "Áudio",
    image: "Imagem",
    video: "Vídeo",
    document: "Documento",
    location: "Localização",
    sticker: "Figurinha",
  };
  return map[type] ?? "Mensagem";
}
const statusLabel: Record<string, string> = {
  open: "Aberto",
  pending: "Aguardando",
  closed: "Fechado",
};
const statusClass: Record<string, string> = {
  open: "bg-brand-green/15 text-brand-green-foreground",
  pending: "bg-amber-100 text-amber-800",
  closed: "bg-gray-100 text-gray-600",
};

function ContactAvatar({ path, initials, className = "h-10 w-10" }: { path?: string | null; initials: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) { setUrl(null); return; }
    let active = true;
    supabase.storage.from("media").createSignedUrl(path, 3600).then(({ data }) => { if (active) setUrl(data?.signedUrl ?? null); });
    return () => { active = false; };
  }, [path]);
  if (url) return <img src={url} alt="" className={`${className} rounded-full object-cover`} />;
  return <div className={`${className} flex items-center justify-center rounded-full bg-gray-200 text-gray-600 text-sm font-medium`}>{initials}</div>;
}

function formatSize(bytes?: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MessageMedia({ path, contentType, name, size }: { path: string; contentType: string; name?: string | null; size?: number | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    supabase.storage.from("media").createSignedUrl(path, 3600).then(({ data }) => {
      if (active) setUrl(data?.signedUrl ?? null);
    });
    return () => { active = false; };
  }, [path]);
  if (!url) return <span className="text-xs opacity-60">Carregando mídia…</span>;
  if (contentType === "image" || contentType === "sticker")
    return <img src={url} alt="" className="max-w-[240px] rounded-lg" />;
  if (contentType === "audio")
    return <audio controls src={url} className="max-w-[260px]" />;
  if (contentType === "video")
    return <video controls src={url} className="max-w-[240px] rounded-lg" />;
  return (() => {
    const ext = (name?.split(".").pop() || "FILE").toUpperCase();
    return (
      <a href={url} target="_blank" rel="noreferrer"
         className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 max-w-[280px] no-underline hover:bg-gray-50">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-red-50 text-red-600 text-[10px] font-bold">{ext}</div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-gray-800">{name || "Documento"}</div>
          <div className="text-xs text-gray-500">{size ? formatSize(size) + " · " : ""}Clique para baixar</div>
        </div>
      </a>
    );
  })();
}

export function InboxScreen() {
  const { data: conversations, isLoading } = useConversations();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => (conversations ?? []).find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );
  const { data: messages, isLoading: loadingMsgs } = useMessages(selectedId);

  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, selectedId]);

  useEffect(() => {
    const channel = supabase
      .channel("inbox-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const convId = (payload.new as { conversation_id?: string })?.conversation_id;
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        if (convId) queryClient.invalidateQueries({ queryKey: ["messages", convId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  useEffect(() => {
    if (!selectedId) return;
    supabase.from("conversations").update({ unread_count: 0 }).eq("id", selectedId).then(() => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    });
  }, [selectedId, queryClient]);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    if (!draft.trim() || !selectedId || sending) return;
    setSending(true);
    setError(null);
    const text = draft.trim();
    const { data, error: invokeErr } = await supabase.functions.invoke("send-message", {
      body: { conversationId: selectedId, text },
    });
    setSending(false);
    if (invokeErr || (data as any)?.error) {
      setError("Não foi possível enviar. Tente novamente.");
      return;
    }
    setDraft("");
    queryClient.invalidateQueries({ queryKey: ["messages", selectedId] });
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
  }

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sendingMedia, setSendingMedia] = useState(false);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selectedId) return;
    if (file.size > 5 * 1024 * 1024) { alert("Por enquanto, envie arquivos de até 5 MB."); return; }
    setSendingMedia(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { error } = await supabase.functions.invoke("send-media", {
        body: { conversationId: selectedId, base64, mimetype: file.type || "application/octet-stream", fileName: file.name, caption: "" },
      });
      if (error) alert("Não foi possível enviar o arquivo.");
    } finally { setSendingMedia(false); }
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* Lista de conversas */}
      <aside className="flex w-[320px] shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Conversas</h2>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading && (
            <ul>
              {[...Array(6)].map((_, i) => (
                <li key={i} className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
                  <div className="h-10 w-10 animate-pulse rounded-full bg-gray-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-2/3 animate-pulse rounded bg-gray-200" />
                    <div className="h-3 w-1/3 animate-pulse rounded bg-gray-200" />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {!isLoading && (conversations ?? []).length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-gray-500">Nenhuma conversa ainda</p>
          )}
          {!isLoading &&
            (conversations ?? []).map((c) => {
              const name = displayName(c.contact);
              const active = c.id === selectedId;
              const unread = (c.unread_count ?? 0) > 0;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`flex w-full items-start gap-3 border-b border-gray-100 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${active ? "bg-blue-50" : ""}`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-700">
                    {c.contact?.name ? initials(c.contact.name) : "#"}
                  </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`truncate text-sm ${unread ? "font-bold" : "font-medium"} text-gray-900`}>{name}</span>
                        <span className="shrink-0 text-[11px] text-gray-500">
                          {timeAgo(c.last_message_at)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusClass[c.status] ?? "bg-gray-100 text-gray-600"}`}
                          >
                            {statusLabel[c.status] ?? c.status}
                          </span>
                          <span className="truncate text-[11px] text-gray-500">
                            {c.channel?.name ?? ""}
                          </span>
                        </div>
                        {unread && (
                          <span className="rounded-full bg-brand-green px-2 text-xs font-semibold text-white">
                            {c.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                </button>
              );
            })}
        </div>
      </aside>

      {/* Painel da conversa */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-gray-50">
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <Logo variant="horizontal" className="h-14 w-auto opacity-40" />
            <p className="text-sm text-gray-400">Selecione uma conversa</p>
          </div>
        ) : (
          <>
            <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-700">
                  {selected.contact?.name ? initials(selected.contact.name) : "#"}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {displayName(selected.contact)}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {selected.channel?.name ?? ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    if (!selectedId) return;
                    await supabase.from("conversations").update({ unread_count: 1 }).eq("id", selectedId);
                    setSelectedId(null);
                    queryClient.invalidateQueries({ queryKey: ["conversations"] });
                  }}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Marcar como não lida
                </button>
                <button className="rounded-lg bg-brand-green px-3 py-1.5 text-sm font-medium text-brand-green-foreground transition-colors hover:bg-brand-green/90">
                  Atender
                </button>
              </div>
            </header>

            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {loadingMsgs && <p className="text-center text-sm text-gray-500">Carregando…</p>}
              {!loadingMsgs &&
                (messages ?? []).map((m) => {
                  const out = m.direction === "outbound";
                  return (
                    <div
                      key={m.id}
                      className={`mb-2 flex ${out ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm ${out ? "bg-primary text-primary-foreground" : "border border-gray-200 bg-white text-gray-900"}`}
                      >
                        {m.media_url && ["image", "audio", "video", "document", "sticker"].includes(m.content_type) ? (
                          <>
                            <MessageMedia path={m.media_url} contentType={m.content_type} name={m.media_name} size={m.media_size} />
                            {m.content && (
                              <p className="mt-1 whitespace-pre-wrap break-words">{m.content}</p>
                            )}
                          </>
                        ) : (
                          <p className="whitespace-pre-wrap break-words">
                            {contentLabel(m.content_type, m.content)}
                          </p>
                        )}
                        <p
                          className={`mt-1 text-[10px] ${out ? "text-primary-foreground/70" : "text-gray-500"}`}
                        >
                          {hhmm(m.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="border-t border-gray-200 bg-white px-4 py-3">
              {error && (
                <p className="mb-2 text-xs text-red-600">
                  {error}
                </p>
              )}
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sendingMedia}
                  className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  <Paperclip size={18} />
                </button>
                <input ref={fileInputRef} type="file" accept="image/*,video/*,application/pdf" className="hidden" onChange={handleFileSelected} />
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  rows={1}
                  placeholder="Escreva uma mensagem…"
                  className="max-h-32 min-h-[40px] flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <button
                  onClick={handleSend}
                  disabled={!draft.trim() || sending}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {sending ? "Enviando…" : "Enviar"}
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
