import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const profileQuery = (userId: string) =>
  queryOptions({
    queryKey: ["profile", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

export const projectsQuery = queryOptions({
  queryKey: ["projects"],
  queryFn: async () => {
    const { data, error } = await supabase.from("projects").select("*").order("updated_at", { ascending: false });
    if (error) throw error;
    return data;
  },
});

export const creditTxnsQuery = queryOptions({
  queryKey: ["credit_transactions"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("credit_transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw error;
    return data;
  },
});

export const statusLabel: Record<string, string> = {
  draft: "Draft",
  scripting: "Scripting",
  producing: "Producing",
  rendering: "Rendering",
  ready: "Ready",
  published: "Published",
};
