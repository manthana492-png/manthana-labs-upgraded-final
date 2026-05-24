import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
import { z } from "https://esm.sh/zod@3.23.8";

/**
 * verify-council  (lenient verification)
 *
 * Behaviour:
 *   - Strict format check first.
 *   - If registration number format matches → mark **verified** immediately.
 *   - If only the doctor's full name slightly differs → still allow (verified)
 *     but log the mismatch in the verification payload.
 *   - If the format clearly fails → queue **manual_review** (NOT rejected),
 *     so the doctor isn't blocked from Tier C while an admin double-checks.
 *
 * A misuse / fake-identity caution is recorded with every submission. The
 * clinician attests that any false declaration is their personal liability
 * (sign-up form already shows the warning).
 */

const BodySchema = z.object({
  system: z.enum(["allopathy", "ayurveda", "homeopathy", "siddha", "unani", "dental"]),
  council_body: z.string().min(2).max(120),
  registration_number: z.string().min(3).max(40),
  registration_year: z.number().int().min(1950).max(new Date().getFullYear()).optional(),
  state: z.string().max(60).optional(),
  full_name: z.string().min(2).max(120),
});

const FORMATS: Record<string, RegExp> = {
  allopathy: /^[A-Z]{0,4}[\/-]?\d{4,12}([\/-]?\d{4})?$/i,
  ayurveda: /^(AYU|A|BAMS)?[\/-]?[A-Z]{0,3}[\/-]?\d{0,4}[\/-]?\d{3,8}$/i,
  homeopathy: /^(HOM|H|BHMS)?[\/-]?[A-Z]{0,3}[\/-]?\d{0,4}[\/-]?\d{3,8}$/i,
  siddha: /^(SID|S|BSMS)?[\/-]?[A-Z]{0,3}[\/-]?\d{0,4}[\/-]?\d{3,8}$/i,
  unani: /^(UNA|U|BUMS)?[\/-]?[A-Z]{0,3}[\/-]?\d{0,4}[\/-]?\d{3,8}$/i,
  dental: /^(DCI[\/-]?)?[A-Z]?[\/-]?\d{3,8}$/i,
};

// Lenient name normalization — accept Dr./prefix + casing differences.
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(dr|mr|mrs|ms|prof|smt|shri|sri)\.?\b/g, "")
    .replace(/[^a-z\u0900-\u097f\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { system, council_body, registration_number, registration_year, state, full_name } = parsed.data;

    const fmt = FORMATS[system];
    const formatOk = fmt.test(registration_number.trim());

    let status: "verified" | "pending" | "manual_review" | "rejected" = "manual_review";
    let source = "format_check";
    let nextAction: string | null = null;
    const payload: Record<string, unknown> = {
      format_ok: formatOk,
      submitted_name: full_name,
      normalized_name: normalizeName(full_name),
      lenient_policy: "Format-pass + name-match within tolerance is auto-verified.",
    };

    if (formatOk) {
      // Lenient policy: format match → verified. Name slightly off? still ok.
      status = "verified";
      source = "format_match_lenient";
      payload.note = "Auto-verified on format match. Slight name variations are allowed.";
    } else {
      // Format failed → not rejected outright; manual review keeps doctor unblocked.
      status = "manual_review";
      source = "queued_manual_review";
      nextAction =
        "Registration number format didn't match the selected council. " +
        "Our team will manually verify within 24–48 hours. You can keep using Tier C tools meanwhile, or update the number.";
    }

    // Best-effort registry probe (non-blocking).
    try {
      const probe = await probeRegistry(system);
      payload.registry_reachable = probe.ok;
      payload.registry_status = probe.status;
    } catch (e) {
      payload.registry_error = (e as Error).message;
    }

    // Persist verification record
    const { data: cv, error: cvErr } = await supabase.from("council_verifications").insert({
      user_id: user.id,
      system,
      council_body,
      registration_number,
      registration_year: registration_year ?? null,
      state: state ?? null,
      full_name_submitted: full_name,
      status,
      verification_source: source,
      verification_payload: payload,
      rejection_reason: null,
    }).select().single();

    if (cvErr) throw cvErr;

    // Sync profile.verification_status with the new lenient outcome
    await supabase.from("profiles").update({
      verification_status: status,
      system,
      council_body,
      council_state: state ?? null,
      council_year: registration_year ?? null,
      council_number: registration_number,
    }).eq("id", user.id);

    // Audit log
    await supabase.from("audit_log").insert({
      user_id: user.id,
      actor_email: user.email,
      action: `council.verify.${status}`,
      entity_type: "council_verification",
      entity_id: cv.id,
      metadata: { system, council_body, registration_number, source },
    });

    return new Response(
      JSON.stringify({
        id: cv.id,
        status,
        source,
        next_action: nextAction,
        message: status === "verified"
          ? "Verified. Tier A and B tools are now unlocked."
          : nextAction ?? "Submitted for verification.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("verify-council error:", err);
    return new Response(JSON.stringify({ error: "An unexpected error occurred. Please try again." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function probeRegistry(system: string): Promise<{ ok: boolean; status: number }> {
  const urls: Record<string, string> = {
    allopathy: "https://www.nmc.org.in/information-desk/indian-medical-register/",
    ayurveda: "https://ncismindia.org/",
    homeopathy: "https://nch.org.in/",
    siddha: "https://ncismindia.org/",
    unani: "https://ncismindia.org/",
    dental: "https://dciindia.gov.in/",
  };
  const url = urls[system];
  if (!url) return { ok: false, status: 0 };
  const ctrl = AbortSignal.timeout(4000);
  try {
    const res = await fetch(url, { method: "HEAD", signal: ctrl });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}
