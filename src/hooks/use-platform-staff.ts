import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";

// Lê o registro do PRÓPRIO usuário na tabela platform_staff (a equipe interna
// da ConectaChat). A RLS "staff le proprio registro" só deixa cada um enxergar
// a sua própria linha — então isto é seguro e NÃO expõe a equipe inteira.
//
// Retorna:
//  - role:           o papel na plataforma (super_admin/finance/…), ou null
//  - isPlatformStaff: faz parte da equipe da plataforma (qualquer papel)
//  - isSuperAdmin:    é o super_admin (a "chave-mestra") — gerencia Planos/Clientes
//  - isLoading:       ainda buscando
export function usePlatformStaff() {
  const { user } = useCurrentUser();
  const userId = user?.id;

  const query = useQuery({
    queryKey: ["platform_staff", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_staff")
        .select("role")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data; // { role } ou null
    },
  });

  const role = query.data?.role ?? null;

  return {
    role,
    isPlatformStaff: !!role,
    isSuperAdmin: role === "super_admin",
    isLoading: !!userId && query.isLoading,
  };
}
