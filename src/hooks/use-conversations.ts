import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ConversationListItem = {
  id: string;
  ticket_number: number | null;
  status: "open" | "pending" | "closed";
  ai_status: "active" | "handed_off" | null;
  ai_last_error: string | null;
  ai_last_error_at: string | null;
  assigned_user_id: string | null;
  department_id: string | null;
  department: { id: string; name: string } | null;
  last_message_at: string | null;
  created_at: string;
  unread_count: number;
  contact: {
    id: string;
    name: string | null;
    name_locked: boolean | null;
    is_group: boolean | null;
    avatar_url: string | null;
    channel_type: string;
    external_id: string;
    email: string | null;
    birth_date: string | null;
    notes: string | null;
    ai_enabled: boolean | null;
  } | null;
  channel: { id: string; name: string; type: string } | null;
};

// status="open" (padrão) traz as conversas em andamento (status != closed);
// status="closed" traz as encerradas (limitado às 200 mais recentes) — usado pelo
// filtro "Fechadas" do inbox (Passo 3).
export function useConversations(status: "open" | "closed" = "open") {
  return useQuery({
    queryKey: ["conversations", status],
    queryFn: async (): Promise<ConversationListItem[]> => {
      let q = supabase
        .from("conversations")
        .select(
          `
          id, ticket_number, status, ai_status, ai_last_error, ai_last_error_at, last_message_at, created_at, unread_count, assigned_user_id, department_id,
          contact:contacts ( id, name, name_locked, is_group, avatar_url, channel_type, external_id, email, birth_date, notes, ai_enabled ),
          channel:channels ( id, name, type ),
          department:departments ( id, name )
        `,
        )
        .order("last_message_at", { ascending: false, nullsFirst: false });
      q = status === "closed" ? q.eq("status", "closed").limit(200) : q.neq("status", "closed");
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ConversationListItem[];
    },
  });
}
