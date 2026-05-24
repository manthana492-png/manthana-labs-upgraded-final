// Quota gate: validates and consumes scan / chat-message quotas based on the
// user's subscription plan. Returns the user's effective limits so the caller
// can branch on tier (model selection, max_tokens, context window, etc).
//
// Modes:
//   - "scan"        consume 1 scan from monthly quota or daily add-on
//   - "emergency"   consume from lifetime free pool, then auto-grant pool, else queue
//   - "chat"        consume 1 message against per-study chat quota
//   - "peek"        no consumption — just returns current limits + usage
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Mode = "scan" | "emergency" | "chat" | "peek";
interface Body {
  mode: Mode;
  studyId?: string; // required for "chat"
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "unauthorized" }, 401);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );

    const { data: userRes } = await sb.auth.getUser();
    const user = userRes?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const body = (await req.json()) as Body;

    // Resolve plan
    const { data: sub } = await sb
      .from("user_subscriptions")
      .select("plan_code,status,current_period_end")
      .eq("user_id", user.id)
      .maybeSingle();

    const planCode = sub?.status === "active" ? (sub?.plan_code ?? "free") : "free";

    const { data: plan } = await sb
      .from("subscription_plans")
      .select("*")
      .eq("code", planCode)
      .maybeSingle();

    if (!plan) return json({ error: "plan not found" }, 500);

    // Reset usage_counters monthly / daily as needed
    const { data: counter } = await sb
      .from("usage_counters")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    const today = new Date().toISOString().slice(0, 10);
    const periodStart = counter?.period_start
      ? new Date(counter.period_start)
      : new Date();
    const now = new Date();
    const sameMonth =
      periodStart.getUTCFullYear() === now.getUTCFullYear() &&
      periodStart.getUTCMonth() === now.getUTCMonth();
    const sameDay = counter?.day_marker === today;

    let scansMonth = sameMonth ? (counter?.scans_this_month ?? 0) : 0;
    let scansToday = sameDay ? (counter?.scans_today ?? 0) : 0;
    const lifetimeFreeUsed = counter?.free_emergency_used ?? 0;
    const autoGrantsUsed = counter?.free_emergency_auto_grants ?? 0;
    const pendingReq = counter?.emergency_requests_pending ?? 0;

    if (body.mode === "peek") {
      return json({
        plan: plan.code,
        plan_name: plan.name,
        limits: planLimits(plan),
        usage: {
          scans_this_month: scansMonth,
          scans_today: scansToday,
          lifetime_emergency_used: lifetimeFreeUsed,
          auto_grants_used: autoGrantsUsed,
          emergency_requests_pending: pendingReq,
        },
      });
    }

    // ─────── CHAT QUOTA ───────
    if (body.mode === "chat") {
      if (!body.studyId) return json({ error: "studyId required" }, 400);
      const cap = plan.chat_msgs_per_scan as number;

      const { data: cq } = await sb
        .from("chat_quotas")
        .select("*")
        .eq("user_id", user.id)
        .eq("study_id", body.studyId)
        .maybeSingle();

      const used = cq?.messages_used ?? 0;
      if (used >= cap) {
        return json({
          allowed: false,
          reason: "chat_cap_reached",
          plan: plan.code,
          limits: planLimits(plan),
          used,
          cap,
        }, 200);
      }

      if (cq) {
        await sb.from("chat_quotas").update({ messages_used: used + 1 })
          .eq("id", cq.id);
      } else {
        await sb.from("chat_quotas").insert({
          user_id: user.id,
          study_id: body.studyId,
          messages_used: 1,
        });
      }

      return json({
        allowed: true,
        plan: plan.code,
        limits: planLimits(plan),
        used: used + 1,
        cap,
      });
    }

    // ─────── SCAN QUOTA ───────
    if (body.mode === "scan") {
      const monthly = plan.monthly_scan_quota as number;
      const allowedMonthly = scansMonth < monthly;

      if (!allowedMonthly) {
        return json({
          allowed: false,
          reason: "scan_quota_exceeded",
          plan: plan.code,
          usage: { scansMonth, scansToday },
          limits: planLimits(plan),
          remaining: 0,
        });
      }

      scansMonth += 1;

      await upsertCounter(sb, user.id, {
        scans_this_month: scansMonth,
        scans_today: scansToday,
        day_marker: today,
        period_start: sameMonth ? counter?.period_start : new Date().toISOString(),
      });
      return json({
        allowed: true,
        plan: plan.code,
        usage: { scansMonth, scansToday },
        remaining: Math.max(0, monthly - scansMonth),
        cap: monthly,
      });
    }

    // ─────── EMERGENCY SCAN ───────
    if (body.mode === "emergency") {
      const lifetimePool = plan.emergency_pool as number; // free=3, pro=3, pro+=6
      // Free tier behaviour: 3 lifetime free + 2 auto-grants beyond, then queue
      if (planCode === "free") {
        if (lifetimeFreeUsed < lifetimePool) {
          await upsertCounter(sb, user.id, {
            free_emergency_used: lifetimeFreeUsed + 1,
          });
          return json({ allowed: true, source: "lifetime_free" });
        }
        if (autoGrantsUsed < 2) {
          await upsertCounter(sb, user.id, {
            free_emergency_auto_grants: autoGrantsUsed + 1,
          });
          await sb.from("emergency_scan_requests").insert({
            user_id: user.id,
            reason: "Auto-granted after lifetime free pool",
            status: "auto_granted",
          });
          return json({ allowed: true, source: "auto_grant" });
        }
        // queue
        await sb.from("emergency_scan_requests").insert({
          user_id: user.id,
          reason: "Pending manual review",
          status: "pending_review",
        });
        await upsertCounter(sb, user.id, {
          emergency_requests_pending: pendingReq + 1,
        });
        return json({ allowed: false, source: "queued" });
      }

      // Paid tiers: emergency_pool per period
      if (lifetimeFreeUsed < lifetimePool) {
        await upsertCounter(sb, user.id, {
          free_emergency_used: lifetimeFreeUsed + 1,
        });
        return json({ allowed: true, source: "plan_pool" });
      }
      return json({ allowed: false, source: "queued" });
    }

    return json({ error: "invalid mode" }, 400);
  } catch (err) {
    console.error("check-and-consume-quota:", err);
    return json({ error: "An unexpected error occurred. Please try again." }, 500);
  }
});

function planLimits(plan: Record<string, unknown>) {
  return {
    chat_msgs_per_scan: plan.chat_msgs_per_scan,
    context_window_msgs: plan.context_window_msgs,
    max_tokens_per_reply: plan.max_tokens_per_reply,
    monthly_scan_quota: plan.monthly_scan_quota,
    daily_scan_addon: plan.daily_scan_addon,
    emergency_pool: plan.emergency_pool,
    priority_queue: plan.priority_queue,
  };
}

// deno-lint-ignore no-explicit-any
async function upsertCounter(sb: any, userId: string, patch: Record<string, unknown>) {
  const { data: existing } = await sb
    .from("usage_counters")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) {
    await sb.from("usage_counters").update(patch).eq("user_id", userId);
  } else {
    await sb.from("usage_counters").insert({ user_id: userId, ...patch });
  }
}

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
