import { useEffect, useState, useCallback } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Sparkles, Zap, Crown, Building2, ArrowRight, Loader2, AlertTriangle,
  Clock, Mail, Receipt, Activity, MessageSquare,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

declare global {
  interface Window { Razorpay?: any; }
}

interface PlanRow {
  code: string;
  name: string;
  price_inr_monthly: number;
  monthly_scan_quota: number;
  daily_scan_addon: number;
  emergency_pool: number;
  chat_msgs_per_scan: number;
  context_window_msgs: number;
  max_tokens_per_reply: number;
  priority_queue: boolean;
  description: string | null;
  display_order: number;
}

interface Quota {
  plan: string;
  plan_name: string;
  limits: {
    chat_msgs_per_scan: number;
    context_window_msgs: number;
    max_tokens_per_reply: number;
    monthly_scan_quota: number;
    daily_scan_addon: number;
    emergency_pool: number;
    priority_queue: boolean;
  };
  usage: {
    scans_this_month: number;
    scans_today: number;
    lifetime_emergency_used: number;
    auto_grants_used: number;
    emergency_requests_pending: number;
  };
}

const PLAN_ICON: Record<string, typeof Sparkles> = {
  free: Sparkles, pro: Zap, pro_plus: Crown, enterprise: Building2,
};

