/* eslint-disable @typescript-eslint/no-explicit-any */
// Camada de dados do Chat Interno.
// As tabelas internal_* ainda não estão no types.ts gerado (ver CLAUDE.md §8),
// então o acesso ao Supabase é feito "solto" aqui e o resto do app continua tipado.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

// ---- Tipos do nosso domínio -------------------------------------------------

export type InternalChat = {
  id: string;
  org_id: string;
  is_group: boolean;
  title: string | null;
  avatar_path: string | null;
  created_by: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string;
};

export type MemberProfile = {
  user_id: string;
  is_admin: boolean;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

export type ChatListItem = {
  chat: InternalChat;
  unread: number;
  members: MemberProfile[];
};

export type InternalMessage = {
  id: string;
  chat_id: string;
  org_id: string;
  sender_user_id: string;
  content: string | null;
  media_path: string | null;
  media_name: string | null;
  media_type: string | null;
  reply_to_id: string | null;
  deleted_at: string | null;
  created_at: string;
};

// Acesso solto, centralizado num único ponto.
const sb = supabase as any;

// ---- Realtime (mesmo mecanismo do inbox) ------------------------------------

export function useTeamChatRealtime(orgId: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel("team-chat-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "internal_messages" },
        (payload: any) => {
          const chatId = payload.new?.chat_id ?? payload.old?.chat_id;
          qc.invalidateQueries({ queryKey: ["internal-chats"] });
          if (chatId) qc.invalidateQueries({ queryKey: ["internal-messages", chatId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "internal_chats" },
        () => qc.invalidateQueries({ queryKey: ["internal-chats"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "internal_chat_members" },
        () => qc.invalidateQueries({ queryKey: ["internal-chats"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, qc]);
}

// ---- Presença (online/offline) via Supabase Realtime Presence ---------------

export function useOnlineUsers(orgId: string | null, userId: string | null) {
  const [online, setOnline] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!orgId || !userId) return;
    const channel = supabase.channel(`presence:org:${orgId}`, {
      config: { presence: { key: userId } },
    });
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, unknown>;
        setOnline(new Set(Object.keys(state)));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          channel.track({ online_at: new Date().toISOString() });
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, userId]);
  return online;
}

// ---- Leituras ---------------------------------------------------------------

export function useInternalChats(orgId: string | null, userId: string | null) {
  return useQuery({
    queryKey: ["internal-chats", orgId, userId],
    enabled: !!orgId && !!userId,
    queryFn: async (): Promise<ChatListItem[]> => {
      // 1) Minhas associações (traz a conversa embutida via FK chat_id).
      const { data: mine, error: e1 } = await sb
        .from("internal_chat_members")
        .select("chat_id, unread_count, last_read_at, chat:internal_chats(*)")
        .eq("user_id", userId);
      if (e1) throw e1;

      const rows = (mine ?? []).filter((r: any) => r.chat);
      const chatIds: string[] = rows.map((r: any) => r.chat_id);
      if (chatIds.length === 0) return [];

      // 2) Todos os participantes dessas conversas.
      const { data: members, error: e2 } = await sb
        .from("internal_chat_members")
        .select("chat_id, user_id, is_admin")
        .in("chat_id", chatIds);
      if (e2) throw e2;

      // 3) Perfis dos participantes (join manual — não dependemos de FK p/ profiles).
      const userIds = Array.from(new Set((members ?? []).map((m: any) => m.user_id)));
      const { data: profiles, error: e3 } = await sb
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .in("id", userIds);
      if (e3) throw e3;

      const profileById = new Map<string, any>();
      for (const p of profiles ?? []) profileById.set(p.id, p);

      const membersByChat = new Map<string, MemberProfile[]>();
      for (const m of members ?? []) {
        const p = profileById.get(m.user_id);
        const arr = membersByChat.get(m.chat_id) ?? [];
        arr.push({
          user_id: m.user_id,
          is_admin: !!m.is_admin,
          full_name: p?.full_name ?? null,
          email: p?.email ?? null,
          avatar_url: p?.avatar_url ?? null,
        });
        membersByChat.set(m.chat_id, arr);
      }

      const items: ChatListItem[] = rows.map((r: any) => ({
        chat: r.chat as InternalChat,
        unread: (r.unread_count as number) ?? 0,
        members: membersByChat.get(r.chat_id) ?? [],
      }));

      items.sort((a, b) => {
        const ta = a.chat.last_message_at ?? a.chat.created_at;
        const tb = b.chat.last_message_at ?? b.chat.created_at;
        return tb.localeCompare(ta);
      });
      return items;
    },
  });
}

export function useInternalMessages(chatId: string | null) {
  return useQuery({
    queryKey: ["internal-messages", chatId],
    enabled: !!chatId,
    queryFn: async (): Promise<InternalMessage[]> => {
      const { data, error } = await sb
        .from("internal_messages")
        .select("*")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as InternalMessage[];
    },
  });
}

export function useOrgMembers(orgId: string | null) {
  return useQuery({
    queryKey: ["team-chat-org-members", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<MemberProfile[]> => {
      const { data: members, error } = await sb
        .from("org_members")
        .select("user_id, role")
        .eq("org_id", orgId);
      if (error) throw error;

      const userIds = (members ?? []).map((m: any) => m.user_id);
      if (userIds.length === 0) return [];

      const { data: profiles, error: e2 } = await sb
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .in("id", userIds);
      if (e2) throw e2;

      const profileById = new Map<string, any>();
      for (const p of profiles ?? []) profileById.set(p.id, p);

      return (members ?? []).map((m: any) => {
        const p = profileById.get(m.user_id);
        return {
          user_id: m.user_id,
          is_admin: false,
          full_name: p?.full_name ?? null,
          email: p?.email ?? null,
          avatar_url: p?.avatar_url ?? null,
        } as MemberProfile;
      });
    },
  });
}

// ---- Mutações (escrita direta + RPC) ----------------------------------------

/** Cria (ou reaproveita, no 1:1) uma conversa e devolve o id. */
export async function createInternalChat(
  memberIds: string[],
  isGroup: boolean,
  title: string | null,
): Promise<string> {
  const { data, error } = await sb.rpc("create_internal_chat", {
    p_member_ids: memberIds,
    p_is_group: isGroup,
    p_title: title,
  });
  if (error) throw error;
  return data as string;
}

export async function sendInternalMessage(params: {
  chatId: string;
  orgId: string;
  senderId: string;
  content?: string | null;
  mediaPath?: string | null;
  mediaName?: string | null;
  mediaType?: string | null;
  replyToId?: string | null;
}): Promise<void> {
  const { error } = await sb.from("internal_messages").insert({
    chat_id: params.chatId,
    org_id: params.orgId,
    sender_user_id: params.senderId,
    content: params.content ?? null,
    media_path: params.mediaPath ?? null,
    media_name: params.mediaName ?? null,
    media_type: params.mediaType ?? null,
    reply_to_id: params.replyToId ?? null,
  });
  if (error) throw error;
}

export async function markChatRead(chatId: string, userId: string): Promise<void> {
  const { error } = await sb
    .from("internal_chat_members")
    .update({ unread_count: 0, last_read_at: new Date().toISOString() })
    .eq("chat_id", chatId)
    .eq("user_id", userId);
  if (error) throw error;
}

/** Envia o arquivo para o bucket `media` em {org_id}/internal-chat/{chat_id}/... */
export async function uploadInternalAttachment(
  orgId: string,
  chatId: string,
  file: File,
): Promise<{ path: string; name: string; type: string }> {
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${orgId}/internal-chat/${chatId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from("media").upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw error;
  return { path, name: file.name, type: file.type || "application/octet-stream" };
}

/** URL assinada (1h) para exibir/baixar um anexo do bucket privado. */
export async function getAttachmentUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("media").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

// ---- Utilidades de exibição -------------------------------------------------

export function memberInitials(m: Pick<MemberProfile, "full_name" | "email">): string {
  const source = (m.full_name?.trim() || m.email || "?").trim();
  const parts = source.split(/\s+/);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : source.slice(0, 2);
  return letters.toUpperCase();
}

export function memberName(m: Pick<MemberProfile, "full_name" | "email">): string {
  return m.full_name?.trim() || m.email || "Colega";
}

/** Nome e participante "do outro lado" para exibir um item da lista. */
export function describeChat(item: ChatListItem, myUserId: string) {
  if (item.chat.is_group) {
    return {
      title: item.chat.title?.trim() || "Grupo",
      others: item.members.filter((m) => m.user_id !== myUserId),
      isGroup: true as const,
    };
  }
  const other = item.members.find((m) => m.user_id !== myUserId) ?? item.members[0];
  return {
    title: other ? memberName(other) : "Conversa",
    other,
    isGroup: false as const,
  };
}
