// dicom-export — builds DICOM SR / encapsulated-PDF / secondary-capture
// objects from a study's report and STOW-RS pushes them to a configured PACS.
//
// Supported `kinds`:
//   - "sr"  : Basic Text Structured Report (TID 2000-shaped)
//   - "pdf" : Encapsulated PDF DICOM object wrapping the generated report PDF
//   - "sc"  : (reserved) secondary capture — currently returns a clear "not_supported"
//
// Auth: caller JWT. Plan/role gating happens at the UI level, but we also
// re-check the connection ownership here so other users can't push to a
// connection they don't own.

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAuthCtx, clientIp } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/audit.ts";
import {
  buildBasicTextSrDicom,
  buildEncapsulatedPdfDicom,
  buildStowMultipart,
} from "../_shared/dicom.ts";

type Kind = "sr" | "pdf" | "sc";

interface Body {
  study_id?: string;
  connection_id?: string;
  kinds?: Kind[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  // DICOM / PACS / FHIR features are disabled. See src/lib/featureFlags.ts.
  return jsonResponse({ error: "feature_disabled", message: "DICOM/PACS/FHIR features are disabled." }, 410);

  const ctx = await getAuthCtx(req);
  if (!ctx) return jsonResponse({ error: "unauthorized" }, 401);

  const body = (await req.json().catch(() => ({}))) as Body;
  const { study_id, connection_id, kinds } = body;
  if (!study_id || !connection_id || !Array.isArray(kinds) || kinds.length === 0) {
    return jsonResponse({ error: "study_id_connection_id_kinds_required" }, 400);
  }

  // Connection must belong to caller.
  const { data: conn } = await ctx.admin
    .from("hospital_connections")
    .select("*")
    .eq("id", connection_id)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!conn) return jsonResponse({ error: "connection_not_found" }, 404);
  if (!conn.enabled) return jsonResponse({ error: "connection_disabled" }, 400);
  if (!conn.pacs_stow_url) {
    return jsonResponse({ error: "pacs_stow_url_not_configured" }, 400);
  }

  // Pull study (must belong to caller).
  const { data: study } = await ctx.admin
    .from("studies")
    .select(
      "id, user_id, modality_label, modality_slug, narrative, report, study_instance_uid, patient_ref_short, review_confirmed_at",
    )
    .eq("id", study_id)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!study) return jsonResponse({ error: "study_not_found" }, 404);

  // Extract impressions / recommendations from the structured report if present.
  const reportObj = (study.report ?? {}) as Record<string, unknown>;
  const impressions: string[] = Array.isArray(reportObj.impressions)
    ? (reportObj.impressions as unknown[]).map((s) => String(s)).filter(Boolean)
    : [];
  const recommendations: string[] = Array.isArray(reportObj.recommendations)
    ? (reportObj.recommendations as unknown[]).map((s) => String(s)).filter(Boolean)
    : [];

  const builtParts: Array<{ kind: Kind; bytes: Uint8Array; sopUid: string }> = [];

  for (const kind of kinds) {
    if (kind === "sr") {
      const built = buildBasicTextSrDicom({
        studyInstanceUid: study.study_instance_uid ?? undefined,
        patientRefShort: study.patient_ref_short ?? undefined,
        narrative: (study.narrative as string) ?? "AI-assisted report",
        impressions,
        recommendations,
        signedAt: (study.review_confirmed_at as string) ?? undefined,
      });
      builtParts.push({ kind, bytes: built.bytes, sopUid: built.sopInstanceUid });
    } else if (kind === "pdf") {
      // Generate the PDF via the existing generate-pdf function and wrap it.
      const pdfRes = await ctx.admin.functions.invoke("generate-pdf", {
        body: { study_id },
      });
      // generate-pdf may return a signed URL or raw bytes — handle both.
      let pdfBytes: Uint8Array | null = null;
      const data = pdfRes.data as Record<string, unknown> | null;
      const signedUrl = data && typeof data.url === "string" ? (data.url as string) : null;
      if (signedUrl) {
        const r = await fetch(signedUrl);
        if (r.ok) pdfBytes = new Uint8Array(await r.arrayBuffer());
      } else if (data && typeof data.pdf_base64 === "string") {
        const bin = atob(data.pdf_base64 as string);
        pdfBytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) pdfBytes[i] = bin.charCodeAt(i);
      }
      if (!pdfBytes) {
        await ctx.admin.from("dicom_exports").insert({
          study_id,
          user_id: ctx.userId,
          connection_id,
          kind,
          target_url: conn.pacs_stow_url,
          status: "error",
          error: "pdf_generation_failed",
        });
        continue;
      }
      const built = buildEncapsulatedPdfDicom({
        pdfBytes,
        studyInstanceUid: study.study_instance_uid ?? undefined,
        patientRefShort: study.patient_ref_short ?? undefined,
        documentTitle: `${study.modality_label} — AI-assisted report`,
        modality: "DOC",
      });
      builtParts.push({ kind, bytes: built.bytes, sopUid: built.sopInstanceUid });
    } else if (kind === "sc") {
      await ctx.admin.from("dicom_exports").insert({
        study_id,
        user_id: ctx.userId,
        connection_id,
        kind,
        target_url: conn.pacs_stow_url,
        status: "error",
        error: "secondary_capture_not_supported_yet",
      });
    }
  }

  if (builtParts.length === 0) {
    return jsonResponse({ exports: [], error: "nothing_built" }, 200);
  }

  // STOW-RS push. We send each object as its own request to make per-object
  // success/error tracking easy.
  const exportsOut: Array<Record<string, unknown>> = [];
  for (const part of builtParts) {
    const { body: multipart, contentType } = buildStowMultipart([part.bytes]);
    let status: "success" | "error" = "success";
    let responseCode: number | null = null;
    let errMsg: string | null = null;
    let respExcerpt: string | null = null;
    try {
      const res = await fetch(conn.pacs_stow_url, {
        method: "POST",
        headers: {
          "Content-Type": contentType,
          Accept: "application/dicom+json",
          ...(conn.pacs_auth_header ? { Authorization: conn.pacs_auth_header } : {}),
        },
        body: multipart,
        signal: AbortSignal.timeout(30_000),
      });
      responseCode = res.status;
      const txt = await res.text().catch(() => "");
      respExcerpt = txt.slice(0, 800);
      if (!res.ok) {
        status = "error";
        errMsg = `STOW-RS returned ${res.status}`;
      }
    } catch (e) {
      status = "error";
      errMsg = e instanceof Error ? e.message : "stow_push_failed";
    }

    const { data: row } = await ctx.admin
      .from("dicom_exports")
      .insert({
        study_id,
        user_id: ctx.userId,
        connection_id,
        kind: part.kind,
        target_url: conn.pacs_stow_url,
        status,
        response_code: responseCode,
        response_body_excerpt: respExcerpt,
        error: errMsg,
        sop_instance_uid: part.sopUid,
      })
      .select("*")
      .single();
    if (row) exportsOut.push(row);
  }

  await ctx.admin
    .from("hospital_connections")
    .update({ last_push_at: new Date().toISOString() })
    .eq("id", connection_id);

  await writeAudit(ctx.admin, {
    userId: ctx.userId,
    actorEmail: ctx.email,
    action: "dicom.export",
    entityType: "study",
    entityId: study_id,
    metadata: {
      connection_id,
      kinds,
      results: exportsOut.map((r) => ({ kind: r.kind, status: r.status, code: r.response_code })),
    },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonResponse({ exports: exportsOut });
});
