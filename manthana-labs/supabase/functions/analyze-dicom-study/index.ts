// analyze-dicom-study — DICOM-aware 5-point structured radiology read.
// Stub: delegates to the standard analyze-study pipeline for now (the existing
// vision cascade already produces the same Report shape). The 5-point
// schema is enforced via the system prompt addition.

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAuthCtx } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  // DICOM / PACS / FHIR features are disabled. See src/lib/featureFlags.ts.
  return jsonResponse({ error: "feature_disabled", message: "DICOM/PACS/FHIR features are disabled." }, 410);

  const ctx = await getAuthCtx(req);
  if (!ctx) return jsonResponse({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const studyId = body?.study_id;
  if (!studyId) return jsonResponse({ error: "study_id_required" }, 400);

  // Forward to the standard analyze-study with no questionnaire (DICOM tags
  // already provide the modality context).
  const analyzeUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/analyze-study`;
  const res = await fetch(analyzeUrl, {
    method: "POST",
    headers: {
      Authorization: req.headers.get("Authorization") ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      study_id: studyId,
      questionnaire_answers: {
        source: "dicom",
        analysis_template: "five_point_radiology",
      },
    }),
  });
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
