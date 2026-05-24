import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Activity, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface PeekResult {
  plan: string;
  plan_name: string;
  limits: { monthly_scan_quota: number; chat_msgs_per_scan: number; emergency_pool: number };
  usage: { scans_this_month: number; lifetime_emergency_used: number };
}

/** Compact header chip showing remaining scans for the current billing period. */
export function QuotaChip({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<PeekResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: res, error } = await supabase.functions.invoke("check-and-consume-quota", {
        body: { mode: "peek" },
      });
      if (!cancelled && !error && res) setData(res as PeekResult);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (!data) return null;

  const isFree = data.plan === "free";
  const cap = data.limits.monthly_scan_quota;
  const used = data.usage.scans_this_month;
  const remaining = Math.max(0, cap - used);
  const low = cap > 0 && remaining <= Math.max(2, Math.round(cap * 0.1));

  if (isFree) {
    const eRem = Math.max(0, data.limits.emergency_pool - data.usage.lifetime_emergency_used);
    return (
      <Link
        to="/app/billing"
        className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/60 px-2.5 py-1 text-[0.7rem] text-muted-foreground hover:text-foreground hover:bg-accent/40 transition focus-ring"
        title="Free plan — emergency pool"
      >
        <Sparkles className="h-3 w-3 text-primary" />
        <span className="font-medium text-foreground">{eRem}</span>
        <span>emergency left</span>
      </Link>
    );
  }

  return (
    <Link
      to="/app/billing"
      className={cn(
        "hidden md:inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem] transition focus-ring",
        low
          ? "border-warn/40 bg-warn-soft/40 text-warn-foreground hover:bg-warn-soft/60"
          : "border-border bg-surface/60 text-muted-foreground hover:text-foreground hover:bg-accent/40",
      )}
      title={`${data.plan_name} — ${used}/${cap} scans used this month`}
    >
      <Activity className="h-3 w-3" />
      <span className="font-medium text-foreground">{remaining}</span>
      <span>/ {cap} scans left</span>
    </Link>
  );
}
