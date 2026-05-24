// fhir-push — POSTs a FHIR R4 DiagnosticReport bundle to a configured RIS.
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
  const { study_id, connection_id } = body ?? {};
  if (!study_id || !connection_id) {
    return jsonResponse({ error: "study_id_connection_id_required" }, 400);
  }

  const { data: conn } = await ctx.admin
    .from("hospital_connections")
    .select("*")
    .eq("id", connection_id)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!conn?.ris_fhir_base_url) {
    return jsonResponse({ error: "ris_endpoint_not_configured" }, 400);
  }

  const { data: study } = await ctx.admin
    .from("studies")
    .select("id, modality_label, narrative, report, created_at, review_confirmed_at")
    .eq("id", study_id)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!study) return jsonResponse({ error: "study_not_found" }, 404);

  const bundle = {
    resourceType: "DiagnosticReport",
    id: `manthana-${study.id}`,
    status: study.review_confirmed_at ? "final" : "preliminary",
    code: { text: study.modality_label },
    effectiveDateTime: study.created_at,
    issued: study.review_confirmed_at ?? new Date().toISOString(),
    conclusion: study.narrative,
  };

  let status: "success" | "error" = "success";
  let responseCode: number | null = null;
  let errMsg: string | null = null;

  try {
    const res = await fetch(`${conn.ris_fhir_base_url.replace(/\/$/, "")}/DiagnosticReport`, {
      method: "POST",
      headers: {
        "Content-Type": "application/fhir+json",
        ...(conn.ris_auth_header ? { Authorization: conn.ris_auth_header } : {}),
      },
      body: JSON.stringify(bundle),
    });
    responseCode = res.status;
    if (!res.ok) {
      status = "error";
      errMsg = `RIS returned ${res.status}`;
    }
  } catch (e) {
    status = "error";
    errMsg = e instanceof Error ? e.message : "fetch_failed";
  }

  const { data: row } = await ctx.admin
    .from("dicom_exports")
    .insert({
      study_id,
      user_id: ctx.userId,
      connection_id,
      kind: "fhir",
      target_url: `${conn.ris_fhir_base_url}/DiagnosticReport`,
      status,
      response_code: responseCode,
      error: errMsg,
    })
    .select("*")
    .single();

  return jsonResponse({ export: row });
});
