// Validates the developer access code and grants the caller a Pro subscription.
// Security:
//  - Code stored only in env (DEVELOPER_ACCESS_CODE), never sent to client.
//  - Constant-time comparison.
//  - 3 wrong attempts in last 24h (per IP+fingerprint) => 24h lockout.
//  - Hard cap of 20 successful redemptions across all users.
//  - Each user can only redeem once.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_SEATS = 20;
const LOCKOUT_THRESHOLD = 3;
const LOCKOUT_WINDOW_MS = 24 * 60 * 60 * 1000;

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ??
    "unknown"
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SECRET_CODE = Deno.env.get("DEVELOPER_ACCESS_CODE") ?? "";

    if (!SECRET_CODE) {
      return new Response(
        JSON.stringify({ error: "Access code system not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const user = userData.user;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const submittedCode: string = String(body.code ?? "");
    const fingerprint: string = String(body.fingerprint ?? "unknown").slice(0, 128);
    const ip = clientIp(req);

    // 1. Lockout check (3 fails in 24h from this IP+fingerprint)
    const since = new Date(Date.now() - LOCKOUT_WINDOW_MS).toISOString();
    const { count: recentFails } = await admin
      .from("access_code_attempts")
      .select("*", { count: "exact", head: true })
      .eq("ip_address", ip)
      .eq("fingerprint", fingerprint)
      .eq("succeeded", false)
      .gte("attempted_at", since);

    if ((recentFails ?? 0) >= LOCKOUT_THRESHOLD) {
      return new Response(
        JSON.stringify({
          error: "Too many failed attempts. Try again in 24 hours.",
          lockedOut: true,
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Already redeemed?
    const { data: existing } = await admin
      .from("access_code_redemptions")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing) {
      return new Response(
        JSON.stringify({ error: "You have already redeemed an access code." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3. Validate code (constant-time)
    const codeOk = constantTimeEqual(submittedCode, SECRET_CODE);
    if (!codeOk) {
      await admin.from("access_code_attempts").insert({
        ip_address: ip,
        fingerprint,
        succeeded: false,
        user_id: user.id,
      });
      const remaining = Math.max(0, LOCKOUT_THRESHOLD - ((recentFails ?? 0) + 1));
      return new Response(
        JSON.stringify({
          error: "Invalid access code.",
          attemptsRemaining: remaining,
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 4. Seat cap (20 max)
    const { count: usedSeats } = await admin
      .from("access_code_redemptions")
      .select("*", { count: "exact", head: true });
    if ((usedSeats ?? 0) >= MAX_SEATS) {
      await admin.from("access_code_attempts").insert({
        ip_address: ip,
        fingerprint,
        succeeded: false,
        user_id: user.id,
      });
      return new Response(
        JSON.stringify({ error: "All access code seats have been used." }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 5. Grant Pro subscription (upsert) — extend by 1 year
    const periodEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

    const { error: subErr } = await admin
      .from("user_subscriptions")
      .upsert(
        {
          user_id: user.id,
          plan_code: "pro",
          status: "active",
          current_period_start: new Date().toISOString(),
          current_period_end: periodEnd,
          razorpay_mode: "developer_access_code",
        },
        { onConflict: "user_id" },
      );

    if (subErr) {
      console.error("subscription upsert failed", subErr);
      return new Response(
        JSON.stringify({ error: "Could not activate Pro plan." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 6. Record redemption + success attempt + audit
    await admin.from("access_code_redemptions").insert({
      user_id: user.id,
      user_email: user.email ?? "",
      ip_address: ip,
      fingerprint,
    });
    await admin.from("access_code_attempts").insert({
      ip_address: ip,
      fingerprint,
      succeeded: true,
      user_id: user.id,
    });
    await admin.from("audit_log").insert({
      user_id: user.id,
      actor_email: user.email,
      action: "access_code_redeemed",
      entity_type: "subscription",
      entity_id: user.id,
      ip_address: ip,
      metadata: { plan: "pro", seats_used_after: (usedSeats ?? 0) + 1 },
    });

    return new Response(
      JSON.stringify({
        success: true,
        plan: "pro",
        seatsRemaining: MAX_SEATS - ((usedSeats ?? 0) + 1),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("redeem-access-code error", err);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
