// analyze-multi-modality-study — POST /functions/v1/analyze-multi-modality-study
// Body: { study_id }
// Reads the multi-modality study (with N legs already uploaded under
// /{user_id}/{study_id}/leg-{idx}/...), runs per-leg vision analysis and a
// cross-modality synthesis pass, then writes a single unified report into
// the existing `studies.report` shape with per-leg detail + a top-level
// synthesis section. Findings are inserted into the standard `findings` table
// tagged with `region = "Leg N — <modality>"` so existing UI keeps working.
//
// Auth: signed-in clinician. Quota: caller (frontend) consumes 2 scan units
// via check-and-consume-quota BEFORE calling this function. Tier gating
// (Pro / Pro+ only) is enforced both client-side and here.

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAuthCtx, clientIp } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/audit.ts";
import { sanitizeFile, scrubAnswersPHI } from "../_shared/phi.ts";
import { runChatCascade, type ChatMessage } from "../_shared/aiCascade.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

interface Body {
  study_id?: string;
}

interface MultiLeg {
  index: number;
  slug: string;
  label: string;
  category: string;
  storage_paths: string[];
}

interface FindingOut {
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  region?: string;
  anatomicalRegion?: string;
  observation?: string;
  impression?: string;
  recommendation?: string;
  icd10Code?: string;
  icd10Label?: string;
  snomedCode?: string;
  snomedLabel?: string;
  urgency?: "routine" | "urgent" | "stat";
  differentials?: Array<{ dx: string; likelihood: number }>;
}

interface LegReport {
  legIndex: number;
  legSlug: string;
  legLabel: string;
  legCategory: string;
  narrative: string;
  findings: FindingOut[];
  measurements?: Record<string, unknown>;
  informationGaps?: string[];
}

interface Synthesis {
  narrative: string;
  crossModalityFindings: FindingOut[];
  overallConfidence: number;
  unifiedImpression: string;
  unifiedRecommendations: string[];
  urgency: "routine" | "urgent" | "stat";
  informationGaps: string[];
  patientSummary: string;
}

const VISION_SUPPORTED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);
const MAX_IMAGES_PER_LEG = 4;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const PER_LEG_PROMPT = (modality: string) =>
  `You are Manthana, a clinical-grade medical imaging AI analysing one investigation (${modality}) that is part of a larger multi-modality study for the SAME patient.

You will receive: (a) the modality, (b) PHI-scrubbed combined questionnaire answers covering the whole patient, then (c) up to 4 images for THIS modality only.

Output ONLY valid JSON matching the schema. No prose, no markdown.

JSON SCHEMA:
{
  "narrative": "string — 2-4 sentences describing what THIS modality shows",
  "findings": [
    {
      "title": "string",
      "description": "string",
      "severity": "low|medium|high|critical",
      "confidence": 0.0-1.0,
      "region": "string?",
      "anatomicalRegion": "string?",
      "observation": "string?",
      "impression": "string?",
      "recommendation": "string?",
      "icd10Code": "string?",
      "icd10Label": "string?",
      "snomedCode": "string?",
      "snomedLabel": "string?",
      "urgency": "routine|urgent|stat?",
      "differentials": [{ "dx": "string", "likelihood": 0.0-1.0 }]
    }
  ],
  "measurements": { "key": "value" },
  "informationGaps": ["string"]
}

Rules:
- Confine findings to what THIS modality reveals. Do not speculate about other modalities.
- Never fabricate measurements. Use null/omit if uncertain.
- A licensed clinician will review every output.`;

