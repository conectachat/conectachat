import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";

// Faixa que aparece no topo do app quando algum canal cai (desconectado/erro).
type ChannelStatusRow = { id: string; name: string; status: string };

export function ConnectionBanner() {
  const { activeMembership } = useCurrentUser();
  const orgId = activeMembership?.org_id;
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const query = useQuery({
    queryKey: ["channels-status", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<ChannelStatusRow[]> => {
      const { data, error } = await supabase
        .from("channels")
        .select("id, name, status")
        .eq("org_id", orgId!);
      if (error) throw error;
      return (data ?? []) as ChannelStatusRow[];
    },
  });

  // Tempo real: quando um canal muda de status, a faixa se atualiza sozinha.
  useEffect(() => {
    if (!orgId) return;
    const ch = supabase
      .channel(`banner-channels-${orgId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "channels", filter: `org_id=eq.${orgId}` },
        () => queryClient.invalidateQueries({ queryKey: ["channels-status", orgId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [orgId, queryClient]);

  // Não mostra na própria tela de Conexões (seria redundante).
  if (pathname === "/connections") return null;

  const offline = (query.data ?? []).filter(
    (c) => c.status === "disconnected" || c.status === "error",
  );
  if (offline.length === 0) return null;

  const names = offline.map((c) => c.name).join(", ");

  return (
    <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        WhatsApp desconectado: <span className="font-medium">{names}</span>. As mensagens
        não chegam enquanto estiver offline.
      </span>
      <Link
        to="/connections"
        className="shrink-0 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700"
      >
        Reconectar
      </Link>
    </div>
  );
}
