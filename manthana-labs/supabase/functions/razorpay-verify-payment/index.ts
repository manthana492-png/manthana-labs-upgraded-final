// Verifies Razorpay payment signature client-returned after checkout, then
// activates the user's subscription for one billing cycle.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "unauthorized" }, 401);

    const mode = (Deno.env.get("RAZORPAY_MODE") ?? "test").toLowerCase();
    const keyId = mode === "live"
      ? Deno.env.get("RAZORPAY_KEY_ID_LIVE")
      : Deno.env.get("RAZORPAY_KEY_ID_TEST");
    const keySecret = mode === "live"
      ? Deno.env.get("RAZORPAY_KEY_SECRET_LIVE")
      : Deno.env.get("RAZORPAY_KEY_SECRET_TEST");

    if (!keyId || !keySecret) return json({ error: "Payments not configured", configured: false }, 503);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: userRes } = await sb.auth.getUser();
    const user = userRes?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const body = (await req.json()) as Body;
    if (!body.razorpay_order_id || !body.razorpay_payment_id || !body.razorpay_signature) {
      return json({ error: "Missing payment parameters" }, 400);
    }

    const expected = createHmac("sha256", keySecret)
      .update(`${body.razorpay_order_id}|${body.razorpay_payment_id}`)
      .digest("hex");

    if (expected !== body.razorpay_signature) {
      return json({ error: "Signature mismatch" }, 400);
    }

    // Authoritatively resolve the plan from Razorpay's server-side order notes.
    // Never trust a client-supplied plan_code — it is vulnerable to elevation.
    const orderResp = await fetch(
      `https://api.razorpay.com/v1/orders/${encodeURIComponent(body.razorpay_order_id)}`,
      { headers: { Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}` } },
    );
    if (!orderResp.ok) {
      console.error("razorpay order fetch failed:", orderResp.status, await orderResp.text());
      return json({ error: "Unable to verify order" }, 502);
    }
    const order = await orderResp.json();
    const orderPlanCode = order?.notes?.plan_code as string | undefined;
    const orderUserId = order?.notes?.user_id as string | undefined;

    if (!orderPlanCode || !["pro", "pro_plus"].includes(orderPlanCode)) {
      return json({ error: "Invalid order" }, 400);
    }
    if (orderUserId && orderUserId !== user.id) {
      return json({ error: "Order does not belong to user" }, 403);
    }
    if (order?.status !== "paid") {
      return json({ error: "Order not paid" }, 400);
    }

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await sb.from("user_subscriptions").upsert({
      user_id: user.id,
      plan_code: orderPlanCode,
      status: "active",
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      razorpay_mode: mode,
    }, { onConflict: "user_id" });

    // Reset usage counters for fresh period
    await sb.from("usage_counters").upsert({
      user_id: user.id,
      scans_this_month: 0,
      scans_today: 0,
      day_marker: now.toISOString().slice(0, 10),
      period_start: now.toISOString(),
    }, { onConflict: "user_id" });

    await sb.from("audit_log").insert({
      user_id: user.id,
      actor_email: user.email,
      action: "subscription.activate",
      entity_type: "subscription",
      entity_id: orderPlanCode,
      metadata: { mode, payment_id: body.razorpay_payment_id, order_id: body.razorpay_order_id },
    });

    return json({ activated: true, plan: orderPlanCode });
  } catch (err) {
    console.error("razorpay-verify-payment:", err);
    return json({ error: "An unexpected error occurred. Please try again." }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
