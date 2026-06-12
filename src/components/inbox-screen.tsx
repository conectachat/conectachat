import { useState, useRef, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useConversations } from "@/hooks/use-conversations";
import { useMessages, type Message } from "@/hooks/use-messages";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Logo } from "@/components/logo";
import { ContactTagsSection } from "@/components/contact-tags";
import {
  Paperclip,
  Mic,
  Square,
  X,
  Pencil,
  Copy,
  Smile,
  Eye,
  CalendarClock,
  ChevronDown,
  Plus,
  Reply,
  Trash2,
  Forward,
} from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";

type QuickReply = { id: string; shortcut: string; title: string | null; content: string };

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

function ContactAvatar({
  path,
  initials,
  className = "h-10 w-10",
}: {
  path?: string | null;
  initials: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    let active = true;
    supabase.storage
      .from("media")
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (active) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      active = false;
    };
  }, [path]);
  if (url) return <img src={url} alt="" className={`${className} rounded-full object-cover`} />;
  return (
    <div
      className={`${className} flex items-center justify-center rounded-full bg-gray-200 text-gray-600 text-sm font-medium`}
    >
      {initials}
    </div>
  );
}

function formatSize(bytes?: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MessageMedia({
  path,
  contentType,
  name,
  size,
}: {
  path: string;
  contentType: string;
  name?: string | null;
  size?: number | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    supabase.storage
      .from("media")
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (active) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      active = false;
    };
  }, [path]);
  if (!url) return <span className="text-xs opacity-60">Carregando mídia…</span>;
  if (contentType === "image" || contentType === "sticker")
    return <img src={url} alt="" className="max-w-[240px] rounded-lg" />;
  if (contentType === "audio") return <audio controls src={url} className="max-w-[260px]" />;
  if (contentType === "video") return <video controls src={url} className="max-w-[240px] rounded-lg" />;
  return (() => {
    const ext = (name?.split(".").pop() || "FILE").toUpperCase();
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 max-w-[280px] no-underline hover:bg-gray-50"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-red-50 text-red-600 text-[10px] font-bold">
          {ext}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-gray-800">{name || "Documento"}</div>
          <div className="text-xs text-gray-500">{size ? formatSize(size) + " · " : ""}Clique para baixar</div>
        </div>
      </a>
    );
  })();
}

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

