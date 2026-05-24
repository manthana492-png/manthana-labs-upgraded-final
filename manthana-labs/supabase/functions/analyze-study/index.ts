// analyze-study — POST /functions/v1/analyze-study
// Body: { study_id, modality_slug?, questionnaire_answers }
// Returns immediately with {status:"analyzing"} and runs the analysis as a
// background task (EdgeRuntime.waitUntil). Progress is streamed via Realtime
// updates on the `studies` row.
//
// Routing: cloud-only via shared `runChatCascade` (Kimi K2 → Qwen-VL →
// DeepSeek → Lovable AI). PHI is scrubbed from bytes + free-text before any
// upstream call. Model identity is never exposed to the client.

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAuthCtx, clientIp } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/audit.ts";
import {
  tierForSlug, catalogForSlug, categoryFromSlug, type Tier,
} from "../_shared/modalities.ts";
import { sanitizeFile, scrubAnswersPHI } from "../_shared/phi.ts";
import { runChatCascade, type ChatMessage } from "../_shared/aiCascade.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

interface Body {
  study_id?: string;
  modality_slug?: string;
  questionnaire_answers?: Record<string, unknown>;
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

interface WebCitationOut {
  title: string;
  url: string;
  source?: string;
  snippet?: string;
}

interface ReportOut {
  narrative: string;
  findings: FindingOut[];
  overallConfidence: number;
  informationGaps?: string[];
  foundationModelCaveat?: string;
  patientSummary?: string;
  webCitations?: WebCitationOut[];
}

const SYSTEM_PROMPT = (modality: string) => `You are Manthana, a clinical-grade medical imaging AI assistant analyzing a ${modality} study.

You will receive: (a) the modality and PHI-scrubbed questionnaire answers as text, then (b) one or more medical images attached to the same user message. Examine every attached image before composing the report.


CRITICAL RULES:
- Output ONLY valid JSON matching the schema below. No prose, no markdown.
- Findings ranked by severity (critical → low).
- Each finding includes ICD-10 + SNOMED CT codes when applicable.
- Always include foundationModelCaveat and informationGaps.
- Confidence values are 0.0-1.0 floats.
- Never fabricate measurements. If uncertain, say so in informationGaps.
- A licensed clinician will review every output before delivery.
- Use the web search tool to find 2–4 authoritative recent references
  (PubMed, ClinicalTrials.gov, NIH, NICE, WHO, AAFP, UpToDate, peer-reviewed
  journals) directly relevant to the principal finding(s) — including the
  most recent guidelines, clinical trials, and pharmacological updates.
  Return them in "webCitations": [{title, url, source, snippet}]. NEVER invent
  URLs — only cite pages the search actually returned.

JSON SCHEMA:
{
  "narrative": "string — 2-4 sentence overall summary",
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
  "overallConfidence": 0.0-1.0,
  "informationGaps": ["string"],
  "foundationModelCaveat": "string",
  "patientSummary": "string — 2-3 sentence plain-language summary for the patient",
  "webCitations": [
    { "title": "string", "url": "https://...", "source": "PubMed|NIH|ClinicalTrials|AAFP|NICE|WHO|UpToDate", "snippet": "string" }
  ]
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const ctx = await getAuthCtx(req);
  if (!ctx) return jsonResponse({ error: "unauthorized" }, 401);

  let body: Body;
  try { body = await req.json(); } catch { return jsonResponse({ error: "invalid_json" }, 400); }

  const studyId = body.study_id;
  if (!studyId) return jsonResponse({ error: "study_id_required" }, 400);

  const { data: study, error } = await ctx.admin
    .from("studies")
    .select("id, user_id, modality_slug, modality_label, tier, catalog, storage_paths, status")
    .eq("id", studyId).single();
  if (error || !study) return jsonResponse({ error: "study_not_found" }, 404);
  if (study.user_id !== ctx.userId) return jsonResponse({ error: "forbidden" }, 403);

  const slug = body.modality_slug ?? study.modality_slug;
  const tier = tierForSlug(slug) as Tier;
  const catalog = catalogForSlug(slug);

  // Scrub free-text PHI from questionnaire answers BEFORE persisting or sending anywhere.
  const scrubbedAnswers = scrubAnswersPHI(body.questionnaire_answers ?? {});

  await ctx.admin.from("studies").update({
    status: "analyzing",
    modality_slug: slug,
    modality_category: categoryFromSlug(slug),
    tier, catalog,
    questionnaire_answers: scrubbedAnswers,
    progress: { stage: "queued", percent: 20, status: "Analysis queued" },
    error_message: null,
  }).eq("id", studyId);

  await writeAudit(ctx.admin, {
    userId: ctx.userId, actorEmail: ctx.email,
    action: "study.analyze.start",
    entityType: "study", entityId: studyId,
    metadata: { modality_slug: slug, tier, catalog },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  const job = runAnalysis(ctx.admin, {
    studyId,
    userId: ctx.userId,
    actorEmail: ctx.email,
    modalitySlug: slug,
    tier,
    storagePaths: (study.storage_paths as string[] | null) ?? [],
    answers: scrubbedAnswers,
  });

  // @ts-expect-error - EdgeRuntime is a Deno Deploy global
  if (typeof EdgeRuntime !== "undefined" && typeof EdgeRuntime.waitUntil === "function") {
    // @ts-expect-error - EdgeRuntime is a Deno Deploy global
    EdgeRuntime.waitUntil(job);
  } else {
    job.catch((e) => console.error("analyze background failed", e));
  }

  return jsonResponse({
    study_id: studyId,
    status: "analyzing",
    tier, catalog,
  });
});

interface JobCtx {
  studyId: string;
  userId: string;
  actorEmail: string | null;
  modalitySlug: string;
  tier: Tier;
  storagePaths: string[];
  answers: Record<string, unknown>;
}

async function runAnalysis(admin: SupabaseClient, job: JobCtx): Promise<void> {
  const setProgress = async (percent: number, stage: string, status: string) => {
    await admin.from("studies").update({
      progress: { stage, percent, status },
    }).eq("id", job.studyId);
  };

  try {
    await setProgress(30, "preprocessing", "Sanitising files (PHI strip)");
    const images = await loadAndSanitize(admin, job.storagePaths);
    await setProgress(45, "preprocessing", "Files sanitised");

    await setProgress(55, "inference", "Running AI analysis");
    const { report, source } = await cloudAnalysis(job, images, setProgress);

    await setProgress(85, "narrative", "Composing report");
    await persistReport(admin, job, report, source);
    await setProgress(100, "complete", "Report ready for review");
  } catch (err) {
    console.error("analyze-study background failed", err);
    const message = err instanceof Error ? err.message : String(err);
    await admin.from("studies").update({
      status: "error",
      error_message: "Analysis service temporarily unavailable — please retry.",
      progress: { stage: "error", percent: 100, status: "Analysis failed — please retry" },
    }).eq("id", job.studyId);
    await writeAudit(admin, {
      userId: job.userId, actorEmail: job.actorEmail,
      action: "study.analyze.error",
      entityType: "study", entityId: job.studyId,
      metadata: { error: message },
    });
  }
}

async function loadAndSanitize(
  admin: SupabaseClient,
  paths: string[],
): Promise<Array<{ path: string; b64: string; mime: string; bytes: number }>> {
  const out: Array<{ path: string; b64: string; mime: string; bytes: number }> = [];
  for (const path of paths.slice(0, 4)) {
    const { data: blob, error } = await admin.storage.from("studies").download(path);
    if (error || !blob) {
      console.warn("could not download for sanitisation", path, error);
      continue;
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const sanitized = sanitizeFile(bytes, blob.type);
    if (sanitized.scrubbed.length > 0) {
      const sanitizedPath = path.replace(/\/([^/]+)$/, "/sanitized/$1");
      await admin.storage.from("studies").upload(sanitizedPath, sanitized.bytes, {
        contentType: blob.type, upsert: true,
      });
    }
    out.push({
      path,
      b64: encodeBase64(sanitized.bytes),
      mime: blob.type || "application/octet-stream",
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

// ─────────────────── Cloud AI: shared cascade ───────────────────
// OpenRouter multimodal contract (verified against
// https://openrouter.ai/docs/features/multimodal/images):
//   - messages[].content is an array of parts: text first, then image_url parts.
//   - image_url.url accepts either a public URL or a base64 data URI.
//   - Supported image MIME types: image/png, image/jpeg, image/webp, image/gif.
// All chosen vision models (Kimi K2.5/K2.6, Gemini 3/3.1, GPT-5.4) accept this
// exact OpenAI-compatible shape — no model-specific reshaping needed.
const VISION_SUPPORTED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);
const MAX_IMAGES_PER_REQUEST = 4;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB per image — keeps payload < ~32MB total.

async function cloudAnalysis(
  job: JobCtx,
  images: Array<{ b64: string; mime: string; bytes: number }>,
  setProgress?: (percent: number, stage: string, status: string) => Promise<void>,
): Promise<{ report: ReportOut; source: string }> {
  // Filter to only image MIME types the gateway actually accepts.
  const usable = images
    .filter((img) => {
      const mime = img.mime.toLowerCase();
      const ok = VISION_SUPPORTED_MIME.has(mime) && img.bytes <= MAX_IMAGE_BYTES;
      if (!ok) {
        console.warn("[analyze-study] skipping unsupported image", {
          mime: img.mime, bytes: img.bytes,
        });
      }
      return ok;
    })
    .slice(0, MAX_IMAGES_PER_REQUEST)
    .map((img) => ({
      ...img,
      mime: img.mime.toLowerCase() === "image/jpg" ? "image/jpeg" : img.mime.toLowerCase(),
    }));

  if (usable.length === 0) {
    throw new Error(
      "no_supported_images: uploaded files must be PNG / JPEG / WebP / GIF (≤8MB each). " +
        "DICOM and TIFF must be converted to JPEG/PNG before upload.",
    );
  }

  // ────────────────── Stage 1: Clinical Observation ──────────────────
  if (setProgress) {
    await setProgress(55, "inference", "Agent Swarm Step 1/3: Analyzing clinical images & context");
  }

  const observationSys = `You are the Lead Clinical Observation Agent at Manthana. Your task is to perform an exhaustive clinical review of the attached ${job.modalitySlug} study.
Analyze the images and clinical history to draft detailed observations, including potential regions, pathologies, differentials, and severity (low/medium/high/critical).
Write a professional, clinical-grade narrative and bulleted findings.`;

  const userText = [
    `Modality: ${job.modalitySlug}`,
    `Image count: ${usable.length}`,
    `Questionnaire answers (PHI-scrubbed):`,
    JSON.stringify(job.answers, null, 2),
    "",
    `Below this message you will see ${usable.length} medical image${usable.length === 1 ? "" : "s"}.`,
    "Analyze them carefully and write down your deep clinical observations.",
  ].join("\n");

  const userContent: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } }
  > = [{ type: "text", text: userText }];

  for (const img of usable) {
    userContent.push({
      type: "image_url",
      image_url: {
        url: `data:${img.mime};base64,${img.b64}`,
        detail: "high",
      },
    });
  }

  const step1Messages: ChatMessage[] = [
    { role: "system", content: observationSys },
    { role: "user", content: userContent },
  ];

  const step1Result = await runChatCascade({
    messages: step1Messages,
    modelSlug: "kimi-k2.6",
    vision: true,
    complexity: "high",
    temperature: 1.0, // Best for thinking models
    maxTokens: 3000,
    title: "Manthana — Stage 1: Clinical Observation",
  });

  const clinicalObservationsText = step1Result.text;
  let sourceProvider = step1Result.provider;

  // ────────────────── Stage 2: Guidelines Verification ──────────────────
  if (setProgress) {
    await setProgress(70, "inference", "Agent Swarm Step 2/3: Querying medical guidelines & web references");
  }

  const verificationSys = `You are the Medical Guideline & Verification Agent at Manthana. Your task is to verify clinical observations against recent peer-reviewed guidelines and search databases.
Using the clinical observations provided, find 2-4 authoritative references (from PubMed, NICE, WHO, NIH, etc.) directly relevant to the core diagnoses.
Provide citations with accurate title, URL, source, and a brief snippet.`;

  const verificationUserText = [
    `Original clinical history/context:`,
    JSON.stringify(job.answers, null, 2),
    "",
    `Raw Clinical Observations from our Lead Diagnostic Agent:`,
    clinicalObservationsText,
    "",
    `Perform web searches to identify 2-4 authoritative recent references that directly support or update clinical pathways for these findings. Return a structured list of citations.`,
  ].join("\n");

  const step2Messages: ChatMessage[] = [
    { role: "system", content: verificationSys },
    { role: "user", content: verificationUserText },
  ];

  // Disable thinking for web search step because native search is incompatible with thinking
  const step2Result = await runChatCascade({
    messages: step2Messages,
    modelSlug: "kimi-k2.6",
    complexity: "high",
    thinkingDisabled: true,
    enableWebSearch: true,
    webMaxResults: 5,
    temperature: 0.2,
    maxTokens: 2000,
    title: "Manthana — Stage 2: Guidelines Verification",
  });

  const verificationText = step2Result.text;
  const webAnnotations = step2Result.webAnnotations;

  // ────────────────── Stage 3: Synthesis & Formatter ──────────────────
  if (setProgress) {
    await setProgress(80, "inference", "Agent Swarm Step 3/3: Synthesizing clinical report JSON");
  }

  const sysPrompt = SYSTEM_PROMPT(job.modalitySlug);
  const synthesisUserText = [
    `We have completed our clinical observation and guidelines verification.`,
    `Now, compile these inputs into a clinical report matching the target JSON schema EXACTLY.`,
    "",
    `=== RAW DIAGNOSTIC OBSERVATIONS ===`,
    clinicalObservationsText,
    "",
    `=== VERIFIED GUIDELINES & CITATIONS ===`,
    verificationText,
    "",
    `=== ORIGINAL QUESTIONNAIRE ANSWERS ===`,
    JSON.stringify(job.answers, null, 2),
    "",
    `Construct a complete, highly precise, clinical-grade final JSON report matching the specified schema.`,
  ].join("\n");

  const step3Messages: ChatMessage[] = [
    { role: "system", content: sysPrompt },
    { role: "user", content: synthesisUserText },
  ];

  const step3Result = await runChatCascade({
    messages: step3Messages,
    modelSlug: "kimi-k2.6",
    complexity: "high",
    jsonObject: true,
    temperature: 0.2,
    maxTokens: 4000,
    title: "Manthana — Stage 3: Report Synthesis",
  });

  const report = parseJsonReport(step3Result.text);

  // Merge web search annotations
  const citationsFromStep2: WebCitationOut[] = [];
  if (webAnnotations && webAnnotations.length > 0) {
    for (const a of webAnnotations) {
      citationsFromStep2.push({
        title: a.title ?? a.url,
        url: a.url,
        snippet: a.snippet,
        source: hostname(a.url),
      });
    }
  }

  const seen = new Set((report.webCitations ?? []).map((c) => c.url));
  const extras = citationsFromStep2.filter((a) => !seen.has(a.url));
  report.webCitations = [...(report.webCitations ?? []), ...extras].slice(0, 6);

  return { report, source: `${sourceProvider} + agent-swarm` };
}

function hostname(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function parseJsonReport(raw: string): ReportOut {
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  let parsed: unknown;
  try { parsed = JSON.parse(cleaned); } catch (e) {
    throw new Error(`model_returned_invalid_json: ${(e as Error).message}`);
  }
  const r = parsed as Partial<ReportOut>;
  if (!r.narrative || !Array.isArray(r.findings) || typeof r.overallConfidence !== "number") {
    throw new Error("report_missing_required_fields");
  }
  r.overallConfidence = clamp01(r.overallConfidence);
  r.findings = (r.findings ?? []).map((f) => ({
    ...f,
    confidence: clamp01(f.confidence ?? 0.5),
    severity: ["low", "medium", "high", "critical"].includes(f.severity as string)
      ? f.severity : "low",
  })) as FindingOut[];
  return r as ReportOut;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

async function persistReport(
  admin: SupabaseClient,
  job: JobCtx,
  report: ReportOut,
  source: string,
): Promise<void> {
  const citations = (report.webCitations ?? [])
    .filter((c) => typeof c.url === "string" && c.url.startsWith("http"))
    .slice(0, 6);

  await admin.from("studies").update({
    narrative: report.narrative,
    overall_confidence: report.overallConfidence,
    information_gaps: report.informationGaps ?? null,
    foundation_model_caveat: report.foundationModelCaveat ?? null,
    patient_summary: report.patientSummary ?? null,
    web_citations: citations.length > 0 ? citations : null,
    report: { ...report, webCitations: citations } as unknown as Record<string, unknown>,
    status: "awaiting_review",
  }).eq("id", job.studyId);

  if (report.findings.length > 0) {
    const rows = report.findings.map((f, idx) => ({
      study_id: job.studyId,
      user_id: job.userId,
      title: f.title,
      description: f.description,
      severity: f.severity,
      confidence: f.confidence,
      region: f.region ?? null,
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
      display_order: idx,
    }));
    const { error: findingsErr } = await admin.from("findings").insert(rows);
    if (findingsErr) console.error("findings insert failed", findingsErr);
  }

  await writeAudit(admin, {
    userId: job.userId, actorEmail: job.actorEmail,
    action: "study.analyze.complete",
    entityType: "study", entityId: job.studyId,
    metadata: {
      source,
      modality_slug: job.modalitySlug,
      tier: job.tier,
      finding_count: report.findings.length,
      overall_confidence: report.overallConfidence,
    },
  });
}
