import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ConversationListItem = {
  id: string;
  ticket_number: number | null;
  status: "open" | "pending" | "closed";
  ai_status: "active" | "handed_off" | null;
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

export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: async (): Promise<ConversationListItem[]> => {
      const { data, error } = await supabase
        .from("conversations")
        .select(
          `
          id, ticket_number, status, ai_status, last_message_at, created_at, unread_count, assigned_user_id, department_id,
          contact:contacts ( id, name, name_locked, is_group, avatar_url, channel_type, external_id, email, birth_date, notes, ai_enabled ),
          channel:channels ( id, name, type ),
          department:departments ( id, name )
        `,
        )
        .neq("status", "closed")
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as ConversationListItem[];
    },
  });
}
