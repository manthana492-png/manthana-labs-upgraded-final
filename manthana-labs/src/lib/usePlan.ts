import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PlanCode = "free" | "pro" | "pro_plus" | "enterprise";

interface PlanState {
  plan: PlanCode;
  loading: boolean;
}

/** Returns the current user's active subscription plan. */
export function usePlan(): PlanState {
  const [plan, setPlan] = useState<PlanCode>("free");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id;
      if (!uid) {
        if (!cancelled) {
          setPlan("free");
          setLoading(false);
        }
        return;
      }
      const { data } = await supabase
        .from("user_subscriptions")
        .select("plan_code,status")
        .eq("user_id", uid)
        .maybeSingle();
      if (cancelled) return;
      const code = (data?.plan_code as PlanCode | undefined) ?? "free";
      setPlan(data?.status === "active" ? code : "free");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { plan, loading };
}

export function isProOrAbove(plan: PlanCode): boolean {
  return plan === "pro" || plan === "pro_plus" || plan === "enterprise";
}