// Menu do balão (estilo WhatsApp): setinha que abre a barra de emojis + Copiar.
// (Responder / Apagar / Encaminhar entram nos próximos passos do Bloco F.)
function MessageActions({
  mine,
  canReact,
  canCopy,
  canReply,
  canForward,
  canDelete,
  onReact,
  onCopy,
  onReply,
  onForward,
  onDelete,
}: {
  mine: string | null;
  canReact: boolean;
  canCopy: boolean;
  canReply: boolean;
  canForward: boolean;
  canDelete: boolean;
  onReact: (emoji: string) => void;
  onCopy: () => void;
  onReply: () => void;
  onForward: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setFull(false);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Mais"
          className="shrink-0 rounded-full p-1 text-gray-400 opacity-0 transition-opacity hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100 data-[state=open]:opacity-100"
        >
          <ChevronDown size={16} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-auto p-2">
        {full ? (
          <EmojiPicker
            onEmojiClick={(d: EmojiClickData) => {
              onReact(d.emoji);
              setOpen(false);
            }}
            height={350}
            width={300}
            lazyLoadEmojis
            previewConfig={{ showPreview: false }}
          />
        ) : (
          <>
            <div className="flex items-center gap-1">
              {QUICK_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  disabled={!canReact}
                  onClick={() => {
                    onReact(mine === e ? "" : e);
                    setOpen(false);
                  }}
                  className={`rounded-full p-1 text-lg transition-colors hover:bg-gray-100 disabled:opacity-30 ${mine === e ? "bg-gray-100" : ""}`}
                >
                  {e}
                </button>
              ))}
              <button
                type="button"
                disabled={!canReact}
                onClick={() => setFull(true)}
                title="Mais emojis"
                className="rounded-full p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="mt-1 border-t border-gray-100 pt-1">
              <button
                type="button"
                disabled={!canReply}
                onClick={() => {
                  onReply();
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-40"
              >
                <Reply size={14} /> Responder
              </button>
              <button
                type="button"
                disabled={!canCopy}
                onClick={() => {
                  onCopy();
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-40"
              >
                <Copy size={14} /> Copiar
              </button>
              {canForward && (
                <button
                  type="button"
                  onClick={() => {
                    onForward();
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                >
                  <Forward size={14} /> Encaminhar
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={() => {
                    onDelete();
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={14} /> Apagar
                </button>
              )}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function InboxScreen() {
  const { data: conversations, isLoading } = useConversations();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const previewRef = useRef(false);
  useEffect(() => {
    try {
      const pending = sessionStorage.getItem("openConvId");
      if (pending) {
        sessionStorage.removeItem("openConvId");
        setSelectedId(pending);
      }
    } catch {
      /* ignore */
    }
  }, []);
  const selected = useMemo(
    () => (conversations ?? []).find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );
  const { data: messages, isLoading: loadingMsgs } = useMessages(selectedId);

  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { activeMembership } = useCurrentUser();
  const orgId = activeMembership?.org_id ?? null;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, selectedId]);

  useEffect(() => {
    const channel = supabase
      .channel("inbox-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => {
        const convId = (payload.new as { conversation_id?: string })?.conversation_id;
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        if (convId) queryClient.invalidateQueries({ queryKey: ["messages", convId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  useEffect(() => {
    if (!selectedId) return;
    if (previewRef.current) {
      previewRef.current = false;
      return;
    } // aberta em modo "ver sem marcar como lida"
    supabase
      .from("conversations")
      .update({ unread_count: 0 })
      .eq("id", selectedId)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      });
  }, [selectedId, queryClient]);

  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; preview: string; sender: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    if (!draft.trim() || !selectedId || sending) return;
    setSending(true);
    setError(null);
    const text = draft.trim();
    const { data, error: invokeErr } = await supabase.functions.invoke("send-message", {
      body: {
        conversationId: selectedId,
        text,
        replyTo: replyTo ? { externalId: replyTo.id, preview: replyTo.preview } : undefined,
      },
    });
    setSending(false);
    if (invokeErr || (data as any)?.error) {
      setError("Não foi possível enviar. Tente novamente.");
      return;
    }
    setDraft("");
    setReplyTo(null);
    queryClient.invalidateQueries({ queryKey: ["messages", selectedId] });
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
  }

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sendingMedia, setSendingMedia] = useState(false);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selectedId) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("Por enquanto, envie arquivos de até 5 MB.");
      return;
    }
    setSendingMedia(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { error } = await supabase.functions.invoke("send-media", {
        body: {
          conversationId: selectedId,
          base64,
          mimetype: file.type || "application/octet-stream",
          fileName: file.name,
          caption: "",
          replyTo: replyTo ? { externalId: replyTo.id, preview: replyTo.preview } : undefined,
        },
      });
      if (error) alert("Não foi possível enviar o arquivo.");
      else setReplyTo(null);
    } finally {
      setSendingMedia(false);
    }
  }

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const cancelRef = useRef(false);
  const [recording, setRecording] = useState(false);
  const [sendingAudio, setSendingAudio] = useState(false);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      cancelRef.current = false;
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (cancelRef.current || !selectedId) return;
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setSendingAudio(true);
        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          const { error } = await supabase.functions.invoke("send-audio", {
            body: {
              conversationId: selectedId,
              base64,
              replyTo: replyTo ? { externalId: replyTo.id, preview: replyTo.preview } : undefined,
            },
          });
          if (error) alert("Não foi possível enviar o áudio.");
          else setReplyTo(null);
        } finally {
          setSendingAudio(false);
        }
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
    } catch {
      alert("Não consegui acessar o microfone. Verifique a permissão do navegador.");
    }
  }
  function stopAndSend() {
    cancelRef.current = false;
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }
  function cancelRecording() {
    cancelRef.current = true;
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  const [showContactPanel, setShowContactPanel] = useState(false);
  const [editingContact, setEditingContact] = useState(false);
  const [cName, setCName] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cBirth, setCBirth] = useState("");
  const [savingContact, setSavingContact] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [openEmoji, setOpenEmoji] = useState(false);
  const [pendingCursor, setPendingCursor] = useState<number | null>(null);

  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [qrIndex, setQrIndex] = useState(0);

  useEffect(() => {
    if (pendingCursor !== null && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(pendingCursor, pendingCursor);
      setPendingCursor(null);
    }
  }, [pendingCursor]);

  const contact = selected?.contact ?? null;

  // Respostas rápidas (menu do "/")
  useEffect(() => {
    if (!orgId) {
      setQuickReplies([]);
      return;
    }
    let active = true;
    supabase
      .from("quick_replies")
      .select("id, shortcut, title, content")
      .eq("active", true)
      .order("shortcut")
      .then(({ data }) => {
        if (active) setQuickReplies(data ?? []);
      });
    return () => {
      active = false;
    };
  }, [orgId]);

  const qrQuery = draft.startsWith("/") ? draft.slice(1).toLowerCase() : "";
  const filteredQr = useMemo(
    () =>
      !draft.startsWith("/")
        ? []
        : quickReplies.filter(
            (q) => q.shortcut.toLowerCase().includes(qrQuery) || (q.title ?? "").toLowerCase().includes(qrQuery),
          ),
    [quickReplies, qrQuery, draft],
  );
  const qrMenuVisible = filteredQr.length > 0;
  useEffect(() => {
    setQrIndex(0);
  }, [qrQuery]);

  function applyQuickReply(q: QuickReply) {
    const nome = contact?.name?.trim() || displayName(contact);
    const text = q.content.replace(/\{\{\s*nome\s*\}\}/gi, nome);
    setDraft(text);
    setPendingCursor(text.length);
  }

  useEffect(() => {
    setShowContactPanel(false);
    setEditingContact(false);
  }, [selectedId]);

  useEffect(() => {
    setNotesDraft(contact?.notes ?? "");
  }, [contact?.id, contact?.notes]);

  function patchContactInCache(contatoId: string, patch: Record<string, unknown>) {
    queryClient.setQueryData<any>(["conversations"], (old: any) => {
      if (!Array.isArray(old)) return old;
      return old.map((c: any) => (c.contact?.id === contatoId ? { ...c, contact: { ...c.contact, ...patch } } : c));
    });
  }

  function openEditContact() {
    setCName(contact?.name ?? "");
    setCEmail(contact?.email ?? "");
    setCBirth(contact?.birth_date ?? "");
    setEditingContact(true);
  }

  async function saveContact() {
    const contatoId = contact?.id;
    if (!contatoId) return;
    setSavingContact(true);
    const nome = cName.trim();
    const patch = {
      name: nome || null,
      name_locked: nome.length > 0,
      email: cEmail.trim() || null,
      birth_date: cBirth || null,
    };
    patchContactInCache(contatoId, patch);
    const { error } = await supabase.from("contacts").update(patch).eq("id", contatoId);
    setSavingContact(false);
    if (error) {
      alert("Não foi possível salvar o contato.");
    }
    setEditingContact(false);
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
  }

  async function saveNotes() {
    const contatoId = contact?.id;
    if (!contatoId) return;
    setSavingNotes(true);
    patchContactInCache(contatoId, { notes: notesDraft });
    const { error } = await supabase.from("contacts").update({ notes: notesDraft }).eq("id", contatoId);
    setSavingNotes(false);
    if (error) {
      alert("Não foi possível salvar as observações.");
    }
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
  }

  function scheduleForContact() {
    if (!contact) return;
    try {
      sessionStorage.setItem(
        "scheduleForContact",
        JSON.stringify({
          id: contact.id,
          name: contact.name ?? null,
          external_id: contact.external_id,
        }),
      );
    } catch {
      /* ignore */
    }
    navigate({ to: "/schedules" });
  }

  async function reactToMessage(messageId: string, emoji: string) {
    try {
      await supabase.functions.invoke("send-reaction", { body: { messageId, emoji } });
    } catch (e) {
      console.error("Erro ao reagir:", e);
    }
  }

  async function deleteMessage(messageId: string) {
    if (!window.confirm("Apagar esta mensagem para todos? Isso não pode ser desfeito.")) return;
    const { data, error: invokeErr } = await supabase.functions.invoke("delete-message", {
      body: { messageId },
    });
    if (invokeErr || (data as any)?.error) {
      alert((data as any)?.error || "Não foi possível apagar. O tempo permitido pode ter passado.");
      return;
    }
    if (selectedId) queryClient.invalidateQueries({ queryKey: ["messages", selectedId] });
  }

  // ----- Encaminhar (F.4a) -----
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [fwdSearch, setFwdSearch] = useState("");
  const [fwdResults, setFwdResults] = useState<{ id: string; name: string | null; external_id: string }[]>([]);
  const [forwarding, setForwarding] = useState(false);

  useEffect(() => {
    if (!forwardMsg || !orgId) return;
    let active = true;
    const t = setTimeout(async () => {
      let q = supabase
        .from("contacts")
        .select("id, name, external_id")
        .eq("is_group", false)
        .order("name", { ascending: true })
        .limit(20);
      const term = fwdSearch.trim();
      if (term) q = q.or(`name.ilike.%${term}%,external_id.ilike.%${term}%`);
      const { data } = await q;
      if (active) setFwdResults((data ?? []) as { id: string; name: string | null; external_id: string }[]);
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [fwdSearch, forwardMsg, orgId]);

  async function resolveConversation(contactId: string): Promise<string | null> {
    if (!orgId) return null;
    const { data: canal } = await supabase
      .from("channels")
      .select("id")
      .eq("org_id", orgId)
      .eq("type", "whatsapp_baileys")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!canal) return null;
    let { data: conv } = await supabase
      .from("conversations")
      .select("id")
      .eq("contact_id", contactId)
      .eq("channel_id", canal.id)
      .neq("status", "closed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!conv) {
      const { data: nova } = await supabase
        .from("conversations")
        .insert({
          org_id: orgId,
          contact_id: contactId,
          channel_id: canal.id,
          status: "open",
          last_message_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      conv = nova ?? null;
    }
    return conv?.id ?? null;
  }

  async function doForward(contact: { id: string; name: string | null; external_id: string }) {
    if (!forwardMsg) return;
    setForwarding(true);
    try {
      const convId = await resolveConversation(contact.id);
      if (!convId) {
        alert("Nenhum canal WhatsApp conectado.");
        return;
      }
      const m = forwardMsg;
      if (m.media_url) {
        const { data: blob, error: dErr } = await supabase.storage.from("media").download(m.media_url);
        if (dErr || !blob) {
          alert("Não foi possível baixar o anexo para encaminhar.");
          return;
        }
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        const { error: sErr } = await supabase.functions.invoke("send-media", {
          body: {
            conversationId: convId,
            base64,
            mimetype: blob.type || "application/octet-stream",
            fileName: m.media_name || "arquivo",
            caption: m.content ?? "",
          },
        });
        if (sErr) {
          alert("Não foi possível encaminhar o anexo.");
          return;
        }
      } else if (m.content) {
        const { error: sErr } = await supabase.functions.invoke("send-message", {
          body: { conversationId: convId, text: m.content },
        });
        if (sErr) {
          alert("Não foi possível encaminhar.");
          return;
        }
      }
      setForwardMsg(null);
      setFwdSearch("");
      if (convId === selectedId) queryClient.invalidateQueries({ queryKey: ["messages", selectedId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    } finally {
      setForwarding(false);
    }
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
                  onClick={() => {
                    previewRef.current = false;
                    if (c.id === selectedId && (c.unread_count ?? 0) > 0) {
                      supabase
                        .from("conversations")
                        .update({ unread_count: 0 })
                        .eq("id", c.id)
                        .then(() => queryClient.invalidateQueries({ queryKey: ["conversations"] }));
                    } else {
                      setSelectedId(c.id);
                    }
                  }}
                  className={`flex w-full items-start gap-3 border-b border-gray-100 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${active ? "bg-blue-50" : ""}`}
                >
                  <ContactAvatar
                    path={c.contact?.avatar_url}
                    initials={c.contact?.name ? initials(c.contact.name) : "#"}
                    className="h-10 w-10 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`truncate text-sm ${unread ? "font-bold" : "font-medium"} text-gray-900`}>
                        {name}
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        {unread && (
                          <span
                            role="button"
                            tabIndex={0}
                            title="Ver sem marcar como lida"
                            onClick={(e) => {
                              e.stopPropagation();
                              previewRef.current = true;
                              setSelectedId(c.id);
                            }}
                            className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          >
                            <Eye size={14} />
                          </span>
                        )}
                        <span className="text-[11px] text-gray-500">{timeAgo(c.last_message_at)}</span>
                      </div>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusClass[c.status] ?? "bg-gray-100 text-gray-600"}`}
                        >
                          {statusLabel[c.status] ?? c.status}
                        </span>
                        {c.contact?.is_group && (
                          <span className="rounded bg-brand-blue/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-blue">
                            Grupo
                          </span>
                        )}
                        <span className="truncate text-[11px] text-gray-500">{c.channel?.name ?? ""}</span>
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
                <ContactAvatar
                  path={selected.contact?.avatar_url}
                  initials={selected.contact?.name ? initials(selected.contact.name) : "#"}
                  className="h-9 w-9 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => setShowContactPanel((v) => !v)}
                    className="truncate text-left text-sm font-semibold text-gray-900 hover:underline"
                    title="Ver dados do contato"
                  >
                    {displayName(selected.contact)}
                  </button>
                  <p className="truncate text-xs text-gray-500">
                    {selected.contact?.is_group && (
                      <span className="mr-1.5 rounded bg-brand-blue/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-blue">
                        Grupo
                      </span>
                    )}
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
                  const reactionCounts = m.reactions
                    ? Object.values(m.reactions).reduce<Record<string, number>>((acc, e) => {
                        if (e) acc[e] = (acc[e] || 0) + 1;
                        return acc;
                      }, {})
                    : {};
                  const reactionList = Object.entries(reactionCounts);
                  // F.2a: se esta mensagem responde a outra, monta a prévia citada.
                  const quotedMsg = m.reply_to_external_id
                    ? (messages ?? []).find((x) => x.external_message_id === m.reply_to_external_id)
                    : undefined;
                  const quotedSender = quotedMsg
                    ? quotedMsg.direction === "outbound"
                      ? "Você"
                      : quotedMsg.sender_name || displayName(selected.contact)
                    : "";
                  const quotedText = quotedMsg
                    ? quotedMsg.content && quotedMsg.content.trim()
                      ? quotedMsg.content
                      : contentLabel(quotedMsg.content_type, quotedMsg.content)
                    : m.reply_to_preview || "Mensagem";
                  return (
                    <div
                      key={m.id}
                      className={`group mb-2 flex items-center gap-1 ${out ? "justify-end" : "justify-start"}`}
                    >
                      {out && !m.deleted_at && (
                        <MessageActions
                          mine={m.reactions?.["me"] ?? null}
                          canReact={!!m.external_message_id}
                          canCopy={!!m.content}
                          canReply={!!m.external_message_id}
                          canDelete={out && !!m.external_message_id}
                          canForward={!!(m.content || m.media_url)}
                          onReact={(e) => reactToMessage(m.id, e)}
                          onCopy={() => m.content && navigator.clipboard?.writeText(m.content)}
                          onReply={() =>
                            setReplyTo({
                              id: m.external_message_id!,
                              preview:
                                m.content && m.content.trim() ? m.content : contentLabel(m.content_type, m.content),
                              sender: out ? "Você" : m.sender_name || displayName(selected.contact),
                            })
                          }
                          onDelete={() => deleteMessage(m.id)}
                          onForward={() => setForwardMsg(m)}
                        />
                      )}
                      <div
                        className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm ${out ? "bg-primary text-primary-foreground" : "border border-gray-200 bg-white text-gray-900"}`}
                      >
                        {!m.deleted_at && m.reply_to_external_id && (
                          <div
                            className={`mb-1 rounded-md border-l-2 px-2 py-1 text-[11px] ${out ? "border-white/60 bg-white/15" : "border-brand-blue/50 bg-gray-50"}`}
                          >
                            {quotedSender && (
                              <p className={`font-semibold ${out ? "text-white/90" : "text-brand-blue"}`}>
                                {quotedSender}
                              </p>
                            )}
                            <p className="truncate opacity-80">{quotedText}</p>
                          </div>
                        )}
                        {!m.deleted_at && !out && selected.contact?.is_group && m.sender_name && (
                          <p className="mb-0.5 text-[11px] font-semibold text-brand-blue">{m.sender_name}</p>
                        )}
                        {m.deleted_at ? (
                          <p className={`italic ${out ? "text-primary-foreground/70" : "text-gray-400"}`}>
                            🚫 Mensagem apagada
                          </p>
                        ) : m.media_url &&
                          ["image", "audio", "video", "document", "sticker"].includes(m.content_type) ? (
                          <>
                            <MessageMedia
                              path={m.media_url}
                              contentType={m.content_type}
                              name={m.media_name}
                              size={m.media_size}
                            />
                            {m.content && <p className="mt-1 whitespace-pre-wrap break-words">{m.content}</p>}
                          </>
                        ) : (
                          <p className="whitespace-pre-wrap break-words">{contentLabel(m.content_type, m.content)}</p>
                        )}
                        <p className={`mt-1 text-[10px] ${out ? "text-primary-foreground/70" : "text-gray-500"}`}>
                          {hhmm(m.created_at)}
                        </p>
                        {!m.deleted_at && reactionList.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {reactionList.map(([emoji, count]) => (
                              <span
                                key={emoji}
                                className="inline-flex items-center gap-0.5 rounded-full border border-gray-200 bg-white px-1.5 py-0.5 text-xs text-gray-800 shadow-sm"
                              >
                                <span>{emoji}</span>
                                {count > 1 && <span className="text-[10px] text-gray-500">{count}</span>}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {!out && !m.deleted_at && (
                        <MessageActions
                          mine={m.reactions?.["me"] ?? null}
                          canReact={!!m.external_message_id}
                          canCopy={!!m.content}
                          canReply={!!m.external_message_id}
                          canDelete={out && !!m.external_message_id}
                          canForward={!!(m.content || m.media_url)}
                          onReact={(e) => reactToMessage(m.id, e)}
                          onCopy={() => m.content && navigator.clipboard?.writeText(m.content)}
                          onReply={() =>
                            setReplyTo({
                              id: m.external_message_id!,
                              preview:
                                m.content && m.content.trim() ? m.content : contentLabel(m.content_type, m.content),
                              sender: out ? "Você" : m.sender_name || displayName(selected.contact),
                            })
                          }
                          onDelete={() => deleteMessage(m.id)}
                          onForward={() => setForwardMsg(m)}
                        />
                      )}
                    </div>
                  );
                })}
            </div>

            <div className="relative border-t border-gray-200 bg-white px-4 py-3">
              {replyTo && (
                <div className="mb-2 flex items-start gap-2 rounded-md border-l-2 border-brand-blue/60 bg-gray-50 px-2 py-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-brand-blue">Respondendo {replyTo.sender}</p>
                    <p className="truncate text-xs text-gray-600">{replyTo.preview}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyTo(null)}
                    className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                    title="Cancelar resposta"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              {qrMenuVisible && (
                <div className="absolute bottom-full left-4 right-4 mb-2 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg z-20">
                  {filteredQr.map((q, i) => (
                    <button
                      key={q.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applyQuickReply(q);
                      }}
                      onMouseEnter={() => setQrIndex(i)}
                      className={`block w-full px-3 py-2 text-left ${i === qrIndex ? "bg-gray-100" : "hover:bg-gray-50"}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{q.title?.trim() || q.shortcut}</span>
                        <span className="text-xs text-gray-500">/{q.shortcut}</span>
                      </div>
                      <p className="truncate text-xs text-gray-500">{q.content}</p>
                    </button>
                  ))}
                </div>
              )}
              {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sendingMedia}
                  className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  <Paperclip size={18} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,application/pdf"
                  className="hidden"
                  onChange={handleFileSelected}
                />
                {!recording ? (
                  <button
                    type="button"
                    onClick={startRecording}
                    disabled={sendingAudio}
                    className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Mic size={18} />
                  </button>
                ) : (
                  <div className="mb-0.5 flex shrink-0 items-center gap-2">
                    <span className="flex items-center gap-1.5 rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-600">
                      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-600" />
                      Gravando…
                    </span>
                    <button
                      type="button"
                      onClick={stopAndSend}
                      className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-600 text-white hover:bg-green-700"
                    >
                      <Square size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={cancelRecording}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
                    >
                      <X size={18} />
                    </button>
                  </div>
                )}
                <Popover open={openEmoji} onOpenChange={setOpenEmoji}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
                    >
                      <Smile size={18} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="top" align="end" className="w-auto p-0">
                    <EmojiPicker
                      onEmojiClick={(emojiData: EmojiClickData) => {
                        const textarea = textareaRef.current;
                        if (!textarea) return;
                        const start = textarea.selectionStart;
                        const end = textarea.selectionEnd;
                        const newValue = draft.slice(0, start) + emojiData.emoji + draft.slice(end);
                        setDraft(newValue);
                        setPendingCursor(start + emojiData.emoji.length);
                        setOpenEmoji(false);
                      }}
                      lazyLoadEmojis={true}
                    />
                  </PopoverContent>
                </Popover>
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (qrMenuVisible) {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setQrIndex((i) => Math.min(i + 1, filteredQr.length - 1));
                        return;
                      }
                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setQrIndex((i) => Math.max(i - 1, 0));
                        return;
                      }
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const q = filteredQr[qrIndex];
                        if (q) applyQuickReply(q);
                        return;
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setDraft("");
                        return;
                      }
                    }
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  rows={1}
                  placeholder="Escreva uma mensagem ou digite / para respostas rápidas…"
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

      {selected && showContactPanel && contact && (
        <aside className="flex w-[340px] shrink-0 flex-col overflow-hidden border-l border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-900">Dados do contato</h3>
            <div className="flex items-center gap-1">
              {!editingContact && (
                <button
                  onClick={openEditContact}
                  className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                  title="Editar"
                >
                  <Pencil size={16} />
                </button>
              )}
              <button
                onClick={() => {
                  setShowContactPanel(false);
                  setEditingContact(false);
                }}
                className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                title="Fechar"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div className="flex flex-col items-center gap-2">
              <ContactAvatar
                path={contact.avatar_url}
                initials={contact.name ? initials(contact.name) : "#"}
                className="h-20 w-20"
              />
              {!editingContact && <p className="text-base font-semibold text-gray-900">{displayName(contact)}</p>}
            </div>

            {!editingContact && (
              <button
                onClick={scheduleForContact}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <CalendarClock size={16} />
                Agendar mensagem
              </button>
            )}

            {!editingContact ? (
              <dl className="mt-5 space-y-3 text-sm">
                <div>
                  <dt className="text-xs font-medium text-gray-500">Telefone</dt>
                  <dd className="text-gray-900">{formatPhone(contact.external_id) ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500">E-mail</dt>
                  <dd className="text-gray-900">{contact.email || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500">Nascimento</dt>
                  <dd className="text-gray-900">
                    {contact.birth_date ? contact.birth_date.split("-").reverse().join("/") : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500">ID do contato</dt>
                  <dd className="flex items-center gap-2">
                    <span className="truncate text-[11px] text-gray-600">{contact.id}</span>
                    <button
                      onClick={() => navigator.clipboard?.writeText(contact.id)}
                      className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                      title="Copiar ID"
                    >
                      <Copy size={12} />
                    </button>
                  </dd>
                </div>
              </dl>
            ) : (
              <div className="mt-5 space-y-3 text-sm">
                <div>
                  <label className="text-xs font-medium text-gray-500">Nome</label>
                  <input
                    value={cName}
                    onChange={(e) => setCName(e.target.value)}
                    placeholder={formatPhone(contact.external_id) ?? ""}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Telefone</label>
                  <input
                    value={formatPhone(contact.external_id) ?? ""}
                    disabled
                    className="mt-1 w-full rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-gray-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">E-mail</label>
                  <input
                    type="email"
                    value={cEmail}
                    onChange={(e) => setCEmail(e.target.value)}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Nascimento</label>
                  <input
                    type="date"
                    value={cBirth}
                    onChange={(e) => setCBirth(e.target.value)}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">ID do contato</label>
                  <input
                    value={contact.id}
                    disabled
                    className="mt-1 w-full rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-[11px] text-gray-500"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={() => setEditingContact(false)}
                    disabled={savingContact}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={saveContact}
                    disabled={savingContact}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {savingContact ? "Salvando…" : "Salvar"}
                  </button>
                </div>
              </div>
            )}

            <div className="mt-6 border-t border-gray-200 pt-4">
              <ContactTagsSection contactId={contact.id} orgId={orgId} />
            </div>

            <div className="mt-6 border-t border-gray-200 pt-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Observações</h4>
              <textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                rows={5}
                placeholder="Anote algo sobre este contato…"
                className="w-full resize-none rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  onClick={() => setNotesDraft(contact.notes ?? "")}
                  disabled={savingNotes}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveNotes}
                  disabled={savingNotes}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {savingNotes ? "Salvando…" : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* F.4a — Modal de Encaminhar */}
      {forwardMsg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !forwarding && setForwardMsg(null)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-sm flex-col overflow-hidden rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-900">Encaminhar para…</h3>
              <button
                onClick={() => !forwarding && setForwardMsg(null)}
                className="rounded p-1 text-gray-500 hover:bg-gray-100"
                title="Fechar"
              >
                <X size={16} />
              </button>
            </div>
            <div className="border-b border-gray-100 p-3">
              <input
                value={fwdSearch}
                onChange={(e) => setFwdSearch(e.target.value)}
                placeholder="Buscar contato…"
                autoFocus
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-blue focus:outline-none"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {fwdResults.length === 0 ? (
                <p className="px-2 py-4 text-center text-sm text-gray-400">Nenhum contato.</p>
              ) : (
                fwdResults.map((c) => (
                  <button
                    key={c.id}
                    disabled={forwarding}
                    onClick={() => doForward(c)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-gray-50 disabled:opacity-50"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                      {initials(c.name || c.external_id)}
                    </span>
                    <span className="truncate text-sm text-gray-900">
                      {c.name?.trim() || formatPhone(c.external_id) || c.external_id}
                    </span>
                  </button>
                ))
              )}
            </div>
            {forwarding && (
              <div className="border-t border-gray-100 px-4 py-2 text-center text-xs text-gray-500">Encaminhando…</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
