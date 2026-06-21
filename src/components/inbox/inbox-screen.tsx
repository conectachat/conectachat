import { Fragment, useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useConversations } from "@/hooks/use-conversations";
import { useMessages, type Message } from "@/hooks/use-messages";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { Logo } from "@/components/shared/logo";
import { ContactTagsSection } from "@/components/contacts/contact-tags";
import { ConversationCrmCard } from "@/components/crm/conversation-crm";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Paperclip,
  Mic,
  Square,
  X,
  Pencil,
  Copy,
  Smile,
  Eye,
  Search,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  File as FileIcon,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  Plus,
  Reply,
  Trash2,
  Forward,
  Pin,
  PinOff,
  Star,
  StarOff,
  Download,
  Mail,
  ArrowRightLeft,
  Users,
  Building2,
  Send,
  MoreVertical,
} from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";

type QuickReply = { id: string; shortcut: string; title: string | null; content: string };

// H.3b-3 — mensagem "otimista": aparece na hora (antes do servidor confirmar).
// _optimistic marca a bolha temporária; _convId guarda em qual conversa ela vive.
type RenderMessage = Message & { _optimistic?: boolean; _convId?: string };

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
// Chave AAAA-M-D para comparar se duas mensagens são do mesmo dia.
function ymd(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
// Rótulo amigável do separador de data: "Hoje", "Ontem" ou "12 de junho [de 2025]".
function dayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (ymd(iso) === ymd(now.toISOString())) return "Hoje";
  if (ymd(iso) === ymd(yest.toISOString())) return "Ontem";
  return d.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}
