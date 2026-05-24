// Razorpay webhook receiver — verifies HMAC signature and applies subscription
// state updates on payment.captured / subscription.cancelled.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-razorpay-signature, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const secret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
    if (!secret) return new Response("Webhook not configured", { status: 503 });

    const sig = req.headers.get("x-razorpay-signature");
    const raw = await req.text();
    const expected = createHmac("sha256", secret).update(raw).digest("hex");
    if (sig !== expected) return new Response("Invalid signature", { status: 400 });

    const evt = JSON.parse(raw);
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    await sb.from("audit_log").insert({
      action: `razorpay.webhook.${evt.event}`,
      entity_type: "razorpay_event",
      entity_id: evt.payload?.payment?.entity?.id ?? null,
      metadata: evt,
    });

    // Most state transitions handled inline via verify-payment; webhook is the
    // safety net for asynchronous failures and cancellations.
    if (evt.event === "subscription.cancelled" || evt.event === "subscription.completed") {
      const userId = evt.payload?.subscription?.entity?.notes?.user_id;
      if (userId) {
        await sb.from("user_subscriptions").update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
        }).eq("user_id", userId);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("razorpay-webhook:", err);
    return new Response("error", { status: 500 });
  }
});
