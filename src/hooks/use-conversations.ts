import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ConversationListItem = {
  id: string;
  status: "open" | "pending" | "closed";
  last_message_at: string | null;
  created_at: string;
  contact: { id: string; name: string | null; avatar_url: string | null; channel_type: string; external_id: string } | null;
  channel: { id: string; name: string; type: string } | null;
};

export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: async (): Promise<ConversationListItem[]> => {
      const { data, error } = await supabase
        .from("conversations")
        .select(`
          id, status, last_message_at, created_at,
          contact:contacts ( id, name, avatar_url, channel_type, external_id ),
          channel:channels ( id, name, type )
        `)
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as ConversationListItem[];
    },
  });
}