// Tamanho de arquivo legível (KB/MB) para a pré-visualização da mídia.
function formatBytes(n: number | null | undefined) {
  if (!n || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// H.3b-2 — tiquinhos de status (só em mensagens enviadas por nós).
//  enviado = ✓ | entregue = ✓✓ | lido = ✓✓ azul | falhou = ⚠ | na fila = relógio
function StatusTicks({ status }: { status: string }) {
  if (status === "read") return <CheckCheck size={13} className="text-sky-300" aria-label="Lida" />;
  if (status === "delivered") return <CheckCheck size={13} className="opacity-80" aria-label="Entregue" />;
  if (status === "sent") return <Check size={13} className="opacity-80" aria-label="Enviada" />;
  if (status === "failed") return <AlertCircle size={13} className="text-red-300" aria-label="Falha no envio" />;
  return <Clock size={11} className="opacity-70" aria-label="Enviando" />;
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

// Baixa um arquivo do Storage de forma confiável (independe do tipo): pega o
// blob, cria um link temporário e dispara o "salvar" com o nome certo. Resolve
// o caso em que o link assinado só ABRE o arquivo (PDF/imagem) em vez de baixar.
async function downloadFromStorage(path: string, name?: string | null) {
  try {
    const { data, error } = await supabase.storage.from("media").download(path);
    if (error || !data) {
      toast.error("Não foi possível baixar o arquivo.");
      return;
    }
    const objectUrl = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = name || "arquivo";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    toast.error("Não foi possível baixar o arquivo.");
  }
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
  const [zoom, setZoom] = useState(false);
  if (!url) return <span className="text-xs opacity-60">Carregando mídia…</span>;
  if (contentType === "image" || contentType === "sticker")
    return (
      <>
        <button type="button" onClick={() => setZoom(true)} className="block cursor-zoom-in" title="Ampliar imagem">
          <img src={url} alt={name || ""} className="max-w-[240px] rounded-lg" />
        </button>
        {zoom &&
          createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
              onClick={() => setZoom(false)}
            >
              <div className="absolute right-3 top-3 flex gap-2">
                <button
                  type="button"
                  title="Baixar"
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadFromStorage(path, name);
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
                >
                  <Download className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  title="Fechar"
                  onClick={() => setZoom(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <img
                src={url}
                alt={name || ""}
                className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            </div>,
            document.body,
          )}
      </>
    );
  if (contentType === "audio") return <audio controls src={url} className="max-w-[260px]" />;
  if (contentType === "video") return <video controls src={url} className="max-w-[240px] rounded-lg" />;
  return (() => {
    const ext = (name?.split(".").pop() || "FILE").toUpperCase();
    return (
      <button
        type="button"
        onClick={() => downloadFromStorage(path, name)}
        className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 max-w-[280px] text-left hover:bg-gray-50"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-red-50 text-red-600 text-[10px] font-bold">
          {ext}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-gray-800">{name || "Documento"}</div>
          <div className="text-xs text-gray-500">{size ? formatSize(size) + " · " : ""}Clique para baixar</div>
        </div>
        <Download className="h-4 w-4 shrink-0 text-gray-400" />
      </button>
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
  pinned,
  starred,
  onReact,
  onCopy,
  onReply,
  onForward,
  onDelete,
  onPin,
  onStar,
}: {
  mine: string | null;
  canReact: boolean;
  canCopy: boolean;
  canReply: boolean;
  canForward: boolean;
  canDelete: boolean;
  pinned: boolean;
  starred: boolean;
  onReact: (emoji: string) => void;
  onCopy: () => void;
  onReply: () => void;
  onForward: () => void;
  onDelete: () => void;
  onPin: () => void;
  onStar: () => void;
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
              <button
                type="button"
                onClick={() => {
                  onPin();
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
              >
                {pinned ? <PinOff size={14} /> : <Pin size={14} />} {pinned ? "Desafixar" : "Fixar"}
              </button>
              <button
                type="button"
                onClick={() => {
                  onStar();
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
              >
                {starred ? <StarOff size={14} /> : <Star size={14} />} {starred ? "Desfavoritar" : "Favoritar"}
              </button>
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
  const [convSearch, setConvSearch] = useState("");
  // Bloco M — aba ativa da lista. "aguardando" = sem atendente; "minhas" = atribuída a mim.
  // Abre em "Minhas" por padrão; ordem das abas: Minhas → Aguardando → Todas.
  const [tab, setTab] = useState<"todas" | "aguardando" | "minhas">("minhas");

  // H.3a — lista de conversas filtrada pela busca (nome, telefone ou e-mail).
  const filteredConvs = useMemo(() => {
    const list = conversations ?? [];
    const term = convSearch.trim().toLowerCase();
    if (!term) return list;
    return list.filter((c) => {
      const name = displayName(c.contact).toLowerCase();
      const phone = (c.contact?.external_id ?? "").toLowerCase();
      const email = (c.contact?.email ?? "").toLowerCase();
      return name.includes(term) || phone.includes(term) || email.includes(term);
    });
  }, [conversations, convSearch]);
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
  const confirm = useConfirm();
  const { user, activeMembership } = useCurrentUser();
  const orgId = activeMembership?.org_id ?? null;

  // Nomes dos atendentes da empresa (user_id -> nome) para mostrar quem ENVIOU cada mensagem.
  const memberNamesQuery = useQuery({
    queryKey: ["org-member-names", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from("org_members")
        .select("user_id, profiles(full_name, email)")
        .eq("org_id", orgId!);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const m of (data ?? []) as any[]) {
        map[m.user_id] = m.profiles?.full_name || m.profiles?.email || "Atendente";
      }
      return map;
    },
  });
  const memberNames = memberNamesQuery.data ?? {};

  // H.3b-1 — "Atender": atribui (ou libera) a conversa para o usuário atual.
  async function assignConversation(uid: string | null) {
    if (!selectedId) return;
    const { error } = await supabase.from("conversations").update({ assigned_user_id: uid }).eq("id", selectedId);
    if (error) {
      toast.error("Não foi possível atualizar o atendimento.");
      return;
    }
    toast.success(uid ? "Você assumiu o atendimento." : "Atendimento liberado.");
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
  }

  // Bloco M — "Aceitar": um clique no card de uma conversa Aguardando atribui a mim.
  const myId = user?.id ?? null;
  async function acceptConversation(convId: string) {
    if (!myId) return;
    const { error } = await supabase.from("conversations").update({ assigned_user_id: myId }).eq("id", convId);
    if (error) {
      toast.error("Não foi possível aceitar a conversa.");
      return;
    }
    toast.success("Você assumiu o atendimento.");
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
  }

  // ===================================================================
  // Bloco N — TRANSFERÊNCIA
  // ===================================================================
  // Estado do modal: aberto/fechado, alvo escolhido, motivo e "enviando".
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferMode, setTransferMode] = useState<"department" | "user">("department");
  const [transferDeptId, setTransferDeptId] = useState<string>("");
  const [transferUserId, setTransferUserId] = useState<string>("");
  const [transferNote, setTransferNote] = useState("");
  const [transferring, setTransferring] = useState(false);

  // Lista de departamentos da empresa (para o seletor "Para um departamento").
  const deptsQuery = useQuery({
    queryKey: ["transfer-departments", orgId],
    enabled: !!orgId && transferOpen,
    queryFn: async (): Promise<{ id: string; name: string }[]> => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, name")
        .eq("org_id", orgId!)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const deptList = deptsQuery.data ?? [];

  // Lista de atendentes da empresa (para o seletor "Para um atendente").
  // Tira o próprio usuário (não faz sentido "transferir para mim").
  const teamQuery = useQuery({
    queryKey: ["transfer-team", orgId],
    enabled: !!orgId && transferOpen,
    queryFn: async (): Promise<{ user_id: string; name: string }[]> => {
      const { data, error } = await supabase
        .from("org_members")
        .select("user_id, role, profiles(full_name, email)")
        .eq("org_id", orgId!);
      if (error) throw error;
      return (data ?? []).map((m: any) => ({
        user_id: m.user_id,
        name: m.profiles?.full_name || m.profiles?.email || "Usuário",
      }));
    },
  });
  const teamList = (teamQuery.data ?? []).filter((u) => u.user_id !== myId);

  // Abre o modal já zerado e na aba "departamento".
  function openTransfer() {
    setTransferMode("department");
    setTransferDeptId("");
    setTransferUserId("");
    setTransferNote("");
    setTransferOpen(true);
  }

  // Chama a Edge Function segura que troca dono/setor + grava histórico + aviso.
  async function doTransfer() {
    if (!selectedId) return;
    const toDept = transferMode === "department" ? transferDeptId : transferDeptId || null;
    const toUser = transferMode === "user" ? transferUserId : null;

    if (transferMode === "department" && !transferDeptId) {
      toast.error("Escolha o departamento.");
      return;
    }
    if (transferMode === "user" && !transferUserId) {
      toast.error("Escolha o atendente.");
      return;
    }

    setTransferring(true);
    const { data, error } = await supabase.functions.invoke("transfer-conversation", {
      body: {
        conversationId: selectedId,
        toDepartmentId: toDept || null,
        toUserId: toUser,
        note: transferNote.trim() || null,
      },
    });
    setTransferring(false);

    // A função responde { ok:false, error } com HTTP 200 em caso de regra de
    // negócio (sem permissão, alvo inválido…); 'error' aqui é só falha de rede.
    if (error || !data?.ok) {
      toast.error(data?.error || "Não foi possível transferir a conversa.");
      return;
    }

    toast.success("Conversa transferida.");
    setTransferOpen(false);
    // Se mandei para outro dono/fila, ela some da minha tela — fecho a conversa.
    setSelectedId(null);
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
    queryClient.invalidateQueries({ queryKey: ["messages", selectedId] });
  }

  // Bloco M — contadores por aba (sobre a lista já filtrada pela busca).
  const counts = useMemo(() => {
    let aguardando = 0;
    let minhas = 0;
    for (const c of filteredConvs) {
      if (!c.assigned_user_id) aguardando++;
      else if (c.assigned_user_id === myId) minhas++;
    }
    return { todas: filteredConvs.length, aguardando, minhas };
  }, [filteredConvs, myId]);

  // Bloco M — lista exibida = busca + aba ativa.
  const visibleConvs = useMemo(() => {
    if (tab === "aguardando") return filteredConvs.filter((c) => !c.assigned_user_id);
    if (tab === "minhas") return filteredConvs.filter((c) => c.assigned_user_id === myId);
    return filteredConvs;
  }, [filteredConvs, tab, myId]);
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
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; preview: string; sender: string } | null>(null);
  const [sending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // H.3b-3 — envio otimista (só texto): bolhas temporárias por conversa.
  const [pending, setPending] = useState<RenderMessage[]>([]);
  const sendLockRef = useRef(false);

  // Lista final renderizada = mensagens reais (com filtro de favoritas) + pendentes
  // desta conversa no fim. No filtro "só favoritas" não mostramos pendentes.
  const renderMessages = useMemo<RenderMessage[]>(() => {
    const base = (messages ?? []).filter((m) => !showStarredOnly || m.starred_at) as RenderMessage[];
    if (showStarredOnly) return base;
    return [...base, ...pending.filter((p) => p._convId === selectedId)];
  }, [messages, showStarredOnly, pending, selectedId]);

  // Rede de segurança: se a mensagem real chegar (por realtime) antes do nosso
  // caminho de sucesso, removemos a temporária equivalente (mesmo conteúdo,
  // criada por volta do mesmo instante) para nunca duplicar.
  useEffect(() => {
    if (pending.length === 0) return;
    setPending((prev) =>
      prev.filter((p) => {
        if (p.status === "failed") return true; // falhas ficam até o usuário reenviar
        const matched = (messages ?? []).some(
          (r) =>
            r.direction === "outbound" &&
            r.content_type === "text" &&
            (r.content ?? "") === (p.content ?? "") &&
            new Date(r.created_at).getTime() >= new Date(p.created_at).getTime() - 2000,
        );
        return !matched;
      }),
    );
  }, [messages, pending.length]);

  // Núcleo do envio otimista: cria a bolha na hora e chama o servidor.
  async function pushOptimisticAndSend(text: string, convId: string, reply: { id: string; preview: string } | null) {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const optimistic: RenderMessage = {
      id: tempId,
      direction: "outbound",
      content_type: "text",
      content: text,
      media_url: null,
      media_name: null,
      media_size: null,
      status: "queued",
      sender_name: null,
      sender_external_id: null,
      sender_user_id: user?.id ?? null,
      reactions: null,
      external_message_id: null,
      reply_to_external_id: reply?.id ?? null,
      reply_to_preview: reply?.preview ?? null,
      deleted_at: null,
      pinned_at: null,
      starred_at: null,
      created_at: new Date().toISOString(),
      _optimistic: true,
      _convId: convId,
    };
    setPending((p) => [...p, optimistic]);

    const { data, error: invokeErr } = await supabase.functions.invoke("send-message", {
      body: {
        conversationId: convId,
        text,
        replyTo: reply ? { externalId: reply.id, preview: reply.preview } : undefined,
      },
    });

    if (invokeErr || (data as any)?.error) {
      // Marca a bolha como falha (⚠) — fica visível para reenviar.
      setPending((p) => p.map((x) => (x.id === tempId ? { ...x, status: "failed" } : x)));
      toast.error("Não foi possível enviar.", { description: "Toque na mensagem para tentar de novo." });
      return;
    }

    // Sucesso: injeta a mensagem real no cache (sem piscar) e remove a temporária.
    const real = (data as any)?.message as Message | undefined;
    if (real) {
      queryClient.setQueryData<Message[]>(["messages", convId], (old) => {
        const list = old ?? [];
        return list.some((x) => x.id === real.id) ? list : [...list, real];
      });
    }
    setPending((p) => p.filter((x) => x.id !== tempId));
    queryClient.invalidateQueries({ queryKey: ["messages", convId] });
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
  }

  function handleSend() {
    const text = draft.trim();
    // Trava síncrona: evita o disparo duplo do mesmo Enter (mesmo texto).
    if (!text || !selectedId || sendLockRef.current) return;
    sendLockRef.current = true;
    setTimeout(() => {
      sendLockRef.current = false;
    }, 0);
    const convId = selectedId;
    const reply = replyTo ? { id: replyTo.id, preview: replyTo.preview } : null;
    setDraft("");
    setReplyTo(null);
    setError(null);
    void pushOptimisticAndSend(text, convId, reply);
  }

  // Reenvio de uma bolha que falhou (toque na mensagem ⚠).
  function resendOptimistic(m: RenderMessage) {
    setPending((p) => p.filter((x) => x.id !== m.id));
    void pushOptimisticAndSend(
      m.content ?? "",
      m._convId ?? selectedId ?? "",
      m.reply_to_external_id ? { id: m.reply_to_external_id, preview: m.reply_to_preview ?? "" } : null,
    );
  }

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sendingMedia, setSendingMedia] = useState(false);
  // H.3a — mídia escolhida aguardando legenda + confirmação de envio.
  const [pendingMedia, setPendingMedia] = useState<{ file: File; url: string | null; caption: string } | null>(null);

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selectedId) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Arquivo muito grande", { description: "Por enquanto, envie arquivos de até 5 MB." });
      return;
    }
    // Em vez de enviar na hora, abre a pré-visualização para você adicionar uma legenda.
    const url = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    setPendingMedia({ file, url, caption: "" });
  }

  function closePendingMedia() {
    setPendingMedia((p) => {
      if (p?.url) URL.revokeObjectURL(p.url);
      return null;
    });
  }

  async function confirmSendMedia() {
    if (!pendingMedia || !selectedId) return;
    const { file, caption } = pendingMedia;
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
          caption: caption.trim(),
          replyTo: replyTo ? { externalId: replyTo.id, preview: replyTo.preview } : undefined,
        },
      });
      if (error) {
        toast.error("Não foi possível enviar o arquivo.");
        return;
      }
      setReplyTo(null);
      closePendingMedia();
      queryClient.invalidateQueries({ queryKey: ["messages", selectedId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
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
          if (error) toast.error("Não foi possível enviar o áudio.");
          else setReplyTo(null);
        } finally {
          setSendingAudio(false);
        }
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
    } catch {
      toast.error("Não consegui acessar o microfone.", {
        description: "Verifique a permissão do navegador.",
      });
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
  const [plusOpen, setPlusOpen] = useState(false);
  const [plusShowEmoji, setPlusShowEmoji] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
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
    setShowStarredOnly(false);
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
      toast.error("Não foi possível salvar o contato.");
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
      toast.error("Não foi possível salvar as observações.");
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
    const ok = await confirm({
      title: "Apagar mensagem?",
      description: "A mensagem será apagada para todos. Isso não pode ser desfeito.",
      confirmText: "Apagar",
      danger: true,
    });
    if (!ok) return;
    const { data, error: invokeErr } = await supabase.functions.invoke("delete-message", {
      body: { messageId },
    });
    if (invokeErr || (data as any)?.error) {
      toast.error("Não foi possível apagar", {
        description: (data as any)?.error || "O tempo permitido pode ter passado.",
      });
      return;
    }
    if (selectedId) queryClient.invalidateQueries({ queryKey: ["messages", selectedId] });
  }

  async function togglePin(m: Message) {
    const { error } = await supabase
      .from("messages")
      .update({ pinned_at: m.pinned_at ? null : new Date().toISOString() })
      .eq("id", m.id);
    if (error) {
      toast.error("Não foi possível fixar/desafixar.");
      return;
    }
    if (selectedId) queryClient.invalidateQueries({ queryKey: ["messages", selectedId] });
  }

  async function toggleStar(m: Message) {
    const { error } = await supabase
      .from("messages")
      .update({ starred_at: m.starred_at ? null : new Date().toISOString() })
      .eq("id", m.id);
    if (error) {
      toast.error("Não foi possível favoritar/desfavoritar.");
      return;
    }
    if (selectedId) queryClient.invalidateQueries({ queryKey: ["messages", selectedId] });
  }

  function scrollToMessage(id: string) {
    document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // ----- Encaminhar (F.4a) -----
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [fwdSearch, setFwdSearch] = useState("");
  const [fwdResults, setFwdResults] = useState<{ id: string; name: string | null; external_id: string }[]>([]);
  const [forwarding, setForwarding] = useState(false);

  // Nova conversa (iniciar atendimento a partir de um contato).
  const [newConvOpen, setNewConvOpen] = useState(false);
  const [newConvSearch, setNewConvSearch] = useState("");
  const [newConvResults, setNewConvResults] = useState<{ id: string; name: string | null; external_id: string }[]>([]);
  const [newConvStarting, setNewConvStarting] = useState(false);
  const [newConvAdding, setNewConvAdding] = useState(false);
  const [ncName, setNcName] = useState("");
  const [ncPhone, setNcPhone] = useState("");
  const [ncError, setNcError] = useState<string | null>(null);
  const [ncSaving, setNcSaving] = useState(false);

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
        toast.error("Nenhum canal WhatsApp conectado.");
        return;
      }
      const m = forwardMsg;
      if (m.media_url) {
        const { data: blob, error: dErr } = await supabase.storage.from("media").download(m.media_url);
        if (dErr || !blob) {
          toast.error("Não foi possível baixar o anexo para encaminhar.");
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
          toast.error("Não foi possível encaminhar o anexo.");
          return;
        }
      } else if (m.content) {
        const { error: sErr } = await supabase.functions.invoke("send-message", {
          body: { conversationId: convId, text: m.content },
        });
        if (sErr) {
          toast.error("Não foi possível encaminhar.");
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

  // Busca de contatos para a janela "Nova conversa" (debounce).
  useEffect(() => {
    if (!newConvOpen || !orgId) return;
    let active = true;
    const t = setTimeout(async () => {
      let q = supabase
        .from("contacts")
        .select("id, name, external_id")
        .eq("is_group", false)
        .order("name", { ascending: true })
        .limit(20);
      const term = newConvSearch.trim();
      if (term) q = q.or(`name.ilike.%${term}%,external_id.ilike.%${term}%`);
      const { data } = await q;
      if (active) setNewConvResults((data ?? []) as { id: string; name: string | null; external_id: string }[]);
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [newConvSearch, newConvOpen, orgId]);

  function openNewConv() {
    setNewConvSearch("");
    setNewConvResults([]);
    setNewConvAdding(false);
    setNcName("");
    setNcPhone("");
    setNcError(null);
    setNewConvOpen(true);
  }

  // Abre (ou cria) a conversa do contato e seleciona na tela.
  async function startConversationWithContact(contactId: string) {
    setNewConvStarting(true);
    try {
      const convId = await resolveConversation(contactId);
      if (!convId) {
        toast.error("Nenhum canal WhatsApp conectado.");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setSelectedId(convId);
      setNewConvOpen(false);
      setNewConvSearch("");
      setNewConvAdding(false);
    } finally {
      setNewConvStarting(false);
    }
  }

  // Cria o contato (mesmo padrão da tela de Contatos) e já abre a conversa.
  async function createContactAndStart() {
    setNcError(null);
    const telefone = ncPhone.replace(/\D/g, "");
    if (telefone.length < 10) {
      setNcError("Número inválido. Use o código do país (ex.: 5547999998888).");
      return;
    }
    if (!orgId) {
      setNcError("Sem empresa vinculada.");
      return;
    }
    setNcSaving(true);
    const nome = ncName.trim();
    const { data, error } = await supabase
      .from("contacts")
      .upsert(
        {
          org_id: orgId,
          channel_type: "whatsapp_baileys",
          external_id: telefone,
          name: nome || null,
          name_locked: nome.length > 0,
        },
        { onConflict: "org_id,channel_type,external_id" },
      )
      .select("id")
      .single();
    setNcSaving(false);
    if (error || !data) {
      setNcError("Não foi possível salvar o contato.");
      return;
    }
    setNcName("");
    setNcPhone("");
    setNewConvAdding(false);
    await startConversationWithContact(data.id);
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* Lista de conversas */}
      {/* Bloco O — Camadas (estilo WhatsApp) até 1024px: a lista ocupa a tela
          toda e some quando há conversa aberta. A partir de 1024px (lg) volta
          a ser a coluna fixa de 320px, sempre visível ao lado da conversa. */}
      <aside
        className={`${
          selected ? "hidden lg:flex" : "flex"
        } w-full shrink-0 flex-col overflow-hidden border-r border-border bg-card lg:w-[320px]`}
      >
        <div className="shrink-0 border-b border-border">
          <div className="flex h-14 items-center gap-2 px-3 md:px-4">
            <SidebarTrigger className="md:hidden" />
            <h2 className="text-base font-semibold text-foreground">Conversas</h2>
            <button
              type="button"
              onClick={openNewConv}
              title="Nova conversa"
              aria-label="Nova conversa"
              className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus size={18} />
            </button>
          </div>
          <div className="px-3 pb-3">
            <div className="relative">
              <Search
                size={15}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                value={convSearch}
                onChange={(e) => setConvSearch(e.target.value)}
                placeholder="Buscar conversa…"
                className="w-full rounded-lg border border-gray-300 py-2 pl-8 pr-8 text-sm focus:border-brand-blue focus:outline-none"
              />
              {convSearch && (
                <button
                  onClick={() => setConvSearch("")}
                  title="Limpar busca"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
          {/* Bloco M — abas com contadores */}
          <div className="flex gap-1 px-3 pb-3">
            {(
              [
                ["minhas", "Minhas", counts.minhas],
                ["aguardando", "Aguardando", counts.aguardando],
                ["todas", "Todas", counts.todas],
              ] as const
            ).map(([key, label, n]) => {
              const isActive = tab === key;
              return (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                    isActive ? "bg-brand-blue text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  <span>{label}</span>
                  <span
                    className={`rounded-full px-1.5 text-[10px] font-semibold ${
                      isActive ? "bg-white/25 text-white" : "bg-gray-200 text-gray-600"
                    }`}
                  >
                    {n}
                  </span>
                </button>
              );
            })}
          </div>
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
          {!isLoading && visibleConvs.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-gray-500">
              {convSearch.trim()
                ? "Nenhuma conversa encontrada"
                : tab === "aguardando"
                  ? "Nenhuma conversa aguardando"
                  : tab === "minhas"
                    ? "Você não está atendendo nenhuma conversa"
                    : "Nenhuma conversa ainda"}
            </p>
          )}
          {!isLoading &&
            visibleConvs.map((c) => {
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
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            c.assigned_user_id ? "bg-sky-100 text-sky-800" : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {c.assigned_user_id ? "Em atendimento" : "Aguardando"}
                        </span>
                        {c.department?.name && (
                          <span className="shrink-0 truncate rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                            {c.department.name}
                          </span>
                        )}
                        {c.contact?.is_group && (
                          <span className="shrink-0 rounded bg-brand-blue/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-blue">
                            Grupo
                          </span>
                        )}
                        <span className="truncate text-[11px] text-gray-500">{c.channel?.name ?? ""}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {!c.assigned_user_id && (
                          <span
                            role="button"
                            tabIndex={0}
                            title="Aceitar (assumir o atendimento)"
                            onClick={(e) => {
                              e.stopPropagation();
                              acceptConversation(c.id);
                            }}
                            className="rounded-full bg-brand-green px-2 py-0.5 text-[11px] font-semibold text-white hover:opacity-90"
                          >
                            Aceitar
                          </span>
                        )}
                        {unread && (
                          <span className="rounded-full bg-brand-green px-2 text-xs font-semibold text-white">
                            {c.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
        </div>
      </aside>

      {/* Painel da conversa */}
      {/* Bloco O — Camadas até 1024px: o painel da conversa só aparece quando
          há uma conversa selecionada (senão a lista ocupa a tela). A partir de
          1024px (lg) ele fica sempre visível, ao lado da lista. */}
      <section className={`${selected ? "flex" : "hidden lg:flex"} min-w-0 flex-1 flex-col overflow-hidden bg-gray-50 dark:bg-background`}>
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <Logo variant="horizontal" className="h-14 w-auto opacity-40" />
            <p className="text-sm text-gray-400">Selecione uma conversa</p>
          </div>
        ) : (
          <>
            <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                {/* Bloco O — Camadas (até 1024px): voltar para a lista.
                    A partir de 1024px (lg) a lista fica ao lado, então some. */}
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="-ml-1 shrink-0 rounded-lg p-1 text-gray-600 hover:bg-gray-100 lg:hidden"
                  title="Voltar para a lista"
                  aria-label="Voltar"
                >
                  <ChevronLeft size={20} />
                </button>
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
                <div className="hidden items-center gap-2 lg:flex">
                <button
                  onClick={() => setShowStarredOnly((v) => !v)}
                  title={showStarredOnly ? "Mostrar todas" : "Mostrar só favoritas"}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg border ${showStarredOnly ? "border-amber-300 bg-amber-50 text-amber-600" : "border-gray-300 text-gray-500 hover:bg-gray-50"}`}
                >
                  <Star size={16} className={showStarredOnly ? "fill-amber-400 text-amber-400" : ""} />
                </button>
                <button
                  onClick={async () => {
                    if (!selectedId) return;
                    await supabase.from("conversations").update({ unread_count: 1 }).eq("id", selectedId);
                    setSelectedId(null);
                    queryClient.invalidateQueries({ queryKey: ["conversations"] });
                  }}
                  title="Marcar como não lida"
                  className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                >
                  <Mail size={16} /> <span className="hidden lg:inline">Marcar como não lida</span>
                </button>
                <button
                  onClick={openTransfer}
                  title="Transferir esta conversa para outro atendente ou departamento"
                  className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                >
                  <ArrowRightLeft size={16} /> <span className="hidden lg:inline">Transferir</span>
                </button>
                {selected.assigned_user_id && selected.assigned_user_id === user?.id ? (
                  <button
                    onClick={() => assignConversation(null)}
                    title="Você está atendendo — clique para liberar"
                    className="flex items-center gap-1.5 rounded-lg border border-brand-green/40 bg-brand-green/10 px-2.5 py-1.5 text-sm font-medium text-brand-green hover:bg-brand-green/20"
                  >
                    <Check size={16} /> <span className="hidden lg:inline">Você está atendendo</span>
                  </button>
                ) : selected.assigned_user_id ? (
                  <button
                    onClick={() => assignConversation(user?.id ?? null)}
                    title="Em atendimento por outro usuário — clique para assumir"
                    className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100"
                  >
                    <Check size={16} /> <span className="hidden lg:inline">Assumir atendimento</span>
                  </button>
                ) : (
                  <button
                    onClick={() => assignConversation(user?.id ?? null)}
                    title="Atender esta conversa"
                    className="flex items-center gap-1.5 rounded-lg bg-brand-green px-2.5 py-1.5 text-sm font-medium text-brand-green-foreground transition-colors hover:bg-brand-green/90"
                  >
                    <Check size={16} /> <span className="hidden lg:inline">Atender</span>
                  </button>
                )}
                </div>
                <div className="lg:hidden">
                  <Popover open={headerMenuOpen} onOpenChange={setHeaderMenuOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        title="Mais opções"
                        aria-label="Mais opções"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
                      >
                        <MoreVertical size={18} />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-60 p-1">
                      <button
                        type="button"
                        onClick={() => {
                          setShowStarredOnly((v) => !v);
                          setHeaderMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        <Star size={15} className={showStarredOnly ? "fill-amber-400 text-amber-400" : ""} />
                        {showStarredOnly ? "Mostrar todas" : "Só favoritas"}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!selectedId) return;
                          await supabase.from("conversations").update({ unread_count: 1 }).eq("id", selectedId);
                          setSelectedId(null);
                          setHeaderMenuOpen(false);
                          queryClient.invalidateQueries({ queryKey: ["conversations"] });
                        }}
                        className="flex w-full items-center gap-2 rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        <Mail size={15} /> Marcar como não lida
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          openTransfer();
                          setHeaderMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        <ArrowRightLeft size={15} /> Transferir
                      </button>
                      <div className="my-1 border-t border-gray-100" />
                      {selected.assigned_user_id && selected.assigned_user_id === user?.id ? (
                        <button
                          type="button"
                          onClick={() => {
                            assignConversation(null);
                            setHeaderMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2 rounded px-2 py-2 text-sm font-medium text-brand-green hover:bg-brand-green/10"
                        >
                          <Check size={15} /> Você está atendendo (liberar)
                        </button>
                      ) : selected.assigned_user_id ? (
                        <button
                          type="button"
                          onClick={() => {
                            assignConversation(user?.id ?? null);
                            setHeaderMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2 rounded px-2 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50"
                        >
                          <Check size={15} /> Assumir atendimento
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            assignConversation(user?.id ?? null);
                            setHeaderMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2 rounded px-2 py-2 text-sm font-medium text-brand-green hover:bg-brand-green/10"
                        >
                          <Check size={15} /> Atender
                        </button>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </header>

            {(messages ?? []).some((x) => x.pinned_at && !x.deleted_at) && (
              <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5">
                {(messages ?? [])
                  .filter((x) => x.pinned_at && !x.deleted_at)
                  .map((x) => (
                    <div key={x.id} className="flex items-center gap-2 py-0.5">
                      <Pin size={13} className="shrink-0 text-amber-600" />
                      <button
                        onClick={() => scrollToMessage(x.id)}
                        className="min-w-0 flex-1 truncate text-left text-xs text-gray-700 hover:underline"
                        title="Ir até a mensagem"
                      >
                        {x.direction === "outbound" ? "Você: " : ""}
                        {contentLabel(x.content_type, x.content)}
                      </button>
                      <button
                        onClick={() => togglePin(x)}
                        className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-amber-100 hover:text-gray-600"
                        title="Desafixar"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
              </div>
            )}

            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {loadingMsgs && <p className="text-center text-sm text-gray-500">Carregando…</p>}
              {!loadingMsgs &&
                renderMessages.map((m, idx, arr) => {
                  const out = m.direction === "outbound";
                  // Bloco N — "aviso de sistema" (ex.: transferência): gravado como
                  // mensagem de texto com external_message_id = "system:transfer".
                  // Mostramos centralizado/cinza, não como bolha de conversa.
                  if (m.external_message_id === "system:transfer") {
                    return (
                      <div key={m.id} className="my-2 flex justify-center">
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-center text-[11px] font-medium text-gray-500">
                          {m.content}
                        </span>
                      </div>
                    );
                  }
                  // H.3a — separador de data quando muda o dia em relação à mensagem anterior.
                  const showDateSep = idx === 0 || ymd(arr[idx - 1].created_at) !== ymd(m.created_at);
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
                    <Fragment key={m.id}>
                      {showDateSep && (
                        <div className="my-3 flex justify-center">
                          <span className="rounded-full bg-gray-200/80 px-3 py-1 text-[11px] font-medium text-gray-600">
                            {dayLabel(m.created_at)}
                          </span>
                        </div>
                      )}
                      <div
                        id={`msg-${m.id}`}
                        className={`group mb-2 flex items-center gap-1 ${out ? "justify-end" : "justify-start"}`}
                      >
                        {out && !m.deleted_at && !m._optimistic && (
                          <MessageActions
                            mine={m.reactions?.["me"] ?? null}
                            canReact={!!m.external_message_id}
                            canCopy={!!m.content}
                            canReply={!!m.external_message_id}
                            canDelete={out && !!m.external_message_id}
                            canForward={!!(m.content || m.media_url)}
                            pinned={!!m.pinned_at}
                            starred={!!m.starred_at}
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
                            onPin={() => togglePin(m)}
                            onStar={() => toggleStar(m)}
                          />
                        )}
                        <div
                          onClick={m._optimistic && m.status === "failed" ? () => resendOptimistic(m) : undefined}
                          title={
                            m._optimistic && m.status === "failed" ? "Falha no envio — toque para reenviar" : undefined
                          }
                          className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm ${out ? "bg-primary text-primary-foreground" : "border border-gray-200 bg-white text-gray-900"} ${m._optimistic && m.status === "failed" ? "cursor-pointer ring-1 ring-red-300" : ""} ${m._optimistic && m.status === "queued" ? "opacity-80" : ""}`}
                        >
                          {!m.deleted_at && m.reply_to_external_id && (
                            <div
                              className={`mb-1 rounded-md border-l-2 px-2 py-1 text-[11px] ${out ? "border-white/60 bg-white/15" : "border-brand-blue/50 bg-gray-50 dark:bg-background"}`}
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
                          {!m.deleted_at && out && m.sender_user_id && memberNames[m.sender_user_id] && (
                            <p className="mb-0.5 text-[11px] font-semibold text-primary-foreground/90">
                              {memberNames[m.sender_user_id]}
                            </p>
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
                          <p
                            className={`mt-1 flex items-center gap-1 text-[10px] ${out ? "justify-end text-primary-foreground/70" : "justify-start text-gray-500"}`}
                          >
                            {!m.deleted_at && m.starred_at && (
                              <Star size={11} className="fill-amber-400 text-amber-400" />
                            )}
                            {hhmm(m.created_at)}
                            {out && !m.deleted_at && <StatusTicks status={m.status} />}
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
                            pinned={!!m.pinned_at}
                            starred={!!m.starred_at}
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
                            onPin={() => togglePin(m)}
                            onStar={() => toggleStar(m)}
                          />
                        )}
                      </div>
                    </Fragment>
                  );
                })}
              {!loadingMsgs && showStarredOnly && (messages ?? []).filter((m) => m.starred_at).length === 0 && (
                <p className="mt-6 text-center text-sm text-gray-400">Nenhuma mensagem favoritada nesta conversa.</p>
              )}
            </div>

            <div className="relative border-t border-gray-200 bg-white px-4 py-3">
              {replyTo && (
                <div className="mb-2 flex items-start gap-2 rounded-md border-l-2 border-brand-blue/60 bg-gray-50 dark:bg-background px-2 py-1.5">
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
                {/* CELULAR (< lg): botão "+" com Emoji + Anexar */}
                <Popover
                  open={plusOpen}
                  onOpenChange={(o) => {
                    setPlusOpen(o);
                    if (!o) setPlusShowEmoji(false);
                  }}
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      disabled={sendingMedia}
                      title="Mais"
                      className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 lg:hidden"
                    >
                      <Plus size={20} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="top" align="start" className="w-auto p-2">
                    {plusShowEmoji ? (
                      <EmojiPicker
                        onEmojiClick={(emojiData: EmojiClickData) => {
                          const textarea = textareaRef.current;
                          const start = textarea ? textarea.selectionStart : draft.length;
                          const end = textarea ? textarea.selectionEnd : draft.length;
                          const newValue = draft.slice(0, start) + emojiData.emoji + draft.slice(end);
                          setDraft(newValue);
                          setPendingCursor(start + emojiData.emoji.length);
                          setPlusOpen(false);
                          setPlusShowEmoji(false);
                        }}
                        height={350}
                        width={300}
                        lazyLoadEmojis
                        previewConfig={{ showPreview: false }}
                      />
                    ) : (
                      <div className="flex flex-col">
                        <button
                          type="button"
                          onClick={() => setPlusShowEmoji(true)}
                          className="flex w-full items-center gap-2 rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          <Smile size={16} /> Emoji
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPlusOpen(false);
                            fileInputRef.current?.click();
                          }}
                          className="flex w-full items-center gap-2 rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          <Paperclip size={16} /> Anexar
                        </button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>

                {/* input de arquivo escondido (compartilhado por "+" do celular e clipe do desktop) */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,application/pdf"
                  className="hidden"
                  onChange={handleFileSelected}
                />

                {/* DESKTOP (>= lg): clipe */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sendingMedia}
                  className="mb-0.5 hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 lg:flex"
                >
                  <Paperclip size={18} />
                </button>

                {/* DESKTOP (>= lg): microfone OU controles de gravação */}
                {!recording ? (
                  <button
                    type="button"
                    onClick={startRecording}
                    disabled={sendingAudio}
                    className="mb-0.5 hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 lg:flex"
                  >
                    <Mic size={18} />
                  </button>
                ) : (
                  <div className="mb-0.5 hidden shrink-0 items-center gap-2 lg:flex">
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

                {/* DESKTOP (>= lg): emoji */}
                <Popover open={openEmoji} onOpenChange={setOpenEmoji}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="mb-0.5 hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 lg:flex"
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

                {/* Campo de texto (compartilhado celular + desktop) */}
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
                  className="max-h-32 min-h-[40px] flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring lg:text-sm"
                />

                {/* CELULAR (< lg): gravação / aviãozinho (com texto) / microfone (sem texto) */}
                {recording ? (
                  <div className="mb-0.5 flex shrink-0 items-center gap-2 lg:hidden">
                    <button
                      type="button"
                      onClick={stopAndSend}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-green-600 text-white hover:bg-green-700"
                      title="Enviar áudio"
                      aria-label="Enviar áudio"
                    >
                      <Square size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={cancelRecording}
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50"
                      title="Cancelar"
                      aria-label="Cancelar gravação"
                    >
                      <X size={18} />
                    </button>
                  </div>
                ) : draft.trim() ? (
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={sending}
                    title="Enviar"
                    aria-label="Enviar"
                    className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 lg:hidden"
                  >
                    <Send size={18} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startRecording}
                    disabled={sendingAudio}
                    title="Gravar áudio"
                    aria-label="Gravar áudio"
                    className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 lg:hidden"
                  >
                    <Mic size={18} />
                  </button>
                )}

                {/* DESKTOP (>= lg): botão Enviar (texto) */}
                <button
                  onClick={handleSend}
                  disabled={!draft.trim() || sending}
                  className="hidden rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 lg:block"
                >
                  {sending ? "Enviando…" : "Enviar"}
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {selected && showContactPanel && contact && (
        // Bloco O — "Dados do contato": tela cheia por cima (fixed inset-0) com
        // o X para voltar — estilo WhatsApp — em telas até 1280px. A partir de
        // 1280px (xl) vira a coluna lateral de 340px ao lado da conversa.
        <aside className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-card xl:relative xl:inset-auto xl:z-auto xl:w-[340px] xl:shrink-0 xl:border-l xl:border-border">
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
                    className="mt-1 w-full rounded border border-gray-200 bg-gray-50 dark:bg-background px-2 py-1.5 text-sm text-gray-500"
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
                    className="mt-1 w-full rounded border border-gray-200 bg-gray-50 dark:bg-background px-2 py-1.5 text-[11px] text-gray-500"
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
              <ConversationCrmCard conversationId={selected.id} contactId={contact.id} orgId={orgId} />
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

      {/* Bloco N — Modal de transferência */}
      {transferOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !transferring && setTransferOpen(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-sm flex-col overflow-hidden rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-900">Transferir conversa</h3>
              <button
                onClick={() => !transferring && setTransferOpen(false)}
                className="rounded p-1 text-gray-500 hover:bg-gray-100"
                title="Fechar"
              >
                <X size={16} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              {/* Escolha do tipo de transferência */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTransferMode("department")}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium ${
                    transferMode === "department"
                      ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                      : "border-gray-300 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Building2 size={15} /> Departamento
                </button>
                <button
                  type="button"
                  onClick={() => setTransferMode("user")}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium ${
                    transferMode === "user"
                      ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                      : "border-gray-300 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Users size={15} /> Atendente
                </button>
              </div>

              {/* Modo DEPARTAMENTO */}
              {transferMode === "department" && (
                <div>
                  <label className="text-xs font-medium text-gray-600">Departamento de destino</label>
                  {deptsQuery.isLoading ? (
                    <p className="mt-1 text-sm text-gray-400">Carregando…</p>
                  ) : deptList.length === 0 ? (
                    <p className="mt-1 text-sm text-gray-400">
                      Nenhum departamento cadastrado. Crie um em Configurações &gt; Departamentos.
                    </p>
                  ) : (
                    <select
                      value={transferDeptId}
                      onChange={(e) => setTransferDeptId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-blue focus:outline-none"
                    >
                      <option value="">Selecione…</option>
                      {deptList.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <p className="mt-1.5 text-xs text-gray-500">
                    A conversa volta para a fila <span className="font-medium">Aguardando</span> deste setor (sem
                    atendente), e qualquer pessoa do departamento pode aceitá-la.
                  </p>
                </div>
              )}

              {/* Modo ATENDENTE */}
              {transferMode === "user" && (
                <>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Atendente de destino</label>
                    {teamQuery.isLoading ? (
                      <p className="mt-1 text-sm text-gray-400">Carregando…</p>
                    ) : teamList.length === 0 ? (
                      <p className="mt-1 text-sm text-gray-400">Nenhum outro atendente disponível.</p>
                    ) : (
                      <select
                        value={transferUserId}
                        onChange={(e) => setTransferUserId(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-blue focus:outline-none"
                      >
                        <option value="">Selecione…</option>
                        {teamList.map((u) => (
                          <option key={u.user_id} value={u.user_id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Departamento (opcional)</label>
                    <select
                      value={transferDeptId}
                      onChange={(e) => setTransferDeptId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-blue focus:outline-none"
                    >
                      <option value="">Manter o atual</option>
                      {deptList.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1.5 text-xs text-gray-500">
                      A conversa cai direto em <span className="font-medium">Minhas</span> do atendente escolhido.
                    </p>
                  </div>
                </>
              )}

              {/* Motivo opcional */}
              <div>
                <label className="text-xs font-medium text-gray-600">Motivo (opcional)</label>
                <textarea
                  value={transferNote}
                  onChange={(e) => setTransferNote(e.target.value)}
                  rows={2}
                  placeholder="Ex.: cliente quer falar com o financeiro."
                  className="mt-1 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-blue focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-100 px-4 py-3">
              <button
                onClick={() => !transferring && setTransferOpen(false)}
                disabled={transferring}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={doTransfer}
                disabled={transferring}
                className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {transferring ? "Transferindo…" : "Transferir"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* H.3a — Pré-visualização da mídia + legenda antes de enviar */}
      {pendingMedia && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !sendingMedia && closePendingMedia()}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-900">Enviar arquivo</h3>
              <button
                onClick={() => !sendingMedia && closePendingMedia()}
                className="rounded p-1 text-gray-500 hover:bg-gray-100"
                title="Fechar"
              >
                <X size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {pendingMedia.url ? (
                <img
                  src={pendingMedia.url}
                  alt={pendingMedia.file.name}
                  className="mx-auto max-h-[45vh] rounded-lg object-contain"
                />
              ) : (
                <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 dark:bg-background px-3 py-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-200 text-gray-600">
                    <FileIcon size={20} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">{pendingMedia.file.name}</p>
                    <p className="text-xs text-gray-500">{formatBytes(pendingMedia.file.size)}</p>
                  </div>
                </div>
              )}
            </div>
            <div className="border-t border-gray-100 p-3">
              <input
                value={pendingMedia.caption}
                onChange={(e) => setPendingMedia((p) => (p ? { ...p, caption: e.target.value } : p))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !sendingMedia) confirmSendMedia();
                }}
                placeholder="Adicionar uma legenda…"
                autoFocus
                className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-blue focus:outline-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => !sendingMedia && closePendingMedia()}
                  className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmSendMedia}
                  disabled={sendingMedia}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {sendingMedia ? "Enviando…" : "Enviar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
