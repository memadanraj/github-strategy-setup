import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const plansQuery = queryOptions({
  queryKey: ["plans"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("plans")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");
    if (error) throw error;
    return data;
  },
});
