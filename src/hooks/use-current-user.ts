import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

export type Membership = {
  org_id: string;
  role: string;
  permissions: unknown;
  created_at: string;
};

function useSupabaseUser() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) setUser(data.user ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return user;
}

export function useCurrentUser() {
  const user = useSupabaseUser();
  const userId = user?.id;

  const profileQuery = useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const membershipsQuery = useQuery({
    queryKey: ["org_members", userId],
    enabled: !!userId,
    queryFn: async (): Promise<Membership[]> => {
      const { data, error } = await supabase
        .from("org_members")
        .select("org_id, role, permissions, created_at")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Membership[];
    },
  });

  const memberships = membershipsQuery.data ?? [];
  const activeMembership = memberships[0] ?? null;

  return {
    user,
    profile: profileQuery.data ?? null,
    memberships,
    activeMembership,
    isLoading:
      user === undefined ||
      (!!userId && (profileQuery.isLoading || membershipsQuery.isLoading)),
    hasNoOrg: !!userId && membershipsQuery.isSuccess && memberships.length === 0,
  };
}
