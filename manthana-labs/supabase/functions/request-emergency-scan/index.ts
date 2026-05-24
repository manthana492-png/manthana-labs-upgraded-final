// Allows a free-tier user to request an additional emergency scan beyond the
// lifetime pool. Auto-grants up to 2 in backend, then queues for manual review.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body { reason: string; patient_ref_short?: string; }

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
    if (!body.reason || body.reason.trim().length < 6) {
      return json({ error: "reason required (min 6 chars)" }, 400);
    }

    const { data: counter } = await sb.from("usage_counters")
      .select("*").eq("user_id", user.id).maybeSingle();
    const autoGrants = counter?.free_emergency_auto_grants ?? 0;

    if (autoGrants < 2) {
      await sb.from("emergency_scan_requests").insert({
        user_id: user.id,
        reason: body.reason,
        patient_ref_short: body.patient_ref_short ?? null,
        status: "auto_granted",
      });
      await upsertCounter(sb, user.id, { free_emergency_auto_grants: autoGrants + 1 });
      return json({ status: "auto_granted", remaining_auto_grants: 1 - autoGrants });
    }

    await sb.from("emergency_scan_requests").insert({
      user_id: user.id,
      reason: body.reason,
      patient_ref_short: body.patient_ref_short ?? null,
      status: "pending_review",
    });
    await upsertCounter(sb, user.id, {
      emergency_requests_pending: (counter?.emergency_requests_pending ?? 0) + 1,
    });
    return json({ status: "pending_review" });
  } catch (err) {
    console.error("request-emergency-scan:", err);
    return json({ error: "An unexpected error occurred. Please try again." }, 500);
  }
});

// deno-lint-ignore no-explicit-any
async function upsertCounter(sb: any, userId: string, patch: Record<string, unknown>) {
  const { data: existing } = await sb.from("usage_counters")
    .select("user_id").eq("user_id", userId).maybeSingle();
  if (existing) await sb.from("usage_counters").update(patch).eq("user_id", userId);
  else await sb.from("usage_counters").insert({ user_id: userId, ...patch });
}
function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
