import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";

// Tabelas catalog_* fora do types.ts → (supabase as any) (CLAUDE.md §8).
const sb = supabase as any;

export type CatalogCategory = { id: string; name: string; sort_order: number };

export type CatalogItem = {
  id: string;
  org_id: string;
  category_id: string | null;
  type: "product" | "service";
  name: string;
  description: string | null;
  price: number | null;
  currency: string;
  image_path: string | null;
  payment_link: string | null;
  is_active: boolean;
};

export function useCatalogCategories() {
  const { activeMembership } = useCurrentUser();
  const orgId = activeMembership?.org_id ?? null;
  return useQuery({
    queryKey: ["catalog-categories", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<CatalogCategory[]> => {
      const { data, error } = await sb
        .from("catalog_categories")
        .select("id, name, sort_order")
        .eq("org_id", orgId)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCatalogItems() {
  const { activeMembership } = useCurrentUser();
  const orgId = activeMembership?.org_id ?? null;
  return useQuery({
    queryKey: ["catalog-items", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<CatalogItem[]> => {
      const { data, error } = await sb
        .from("catalog_items")
        .select(
          "id, org_id, category_id, type, name, description, price, currency, image_path, payment_link, is_active",
        )
        .eq("org_id", orgId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

// URL assinada do bucket privado 'media' (cacheada por caminho).
export function useSignedMediaUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ["media-signed", path],
    enabled: !!path,
    staleTime: 1000 * 60 * 50,
    queryFn: async (): Promise<string | null> => {
      const { data } = await sb.storage.from("media").createSignedUrl(path!, 3600);
      return (data as any)?.signedUrl ?? null;
    },
  });
}

export function formatPrice(price: number | null, currency = "BRL"): string {
  if (price == null) return "Sob consulta";
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL" }).format(price);
  } catch {
    return `R$ ${price}`;
  }
}

// Legenda formatada do item para enviar no WhatsApp.
export function buildItemCaption(item: {
  name: string;
  price: number | null;
  currency?: string;
  description?: string | null;
  payment_link?: string | null;
}): string {
  const lines: string[] = [`*${item.name}*`, formatPrice(item.price, item.currency ?? "BRL")];
  if (item.description?.trim()) lines.push("\n" + item.description.trim());
  if (item.payment_link?.trim()) lines.push("\n💳 Pagamento: " + item.payment_link.trim());
  return lines.join("\n");
}
