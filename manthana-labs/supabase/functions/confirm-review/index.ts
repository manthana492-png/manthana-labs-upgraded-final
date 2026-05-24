// confirm-review — POST /functions/v1/confirm-review
// Body: { study_id, note?: string }
// Marks a study as reviewed by the authenticated clinician. This is the
// gate that unlocks PDF download.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAuthCtx, clientIp } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/audit.ts";

interface Body {
  study_id?: string;
  note?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const ctx = await getAuthCtx(req);
  if (!ctx) return jsonResponse({ error: "unauthorized" }, 401);

  let body: Body;
  try { body = await req.json(); } catch { return jsonResponse({ error: "invalid_json" }, 400); }
  const studyId = body.study_id?.trim();
  if (!studyId) return jsonResponse({ error: "missing_study_id" }, 400);
  const note = body.note?.toString().slice(0, 2000) ?? null;

  const { data: study, error: fetchErr } = await ctx.admin
    .from("studies")
    .select("id, user_id, status, narrative")
    .eq("id", studyId)
    .maybeSingle();
  if (fetchErr) return jsonResponse({ error: fetchErr.message }, 500);
  if (!study) return jsonResponse({ error: "not_found" }, 404);
  if (study.user_id !== ctx.userId) return jsonResponse({ error: "forbidden" }, 403);
  if (study.status !== "awaiting_review") {
    return jsonResponse({ error: "invalid_state", status: study.status }, 409);
  }
  if (!study.narrative) {
    return jsonResponse({ error: "no_report_to_review" }, 409);
  }

  const reviewedAt = new Date().toISOString();
  const { error: updateErr } = await ctx.admin
    .from("studies")
    .update({
      status: "delivered",
      review_confirmed_at: reviewedAt,
      reviewing_doctor_note: note,
    })
    .eq("id", studyId);
  if (updateErr) return jsonResponse({ error: updateErr.message }, 500);

  await writeAudit(ctx.admin, {
    userId: ctx.userId,
    actorEmail: ctx.email,
    action: "study.review_confirmed",
    entityType: "study",
    entityId: studyId,
    metadata: { reviewed_at: reviewedAt, note_length: note?.length ?? 0 },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
  });

  return jsonResponse({ ok: true, reviewedAt });
});