const SYNTHESIS_PROMPT =
  `You are Manthana, a senior multi-disciplinary radiologist. You will receive the per-modality reports for a single patient who underwent 2–4 different investigations. Correlate them into ONE unified clinical report.

Output ONLY valid JSON matching the schema. No prose, no markdown.

JSON SCHEMA:
{
  "narrative": "string — 3-5 sentences explaining how the modalities together describe the patient's clinical picture",
  "crossModalityFindings": [
    {
      "title": "string — finding supported by ≥2 modalities or unique cross-modality insight",
      "description": "string — explicitly cite which modalities support this",
      "severity": "low|medium|high|critical",
      "confidence": 0.0-1.0,
      "region": "string?",
      "anatomicalRegion": "string?",
      "observation": "string?",
      "impression": "string?",
      "recommendation": "string?",
      "icd10Code": "string?",
      "icd10Label": "string?",
      "snomedCode": "string?",
      "snomedLabel": "string?",
      "urgency": "routine|urgent|stat?",
      "differentials": [{ "dx": "string", "likelihood": 0.0-1.0 }]
    }
  ],
  "overallConfidence": 0.0-1.0,
  "unifiedImpression": "string — single paragraph integrated impression",
  "unifiedRecommendations": ["string"],
  "urgency": "routine|urgent|stat",
  "informationGaps": ["string"],
  "patientSummary": "string — 2-3 sentences plain-language summary for the patient"
}

Rules:
- Increase confidence only when modalities AGREE; flag disagreement explicitly.
- Cross-modality findings should add value beyond restating per-leg findings.
- Use ICD-10 + SNOMED codes when applicable.
- A licensed clinician will review and sign.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const ctx = await getAuthCtx(req);
  if (!ctx) return jsonResponse({ error: "unauthorized" }, 401);

  let body: Body;
  try { body = await req.json(); } catch { return jsonResponse({ error: "invalid_json" }, 400); }
  const studyId = body.study_id;
  if (!studyId) return jsonResponse({ error: "study_id_required" }, 400);

  // Tier gate: Pro & Pro+ only
  const { data: sub } = await ctx.admin
    .from("user_subscriptions")
    .select("plan_code,status")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  const planCode = sub?.status === "active" ? (sub?.plan_code ?? "free") : "free";
  if (!["pro", "pro_plus", "enterprise"].includes(planCode)) {
    return jsonResponse({ error: "plan_upgrade_required", required: "pro" }, 402);
  }

  const { data: study, error } = await ctx.admin
    .from("studies")
    .select("id, user_id, is_multi_modality, multi_modality_legs, multi_modality_combined_qa, status")
    .eq("id", studyId).single();
  if (error || !study) return jsonResponse({ error: "study_not_found" }, 404);
  if (study.user_id !== ctx.userId) return jsonResponse({ error: "forbidden" }, 403);
  if (!study.is_multi_modality) return jsonResponse({ error: "not_multi_modality" }, 400);

  const legs = (study.multi_modality_legs as MultiLeg[] | null) ?? [];
  if (legs.length < 2 || legs.length > 4) {
    return jsonResponse({ error: "invalid_leg_count", count: legs.length }, 400);
  }

  const scrubbedAnswers = scrubAnswersPHI(
    (study.multi_modality_combined_qa as Record<string, unknown> | null) ?? {},
  );

  await ctx.admin.from("studies").update({
    status: "analyzing",
    multi_modality_combined_qa: scrubbedAnswers,
    progress: { stage: "queued", percent: 10, status: "Multi-modality analysis queued" },
    error_message: null,
  }).eq("id", studyId);

  await writeAudit(ctx.admin, {
    userId: ctx.userId, actorEmail: ctx.email,
    action: "study.multi.analyze.start",
    entityType: "study", entityId: studyId,
    metadata: { leg_count: legs.length, plan: planCode },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  const job = runMultiAnalysis(ctx.admin, {
    studyId,
    userId: ctx.userId,
    actorEmail: ctx.email,
    legs,
    answers: scrubbedAnswers,
  });

  // @ts-expect-error EdgeRuntime is a Deno Deploy global
  if (typeof EdgeRuntime !== "undefined" && typeof EdgeRuntime.waitUntil === "function") {
    // @ts-expect-error EdgeRuntime is a Deno Deploy global
    EdgeRuntime.waitUntil(job);
  } else {
    job.catch((e) => console.error("multi analyse background failed", e));
  }

  return jsonResponse({ study_id: studyId, status: "analyzing", legs: legs.length });
});

interface JobCtx {
  studyId: string;
  userId: string;
  actorEmail: string | null;
  legs: MultiLeg[];
  answers: Record<string, unknown>;
}

async function runMultiAnalysis(admin: SupabaseClient, job: JobCtx): Promise<void> {
  const setProgress = async (percent: number, stage: string, status: string) => {
    await admin.from("studies").update({
      progress: { stage, percent, status },
    }).eq("id", job.studyId);
  };

  try {
    const legReports: LegReport[] = [];
    const baseProgress = 15;
    const legSpan = 60; // 15 → 75
    const perLeg = legSpan / job.legs.length;

    for (let i = 0; i < job.legs.length; i++) {
      const leg = job.legs[i];
      const startPct = Math.round(baseProgress + perLeg * i);
      await setProgress(
        startPct,
        "inference",
        `Analysing leg ${i + 1}/${job.legs.length} — ${leg.label}`,
      );
      const images = await loadAndSanitize(admin, leg.storage_paths);
      const legReport = await analyseLeg(leg, images, job.answers);
      legReports.push(legReport);
    }

    await setProgress(78, "synthesis", "Cross-modality synthesis");
    const synthesis = await synthesise(legReports, job.answers);

    await setProgress(90, "narrative", "Composing unified report");
    await persistUnifiedReport(admin, job, legReports, synthesis);
    await setProgress(100, "complete", "Unified report ready for review");

    await writeAudit(admin, {
      userId: job.userId, actorEmail: job.actorEmail,
      action: "study.multi.analyze.complete",
      entityType: "study", entityId: job.studyId,
      metadata: {
        leg_count: job.legs.length,
        per_leg_findings: legReports.map((r) => r.findings.length),
        synthesis_findings: synthesis.crossModalityFindings.length,
        overall_confidence: synthesis.overallConfidence,
        urgency: synthesis.urgency,
      },
    });
  } catch (err) {
    console.error("analyze-multi-modality background failed", err);
    const message = err instanceof Error ? err.message : String(err);
    await admin.from("studies").update({
      status: "error",
      error_message: "Multi-modality analysis temporarily unavailable — please retry.",
      progress: { stage: "error", percent: 100, status: "Analysis failed — please retry" },
    }).eq("id", job.studyId);
    await writeAudit(admin, {
      userId: job.userId, actorEmail: job.actorEmail,
      action: "study.multi.analyze.error",
      entityType: "study", entityId: job.studyId,
      metadata: { error: message },
    });
  }
}

async function loadAndSanitize(
  admin: SupabaseClient,
  paths: string[],
): Promise<Array<{ b64: string; mime: string; bytes: number }>> {
  const out: Array<{ b64: string; mime: string; bytes: number }> = [];
  for (const path of paths.slice(0, MAX_IMAGES_PER_LEG)) {
    const { data: blob, error } = await admin.storage.from("studies").download(path);
    if (error || !blob) {
      console.warn("[multi] could not download", path, error);
      continue;
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const sanitized = sanitizeFile(bytes, blob.type);
    out.push({
      b64: encodeBase64(sanitized.bytes),
      mime: (blob.type || "application/octet-stream").toLowerCase(),
      bytes: sanitized.bytes.length,
    });
  }
  return out;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function analyseLeg(
  leg: MultiLeg,
  images: Array<{ b64: string; mime: string; bytes: number }>,
  combinedAnswers: Record<string, unknown>,
): Promise<LegReport> {
  const usable = images
    .filter((img) => VISION_SUPPORTED_MIME.has(img.mime) && img.bytes <= MAX_IMAGE_BYTES)
    .slice(0, MAX_IMAGES_PER_LEG)
    .map((img) => ({
      ...img,
      mime: img.mime === "image/jpg" ? "image/jpeg" : img.mime,
    }));

  if (usable.length === 0) {
    // Don't block synthesis — return an empty leg report with an information gap.
    return {
      legIndex: leg.index,
      legSlug: leg.slug,
      legLabel: leg.label,
      legCategory: leg.category,
      narrative:
        `No supported image content for ${leg.label}. Files were attached but could not be parsed (DICOM/PDF must be converted to PNG/JPEG before upload).`,
      findings: [],
      informationGaps: [`No analysable images for ${leg.label}.`],
    };
  }

  const userText = [
    `Modality: ${leg.label} (${leg.slug})`,
    `Category: ${leg.category}`,
    `Image count for this leg: ${usable.length}`,
    `Combined questionnaire (whole patient, PHI-scrubbed):`,
    JSON.stringify(combinedAnswers, null, 2),
    "",
    `Below this message you will see ${usable.length} medical image${usable.length === 1 ? "" : "s"} for THIS modality only.`,
    "Analyse them and return the JSON per the schema.",
  ].join("\n");

  const userContent: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } }
  > = [{ type: "text", text: userText }];

  for (const img of usable) {
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${img.mime};base64,${img.b64}`, detail: "high" },
    });
  }

  const messages: ChatMessage[] = [
    { role: "system", content: PER_LEG_PROMPT(leg.label) },
    { role: "user", content: userContent },
  ];

  const res = await runChatCascade({
    messages,
    modelSlug: "kimi-k2.6",
    vision: true,
    complexity: "high",
    jsonObject: true,
    temperature: 0.2,
    maxTokens: 3500,
    title: `Manthana - Multi Leg ${leg.index + 1}`,
  });

  const parsed = parseJson(res.text);
  const findings = sanitizeFindings(parsed.findings);
  return {
    legIndex: leg.index,
    legSlug: leg.slug,
    legLabel: leg.label,
    legCategory: leg.category,
    narrative: typeof parsed.narrative === "string" ? parsed.narrative : "",
    findings,
    measurements: (parsed.measurements as Record<string, unknown>) ?? undefined,
    informationGaps: Array.isArray(parsed.informationGaps)
      ? parsed.informationGaps as string[]
      : undefined,
  };
}

