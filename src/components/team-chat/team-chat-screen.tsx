import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft,
  Download,
  MessagesSquare,
  Paperclip,
  Plus,
  Reply,
  Search,
  Send,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  createInternalChat,
  describeChat,
  getAttachmentUrl,
  markChatRead,
  memberInitials,
  memberName,
  sendInternalMessage,
  uploadInternalAttachment,
  useInternalChats,
  useInternalMessages,
  useOnlineUsers,
  useOrgMembers,
  useTeamChatRealtime,
  type ChatListItem,
  type InternalMessage,
  type MemberProfile,
} from "@/components/team-chat/use-team-chat";

// Avatar com bolinha de presença (verde = online).
function PersonAvatar({
  member,
  online,
  className = "h-10 w-10",
}: {
  member?: MemberProfile | null;
  online?: boolean;
  className?: string;
}) {
  return (
    <div className="relative shrink-0">
      <Avatar className={className}>
        <AvatarImage src={member?.avatar_url ?? undefined} alt={member ? memberName(member) : ""} />
        <AvatarFallback className="text-xs">
          {member ? memberInitials(member) : "?"}
        </AvatarFallback>
      </Avatar>
      {online && (
        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background bg-brand-green" />
      )}
    </div>
  );
}

// Anexo: imagem inline ou chip de download (URL assinada do bucket privado).
function Attachment({ path, name, type }: { path: string; name: string | null; type: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    getAttachmentUrl(path).then((u) => {
      if (active) setUrl(u);
    });
    return () => {
      active = false;
    };
  }, [path]);

  const isImage = (type ?? "").startsWith("image/");
  if (isImage) {
    return url ? (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={name ?? ""} className="max-h-60 rounded-lg object-cover" />
      </a>
    ) : (
      <div className="h-40 w-40 animate-pulse rounded-lg bg-muted" />
    );
  }
  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 rounded-lg border bg-background/60 px-3 py-2 text-sm hover:bg-background"
    >
      <Download className="h-4 w-4 shrink-0" />
      <span className="truncate">{name ?? "Arquivo"}</span>
    </a>
  );
}