const Billing = () => {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [emergencyOpen, setEmergencyOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: planData }, { data: q }] = await Promise.all([
        supabase.from("subscription_plans").select("*").eq("is_public", true).order("display_order"),
        supabase.functions.invoke("check-and-consume-quota", { body: { mode: "peek" } }),
      ]);
      setPlans((planData ?? []) as PlanRow[]);
      if (q) setQuota(q as Quota);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Load Razorpay checkout script lazily
  useEffect(() => {
    if (window.Razorpay) return;
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    document.body.appendChild(s);
  }, []);

  const startCheckout = async (planCode: "pro" | "pro_plus") => {
    setCheckingOut(planCode);
    try {
      const { data, error } = await supabase.functions.invoke("razorpay-create-subscription", {
        body: { plan_code: planCode },
      });
      if (error) {
        const status = (error as any).status;
        if (status === 503) {
          toast.error("Payments not configured yet", {
            description: "Razorpay keys haven't been added. Contact info@quaasx108.com to subscribe right now.",
          });
          return;
        }
        throw error;
      }
      if (!window.Razorpay) {
        toast.error("Checkout failed to load");
        return;
      }
      const { order, key_id } = data;
      const { data: userRes } = await supabase.auth.getUser();
      const rzp = new window.Razorpay({
        key: key_id,
        amount: order.amount,
        currency: order.currency,
        order_id: order.id,
        name: "Manthana‑Labs · Quaasx 108",
        description: planCode === "pro" ? "Pro plan (₹299/mo)" : "Pro+ plan (₹599/mo)",
        prefill: { email: userRes.user?.email ?? "" },
        theme: { color: "#3b82f6" },
        handler: async (resp: any) => {
          const { error: vErr } = await supabase.functions.invoke("razorpay-verify-payment", {
            body: { ...resp, plan_code: planCode },
          });
          if (vErr) {
            toast.error("Payment verification failed");
            return;
          }
          toast.success(`Welcome to ${planCode === "pro" ? "Pro" : "Pro+"}!`);
          await refresh();
        },
      });
      rzp.open();
    } catch (err) {
      toast.error("Could not start checkout", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setCheckingOut(null);
    }
  };

  const submitEmergency = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const reason = String(fd.get("reason") ?? "").trim();
    try {
      const { data, error } = await supabase.functions.invoke("request-emergency-scan", {
        body: { reason },
      });
      if (error) throw error;
      const status = (data as any)?.status;
      if (status === "auto_granted") toast.success("Emergency scan auto-granted");
      else toast.success("Submitted for manual review");
      setEmergencyOpen(false);
      await refresh();
    } catch (err) {
      toast.error("Could not submit", { description: err instanceof Error ? err.message : "" });
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="font-display text-3xl tracking-tight">Plan &amp; Billing</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your subscription, monitor usage and request emergency scans.
          </p>
        </header>

        {/* Usage panel */}
        <section className="surface-clinical p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Current plan
              </div>
              {loading || !quota ? (
                <div className="mt-1"><Loader2 className="h-4 w-4 animate-spin" /></div>
              ) : (
                <div className="font-display text-2xl tracking-tight mt-0.5 flex items-center gap-2">
                  {quota.plan_name}
                  <Badge variant="outline" className="text-[0.65rem]">
                    {quota.plan === "free" ? "Free for life" : "Active"}
                  </Badge>
                </div>
              )}
            </div>
            <Link to="/pricing">
              <Button variant="outline" size="sm">Compare all plans</Button>
            </Link>
          </div>

          {quota && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <UsageCard
                icon={Activity}
                label="Scans used this month"
                value={quota.usage.scans_this_month}
                cap={quota.limits.monthly_scan_quota}
                emptyLabel={quota.plan === "free" ? "Emergency-only on Free" : undefined}
                hint={
                  quota.limits.monthly_scan_quota > 0
                    ? `${Math.max(0, quota.limits.monthly_scan_quota - quota.usage.scans_this_month)} scans remaining`
                    : undefined
                }
              />
              <UsageCard
                icon={MessageSquare}
                label="AI chat per scan"
                value={quota.limits.chat_msgs_per_scan}
                cap={quota.limits.chat_msgs_per_scan}
                hideProgress
                hint={`${quota.limits.max_tokens_per_reply.toLocaleString()} tokens / reply · ${quota.limits.context_window_msgs}-msg context`}
              />
              <UsageCard
                icon={AlertTriangle}
                label="Lifetime emergency pool"
                value={quota.usage.lifetime_emergency_used}
                cap={quota.limits.emergency_pool}
                hint={quota.plan === "free" ? `${quota.usage.auto_grants_used}/2 auto-grants used` : undefined}
              />
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEmergencyOpen(true)}
            >
              <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
              Request emergency scan
            </Button>
            {quota && quota.usage.emergency_requests_pending > 0 && (
              <span className="text-xs text-muted-foreground self-center">
                {quota.usage.emergency_requests_pending} pending review
              </span>
            )}
            <a href="mailto:info@quaasx108.com?subject=Manthana‑Labs%20billing%20question" className="ml-auto">
              <Button size="sm" variant="ghost">
                <Mail className="h-3.5 w-3.5 mr-1.5" />
                Billing support
              </Button>
            </a>
          </div>
        </section>

        {/* Plan switcher */}
        <section>
          <h2 className="font-display text-xl tracking-tight mb-3">Change plan</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {plans.map((p) => {
              const Icon = PLAN_ICON[p.code] ?? Sparkles;
              const isCurrent = quota?.plan === p.code;
              const isPaid = p.code === "pro" || p.code === "pro_plus";
              const isEnt = p.code === "enterprise";
              return (
                <div
                  key={p.code}
                  className={
                    "rounded-xl border p-5 bg-surface flex flex-col " +
                    (isCurrent ? "border-primary ring-1 ring-primary/30" : "border-border")
                  }
                >
                  <div className="flex items-center justify-between">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                      <Icon className="h-4 w-4" />
                    </div>
                    {isCurrent && <Badge className="bg-primary/15 text-primary border-primary/20">Current</Badge>}
                  </div>
                  <div className="font-display text-lg tracking-tight mt-3">{p.name}</div>
                  <div className="text-2xl font-display mt-1">
                    {isEnt ? "Custom" : p.price_inr_monthly === 0 ? "Free" : `₹${p.price_inr_monthly}/mo`}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 min-h-[2.5rem]">
                    {p.description}
                  </p>
                  <div className="mt-4">
                    {isCurrent ? (
                      <Button variant="outline" className="w-full" disabled>Active</Button>
                    ) : isEnt ? (
                      <a href="mailto:info@quaasx108.com?subject=Enterprise%20enquiry">
                        <Button variant="outline" className="w-full">
                          <Mail className="h-3.5 w-3.5 mr-1.5" />
                          Contact sales
                        </Button>
                      </a>
                    ) : isPaid ? (
                      <Button
                        className="w-full bg-primary hover:bg-primary/90"
                        onClick={() => startCheckout(p.code as "pro" | "pro_plus")}
                        disabled={checkingOut === p.code}
                      >
                        {checkingOut === p.code && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                        Subscribe <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                      </Button>
                    ) : (
                      <Button variant="outline" className="w-full" disabled>Free for life</Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <p className="text-xs text-muted-foreground">
          <Receipt className="h-3 w-3 inline -mt-0.5 mr-1" />
          GST inclusive · Payments processed securely by Razorpay · Cancel anytime — your access stays
          active until the end of the current billing period.
        </p>
      </div>

      {/* Emergency request dialog */}
      <Dialog open={emergencyOpen} onOpenChange={setEmergencyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request an additional emergency scan</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitEmergency} className="space-y-3">
            <div>
              <Label htmlFor="reason">Clinical justification</Label>
              <Textarea
                id="reason" name="reason" rows={4} required minLength={6}
                placeholder="e.g. Trauma patient at OPD, suspected pneumothorax, need urgent CT read."
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Free tier: first 2 requests are auto-granted, beyond that they queue for manual review
              by our clinical team.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEmergencyOpen(false)}>Cancel</Button>
              <Button type="submit" className="bg-primary hover:bg-primary/90">Submit request</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
};

const UsageCard = ({
  icon: Icon, label, value, cap, hint, emptyLabel, hideProgress,
}: {
  icon: typeof Sparkles;
  label: string;
  value: number;
  cap: number;
  hint?: string;
  emptyLabel?: string;
  hideProgress?: boolean;
}) => {
  const pct = cap > 0 ? Math.min(100, (value / cap) * 100) : 0;
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 font-display text-2xl tracking-tight">
        {cap > 0 ? `${value} / ${cap}` : emptyLabel ?? value}
      </div>
      {cap > 0 && !hideProgress && <Progress value={pct} className="mt-2 h-1.5" />}
      {hint && <div className="text-[0.65rem] text-muted-foreground mt-1.5">{hint}</div>}
    </div>
  );
};

export default Billing;