async function synthesise(
  legReports: LegReport[],
  combinedAnswers: Record<string, unknown>,
): Promise<Synthesis> {
  const userText = [
    `Combined questionnaire (PHI-scrubbed):`,
    JSON.stringify(combinedAnswers, null, 2),
    "",
    `Per-modality reports for the SAME patient (${legReports.length} legs):`,
    JSON.stringify(
      legReports.map((r) => ({
        leg: r.legIndex + 1,
        modality: r.legLabel,
        category: r.legCategory,
        narrative: r.narrative,
        findings: r.findings,
        measurements: r.measurements,
        informationGaps: r.informationGaps,
      })),
      null,
      2,
    ),
    "",
    "Produce the unified JSON per the schema.",
  ].join("\n");

  const messages: ChatMessage[] = [
    { role: "system", content: SYNTHESIS_PROMPT },
    { role: "user", content: userText },
  ];

  const res = await runChatCascade({
    messages,
    modelSlug: "kimi-k2.6",
    vision: false,
    complexity: "high",
    jsonObject: true,
    temperature: 0.2,
    maxTokens: 3500,
    title: "Manthana - Multi Synthesis",
  });

  const parsed = parseJson(res.text);
  return {
    narrative: typeof parsed.narrative === "string" ? parsed.narrative : "",
    crossModalityFindings: sanitizeFindings(parsed.crossModalityFindings),
    overallConfidence: clamp01(Number(parsed.overallConfidence ?? 0.6)),
    unifiedImpression: typeof parsed.unifiedImpression === "string" ? parsed.unifiedImpression : "",
    unifiedRecommendations: Array.isArray(parsed.unifiedRecommendations)
      ? (parsed.unifiedRecommendations as string[])
      : [],
    urgency: ["routine", "urgent", "stat"].includes(parsed.urgency as string)
      ? (parsed.urgency as Synthesis["urgency"])
      : "routine",
    informationGaps: Array.isArray(parsed.informationGaps)
      ? (parsed.informationGaps as string[])
      : [],
    patientSummary: typeof parsed.patientSummary === "string" ? parsed.patientSummary : "",
  };
}

