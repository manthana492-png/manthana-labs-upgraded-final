// Cryptographic SHA-256 signing of a finalized report.
// Stores hash + signature on the study row and writes an audit_log entry.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return new Response(JSON.stringify({ error: "auth required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "invalid session" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const user = userData.user;

    const { studyId, payload, doctorName } = await req.json() as {
      studyId: string; payload: unknown; doctorName?: string;
    };
    if (!studyId || !payload) {
      return new Response(JSON.stringify({ error: "studyId + payload required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const canonical = JSON.stringify(payload);
    const hash = await sha256(canonical);
    const signedAt = new Date().toISOString();
    const signature = await sha256(`${hash}|${user.id}|${signedAt}`);

    const { error: updErr } = await supabase
      .from("studies")
      .update({ report_hash: hash, report_signature: signature })
      .eq("id", studyId)
      .eq("user_id", user.id);
    if (updErr) throw updErr;

    await supabase.from("audit_log").insert({
      user_id: user.id,
      actor_email: user.email,
      action: "report.sign",
      entity_type: "study",
      entity_id: studyId,
      metadata: { hash, signature, doctor_name: doctorName, signed_at: signedAt },
      ip_address: req.headers.get("x-forwarded-for") ?? null,
      user_agent: req.headers.get("user-agent") ?? null,
    });

    return new Response(
      JSON.stringify({ hash, signature, signedAt, verifyUrl: `${new URL(req.url).origin}/verify?h=${hash}` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("sign-report:", err);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
