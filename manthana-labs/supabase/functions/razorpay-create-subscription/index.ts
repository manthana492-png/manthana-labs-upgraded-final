// Creates a Razorpay subscription for the authenticated user.
// Gracefully no-ops with a clear error if Razorpay keys are not yet configured.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  plan_code: "pro" | "pro_plus";
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

    if (!keyId || !keySecret) {
      return json({
        error: "Payments not configured yet. Please contact info@quaasx108.com.",
        configured: false,
      }, 503);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );

    const { data: userRes } = await sb.auth.getUser();
    const user = userRes?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const body = (await req.json()) as Body;
    if (!["pro", "pro_plus"].includes(body.plan_code)) {
      return json({ error: "invalid plan" }, 400);
    }

    const { data: plan } = await sb
      .from("subscription_plans")
      .select("price_inr_monthly,name")
      .eq("code", body.plan_code)
      .maybeSingle();
    if (!plan) return json({ error: "plan not found" }, 404);

    // Razorpay subscription requires a plan_id created in Razorpay dashboard.
    // We use a one-time order flow to keep this self-contained without dashboard plans.
    const orderResp = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: (plan.price_inr_monthly as number) * 100, // paise
        currency: "INR",
        receipt: `manth_${user.id.slice(0, 8)}_${Date.now()}`,
        notes: { plan_code: body.plan_code, user_id: user.id },
      }),
    });

    if (!orderResp.ok) {
      const t = await orderResp.text();
      console.error("razorpay order err:", orderResp.status, t);
      return json({ error: "Unable to create payment order. Please try again." }, 502);
    }
    const order = await orderResp.json();
    return json({ order, key_id: keyId, mode });
  } catch (err) {
    console.error("razorpay-create-subscription:", err);
    return json({ error: "An unexpected error occurred. Please try again." }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
