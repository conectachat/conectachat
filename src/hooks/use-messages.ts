import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Message = {
  id: string;
  direction: "inbound" | "outbound";
  content_type: string;
  content: string | null;
  media_url: string | null;
  media_name: string | null;
  media_size: number | null;
  status: string;
  sender_name: string | null;
  sender_external_id: string | null;
  reactions: Record<string, string> | null;
  external_message_id: string | null;
  reply_to_external_id: string | null;
  reply_to_preview: string | null;
  deleted_at: string | null;
  created_at: string;
};

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ["messages", conversationId],
    enabled: !!conversationId,
    queryFn: async (): Promise<Message[]> => {
      const { data, error } = await supabase
        .from("messages")
        .select(
          "id, direction, content_type, content, media_url, media_name, media_size, status, sender_name, sender_external_id, reactions, external_message_id, reply_to_external_id, reply_to_preview, deleted_at, created_at",
        )
        .eq("conversation_id", conversationId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Message[];
    },
  });
}