export function TeamChatScreen() {
  const queryClient = useQueryClient();
  const { user, activeMembership } = useCurrentUser();
  const myId = user?.id ?? null;
  const orgId = activeMembership?.org_id ?? null;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composer, setComposer] = useState("");
  const [replyTo, setReplyTo] = useState<InternalMessage | null>(null);
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useTeamChatRealtime(orgId);
  const online = useOnlineUsers(orgId, myId);
  const chatsQuery = useInternalChats(orgId, myId);
  const messagesQuery = useInternalMessages(selectedId);

  const chats = chatsQuery.data ?? [];
  const messages = messagesQuery.data ?? [];
  const selected = chats.find((c) => c.chat.id === selectedId) ?? null;

  // Mapa userId -> participante da conversa aberta (para nome do remetente).
  const memberById = useMemo(() => {
    const map = new Map<string, MemberProfile>();
    if (selected) for (const m of selected.members) map.set(m.user_id, m);
    return map;
  }, [selected]);

  const filteredChats = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !myId) return chats;
    return chats.filter((c) => describeChat(c, myId).title.toLowerCase().includes(q));
  }, [chats, search, myId]);

  // Rola para a última mensagem.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, selectedId]);

  const refreshLists = () => {
    queryClient.invalidateQueries({ queryKey: ["internal-chats"] });
    if (selectedId) queryClient.invalidateQueries({ queryKey: ["internal-messages", selectedId] });
  };

  async function openChat(item: ChatListItem) {
    setSelectedId(item.chat.id);
    setReplyTo(null);
    if (myId && item.unread > 0) {
      try {
        await markChatRead(item.chat.id, myId);
        queryClient.invalidateQueries({ queryKey: ["internal-chats"] });
      } catch {
        /* não crítico */
      }
    }
  }

  async function handleSend() {
    const text = composer.trim();
    if (!text || !selected || !myId || !orgId) return;
    setComposer("");
    const reply = replyTo;
    setReplyTo(null);
    try {
      await sendInternalMessage({
        chatId: selected.chat.id,
        orgId,
        senderId: myId,
        content: text,
        replyToId: reply?.id ?? null,
      });
      refreshLists();
    } catch {
      setComposer(text);
      toast.error("Não foi possível enviar a mensagem.");
    }
  }

  async function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selected || !myId || !orgId) return;
    setBusy(true);
    try {
      const up = await uploadInternalAttachment(orgId, selected.chat.id, file);
      await sendInternalMessage({
        chatId: selected.chat.id,
        orgId,
        senderId: myId,
        mediaPath: up.path,
        mediaName: up.name,
        mediaType: up.type,
        replyToId: replyTo?.id ?? null,
      });
      setReplyTo(null);
      refreshLists();
    } catch {
      toast.error("Falha ao enviar o anexo.");
    } finally {
      setBusy(false);
    }
  }

  async function startDirect(memberId: string) {
    setBusy(true);
    try {
      const id = await createInternalChat([memberId], false, null);
      setNewOpen(false);
      queryClient.invalidateQueries({ queryKey: ["internal-chats"] });
      setSelectedId(id);
    } catch {
      toast.error("Não foi possível abrir a conversa.");
    } finally {
      setBusy(false);
    }
  }

  async function createGroup(name: string, memberIds: string[]) {
    setBusy(true);
    try {
      const id = await createInternalChat(memberIds, true, name);
      setNewOpen(false);
      queryClient.invalidateQueries({ queryKey: ["internal-chats"] });
      setSelectedId(id);
    } catch {
      toast.error("Não foi possível criar o grupo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full overflow-hidden rounded-lg border bg-card">
      {/* ----- Lista de conversas ----- */}
      <aside
        className={`${selectedId ? "hidden md:flex" : "flex"} w-full flex-col border-r md:w-80`}
      >
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <MessagesSquare className="h-4 w-4 text-brand-green" />
            Chat interno
          </h2>
          <Dialog open={newOpen} onOpenChange={setNewOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8 gap-1">
                <Plus className="h-4 w-4" />
                Novo
              </Button>
            </DialogTrigger>
            <NewChatDialog
              orgId={orgId}
              myId={myId}
              busy={busy}
              onStartDirect={startDirect}
              onCreateGroup={createGroup}
            />
          </Dialog>
        </div>

        <div className="border-b px-3 py-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar conversa…"
              className="h-9 pl-8"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {chatsQuery.isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Carregando…</p>
          ) : filteredChats.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              Nenhuma conversa ainda. Clique em <b>Novo</b> para falar com um colega.
            </p>
          ) : (
            filteredChats.map((item) => {
              if (!myId) return null;
              const d = describeChat(item, myId);
              const other = !d.isGroup ? d.other : undefined;
              const isOnline = !d.isGroup && other ? online.has(other.user_id) : false;
              const isActive = item.chat.id === selectedId;
              return (
                <button
                  key={item.chat.id}
                  type="button"
                  onClick={() => openChat(item)}
                  className={`flex w-full items-center gap-3 border-b px-3 py-2.5 text-left hover:bg-muted/60 ${
                    isActive ? "bg-muted" : ""
                  }`}
                >
                  {d.isGroup ? (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-text">
                      <Users className="h-5 w-5" />
                    </div>
                  ) : (
                    <PersonAvatar member={other} online={isOnline} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{d.title}</span>
                      {item.chat.last_message_at && (
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {format(new Date(item.chat.last_message_at), "HH:mm")}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-muted-foreground">
                        {item.chat.last_message_preview ?? "—"}
                      </span>
                      {item.unread > 0 && (
                        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-green px-1.5 text-[10px] font-semibold text-white">
                          {item.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ----- Painel da conversa ----- */}
      <section className={`${selectedId ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <MessagesSquare className="h-10 w-10 opacity-40" />
            <p className="text-sm">Selecione uma conversa para começar.</p>
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b px-4 py-3">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setSelectedId(null)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              {(() => {
                if (!myId) return null;
                const d = describeChat(selected, myId);
                if (d.isGroup) {
                  return (
                    <>
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-brand-text">
                        <Users className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{d.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {selected.members.length} participantes
                        </p>
                      </div>
                    </>
                  );
                }
                const isOnline = d.other ? online.has(d.other.user_id) : false;
                return (
                  <>
                    <PersonAvatar member={d.other} online={isOnline} className="h-9 w-9" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{d.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {isOnline ? "online" : "offline"}
                      </p>
                    </div>
                  </>
                );
              })()}
            </header>

            <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-muted/30 p-4">
              {messages.map((m) => {
                const mine = m.sender_user_id === myId;
                const sender = memberById.get(m.sender_user_id);
                const repliedTo = m.reply_to_id
                  ? messages.find((x) => x.id === m.reply_to_id)
                  : null;
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`group max-w-[78%] rounded-2xl px-3 py-2 text-sm ${
                        mine
                          ? "rounded-br-sm bg-brand-green text-white"
                          : "rounded-bl-sm bg-card shadow-sm"
                      }`}
                    >
                      {selected.chat.is_group && !mine && (
                        <p className="mb-0.5 text-xs font-semibold text-brand-text">
                          {sender ? memberName(sender) : "Colega"}
                        </p>
                      )}
                      {repliedTo && (
                        <div
                          className={`mb-1 rounded-md border-l-2 px-2 py-1 text-xs ${
                            mine ? "border-white/60 bg-white/15" : "border-brand-green bg-muted"
                          }`}
                        >
                          {repliedTo.content ?? repliedTo.media_name ?? "Anexo"}
                        </div>
                      )}
                      {m.media_path && (
                        <div className="mb-1">
                          <Attachment path={m.media_path} name={m.media_name} type={m.media_type} />
                        </div>
                      )}
                      {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                      <div
                        className={`mt-0.5 flex items-center justify-end gap-2 text-[10px] ${
                          mine ? "text-white/70" : "text-muted-foreground"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setReplyTo(m)}
                          className="opacity-0 transition group-hover:opacity-100"
                          title="Responder"
                        >
                          <Reply className="h-3 w-3" />
                        </button>
                        <span>{format(new Date(m.created_at), "HH:mm")}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Composer */}
            <div className="border-t p-3">
              {replyTo && (
                <div className="mb-2 flex items-center gap-2 rounded-md border-l-2 border-brand-green bg-muted px-2 py-1 text-xs">
                  <Reply className="h-3 w-3 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">
                    {replyTo.content ?? replyTo.media_name ?? "Anexo"}
                  </span>
                  <button type="button" onClick={() => setReplyTo(null)}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2">
                <input ref={fileRef} type="file" className="hidden" onChange={handlePickFile} />
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                  title="Anexar arquivo"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Textarea
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  placeholder="Escreva uma mensagem…"
                  className="max-h-32 min-h-10 flex-1 resize-none"
                  rows={1}
                />
                <Button
                  size="icon"
                  className="shrink-0"
                  disabled={!composer.trim() || busy}
                  onClick={() => void handleSend()}
                  title="Enviar"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

// ---- Diálogo "Novo" (Pessoa / Grupo) ---------------------------------------

function NewChatDialog({
  orgId,
  myId,
  busy,
  onStartDirect,
  onCreateGroup,
}: {
  orgId: string | null;
  myId: string | null;
  busy: boolean;
  onStartDirect: (memberId: string) => void;
  onCreateGroup: (name: string, memberIds: string[]) => void;
}) {
  const membersQuery = useOrgMembers(orgId);
  const colleagues = (membersQuery.data ?? []).filter((m) => m.user_id !== myId);

  const [groupName, setGroupName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const togglePick = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Nova conversa</DialogTitle>
      </DialogHeader>
      <Tabs defaultValue="pessoa">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="pessoa">Pessoa</TabsTrigger>
          <TabsTrigger value="grupo">Grupo</TabsTrigger>
        </TabsList>

        <TabsContent value="pessoa" className="mt-3">
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {colleagues.length === 0 ? (
              <p className="p-2 text-sm text-muted-foreground">Nenhum colega na empresa.</p>
            ) : (
              colleagues.map((m) => (
                <button
                  key={m.user_id}
                  type="button"
                  disabled={busy}
                  onClick={() => onStartDirect(m.user_id)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted disabled:opacity-50"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={m.avatar_url ?? undefined} alt={memberName(m)} />
                    <AvatarFallback className="text-xs">{memberInitials(m)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{memberName(m)}</p>
                    {m.email && <p className="truncate text-xs text-muted-foreground">{m.email}</p>}
                  </div>
                </button>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="grupo" className="mt-3 space-y-3">
          <Input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Nome do grupo"
          />
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-1">
            {colleagues.map((m) => (
              <label
                key={m.user_id}
                className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted"
              >
                <Checkbox
                  checked={picked.has(m.user_id)}
                  onCheckedChange={() => togglePick(m.user_id)}
                />
                <Avatar className="h-7 w-7">
                  <AvatarImage src={m.avatar_url ?? undefined} alt={memberName(m)} />
                  <AvatarFallback className="text-[10px]">{memberInitials(m)}</AvatarFallback>
                </Avatar>
                <span className="truncate text-sm">{memberName(m)}</span>
              </label>
            ))}
          </div>
          <Button
            className="w-full"
            disabled={busy || !groupName.trim() || picked.size === 0}
            onClick={() => onCreateGroup(groupName.trim(), Array.from(picked))}
          >
            Criar grupo
          </Button>
        </TabsContent>
      </Tabs>
    </DialogContent>
  );
}