function parseJson(raw: string): Record<string, unknown> {
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(cleaned) as Record<string, unknown>; }
  catch (e) { throw new Error(`model_returned_invalid_json: ${(e as Error).message}`); }
}

function sanitizeFindings(input: unknown): FindingOut[] {
  if (!Array.isArray(input)) return [];
  return input.map((raw) => {
    const f = raw as Partial<FindingOut>;
    return {
      ...f,
      title: String(f.title ?? "Untitled finding"),
      description: String(f.description ?? ""),
      severity: ["low", "medium", "high", "critical"].includes(f.severity as string)
        ? (f.severity as FindingOut["severity"]) : "low",
      confidence: clamp01(Number(f.confidence ?? 0.5)),
    } as FindingOut;
  });
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

async function persistUnifiedReport(
  admin: SupabaseClient,
  job: JobCtx,
  legReports: LegReport[],
  synthesis: Synthesis,
): Promise<void> {
  // Compose the unified `report` payload (compatible with existing ReportViewer
  // shape — synthesis fields are top-level, per-leg detail nested in `legs`).
  const unifiedReport = {
    isMultiModality: true,
    narrative: synthesis.narrative,
    findings: synthesis.crossModalityFindings, // top-level = cross-modality
    overallConfidence: synthesis.overallConfidence,
    unifiedImpression: synthesis.unifiedImpression,
    unifiedRecommendations: synthesis.unifiedRecommendations,
    urgency: synthesis.urgency,
    informationGaps: synthesis.informationGaps,
    patientSummary: synthesis.patientSummary,
    legs: legReports,
  };

  await admin.from("studies").update({
    narrative: synthesis.narrative,
    overall_confidence: synthesis.overallConfidence,
    information_gaps: synthesis.informationGaps,
    foundation_model_caveat:
      "Multi-modality synthesis correlates findings across investigations. Each leg was analysed independently, then a senior-radiologist-style integration pass produced this unified impression. Disagreements between modalities are flagged inside the cross-modality findings.",
    patient_summary: synthesis.patientSummary,
    report: unifiedReport as unknown as Record<string, unknown>,
    multi_modality_synthesis: synthesis as unknown as Record<string, unknown>,
    status: "awaiting_review",
  }).eq("id", job.studyId);

  // Insert a flat findings list — synthesis findings first, then per-leg.
  // Tag each row with `region` so existing filters keep working.
  const rows: Record<string, unknown>[] = [];
  let order = 0;
  for (const f of synthesis.crossModalityFindings) {
    rows.push(toFindingRow(job, f, order++, "Cross-modality synthesis"));
  }
  for (const leg of legReports) {
    for (const f of leg.findings) {
      rows.push(
        toFindingRow(job, f, order++, `Leg ${leg.legIndex + 1} — ${leg.legLabel}`),
      );
    }
  }
  if (rows.length > 0) {
    const { error: findingsErr } = await admin.from("findings").insert(rows);
    if (findingsErr) console.error("multi findings insert failed", findingsErr);
  }
}

function toFindingRow(
  job: JobCtx,
  f: FindingOut,
  order: number,
  regionPrefix: string,
): Record<string, unknown> {
  return {
    study_id: job.studyId,
    user_id: job.userId,
    title: f.title,
    description: f.description,
    severity: f.severity,
    confidence: f.confidence,
    region: f.region ? `${regionPrefix} · ${f.region}` : regionPrefix,
    anatomical_region: f.anatomicalRegion ?? null,
    observation: f.observation ?? null,
    impression: f.impression ?? null,
    recommendation: f.recommendation ?? null,
    icd10_code: f.icd10Code ?? null,
    icd10_label: f.icd10Label ?? null,
    snomed_code: f.snomedCode ?? null,
    snomed_label: f.snomedLabel ?? null,
    urgency: f.urgency ?? null,
    differentials: (f.differentials as unknown as Record<string, unknown>) ?? null,
    display_order: order,
  };
}
