import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";

// Tabelas contact_lists/contact_list_members fora do types.ts → (supabase as any) (CLAUDE.md §8).
const sb = supabase as any;

export type ContactList = {
  id: string;
  name: string;
  created_at: string;
  member_count: number;
};

export function useContactLists() {
  const { activeMembership } = useCurrentUser();
  const orgId = activeMembership?.org_id ?? null;
  return useQuery({
    queryKey: ["contact-lists", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<ContactList[]> => {
      const { data, error } = await sb
        .from("contact_lists")
        .select("id, name, created_at, contact_list_members(count)")
        .eq("org_id", orgId)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((l: any) => ({
        id: l.id,
        name: l.name,
        created_at: l.created_at,
        member_count: l.contact_list_members?.[0]?.count ?? 0,
      }));
    },
  });
}

// Cria uma lista e devolve o id.
export async function createContactList(orgId: string, name: string): Promise<string | null> {
  const { data, error } = await sb
    .from("contact_lists")
    .insert({ org_id: orgId, name: name.trim() })
    .select("id")
    .single();
  if (error) throw error;
  return (data as any)?.id ?? null;
}

// Adiciona contatos a uma lista (idempotente).
export async function addContactsToList(listId: string, orgId: string, contactIds: string[]): Promise<void> {
  for (let i = 0; i < contactIds.length; i += 500) {
    const rows = contactIds.slice(i, i + 500).map((cid) => ({
      list_id: listId,
      contact_id: cid,
      org_id: orgId,
    }));
    const { error } = await sb
      .from("contact_list_members")
      .upsert(rows, { onConflict: "list_id,contact_id", ignoreDuplicates: true });
    if (error) throw error;
  }
}
