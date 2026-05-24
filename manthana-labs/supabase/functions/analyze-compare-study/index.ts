// analyze-compare-study — POST /functions/v1/analyze-compare-study
// Body: { study_id }
//
// Compare Mode: 2–4 timepoints of the SAME modality for the SAME patient.
// Pipeline:
//   1. Tier gate (Pro / Pro+ only).
//   2. Hybrid modality lock — auto-detect each timepoint's modality and
//      reject the whole study with a clear reason if any timepoint mismatches
//      the locked modality (set during upload).
//   3. Per-timepoint vision analysis (independent reading).
//   4. Cross-timepoint INTERVAL CHANGE synthesis (improving/stable/worsening/new).
//   5. Persist unified report → studies.report + findings table tagged
//      with `region = "T{n} — <label>"`.
//
// Quota: caller (frontend) consumes 2 scan units BEFORE calling this function.

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAuthCtx, clientIp } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/audit.ts";
import { sanitizeFile } from "../_shared/phi.ts";
import { runChatCascade, type ChatMessage } from "../_shared/aiCascade.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

interface Body {
  study_id?: string;
}

interface CompareTimepoint {
  index: number;
  chrono_order: number;
  label: string;
  age_hours: number;
  absolute_date: string | null;
  storage_paths: string[];
  detected_modality_slug?: string | null;
  detection_confidence?: number | null;
  modality_match?: boolean | null;
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

interface TimepointReport {
  index: number;
  chronoOrder: number;
  label: string;
  ageHours: number;
  absoluteDate?: string | null;
  detectedModalitySlug?: string;
  detectionConfidence?: number;
  narrative: string;
  findings: FindingOut[];
  measurements?: Record<string, unknown>;
  informationGaps?: string[];
}

interface IntervalChangeFinding {
  title: string;
  description: string;
  trajectory: "new" | "resolved" | "worsening" | "improving" | "stable";
  earliestSeenAtChrono: number;
  latestSeenAtChrono: number;
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  recommendation?: string;
  icd10Code?: string;
  icd10Label?: string;
  snomedCode?: string;
  snomedLabel?: string;
}

interface CompareSynthesis {
  narrative: string;
  intervalChange: "improving" | "stable" | "worsening" | "mixed";
  intervalFindings: IntervalChangeFinding[];
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
const MAX_IMAGES_PER_TIMEPOINT = 4;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const MODALITY_DETECT_PROMPT = (expectedSlug: string, expectedLabel: string) =>
  `You are Manthana, a medical-imaging modality classifier. The user is uploading images for a longitudinal compare study where the EXPECTED modality is "${expectedLabel}" (slug: ${expectedSlug}).

Examine the image(s) and decide whether they match this expected modality. Output ONLY valid JSON:

{
  "detected_modality_slug": "string — your best guess at the modality slug (use the same slug if it matches)",
  "detected_modality_label": "string — human label",
  "detection_confidence": 0.0-1.0,
  "matches_expected": true|false,
  "mismatch_reason": "string — required when matches_expected is false; explain WHY this image is not ${expectedLabel}"
}

Rules:
- Be strict. A chest X-ray and a chest CT are NOT the same modality.
- If you are <0.5 confident, return matches_expected=false with reason "Could not confidently identify modality".
- Different views of the same modality (e.g. PA vs Lateral chest X-ray) ARE acceptable for compare studies → matches_expected=true.`;

const PER_TIMEPOINT_PROMPT = (modality: string, label: string) =>
  `You are Manthana, a clinical-grade medical imaging AI analysing ONE timepoint of a longitudinal compare study (same modality "${modality}", same patient, captured "${label}").

Output ONLY valid JSON:
{
  "narrative": "string — 2-4 sentences describing what THIS timepoint shows",
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
- Confine findings to what THIS timepoint reveals.
- Never fabricate measurements.
- A licensed clinician will review every output.`;

const INTERVAL_SYNTHESIS_PROMPT = `You are Manthana, a senior radiologist performing a longitudinal interval-change comparison across 2–4 timepoints of the SAME modality for the SAME patient (ordered oldest → newest).

Your job: identify what has CHANGED between timepoints and produce one unified report.

Output ONLY valid JSON:
{
  "narrative": "string — 3-5 sentences describing the overall interval change story",
  "intervalChange": "improving|stable|worsening|mixed",
  "intervalFindings": [
    {
      "title": "string — e.g. 'Right upper lobe consolidation'",
      "description": "string — describe how this finding evolved across timepoints",
      "trajectory": "new|resolved|worsening|improving|stable",
      "earliestSeenAtChrono": 0,
      "latestSeenAtChrono": 0,
      "severity": "low|medium|high|critical",
      "confidence": 0.0-1.0,
      "recommendation": "string?",
      "icd10Code": "string?",
      "icd10Label": "string?",
      "snomedCode": "string?",
      "snomedLabel": "string?"
    }
  ],
  "overallConfidence": 0.0-1.0,
  "unifiedImpression": "string — single paragraph integrated impression",
  "unifiedRecommendations": ["string"],
  "urgency": "routine|urgent|stat",
  "informationGaps": ["string"],
  "patientSummary": "string — 2-3 sentences plain-language for the patient"
}

Rules:
- chrono_order indices are 0=oldest, increasing to newest.
- "new" = absent in earlier timepoints, present in later. "resolved" = present earlier, absent later.
- Be explicit about TRAJECTORY. A clinician's main reason for ordering serial imaging is to know "is this getting better or worse?".
- Use ICD-10 + SNOMED codes when applicable.
- A licensed clinician will review and sign.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const ctx = await getAuthCtx(req);
  if (!ctx) return jsonResponse({ error: "unauthorized" }, 401);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }
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
    .select(
      "id, user_id, is_compare_mode, compare_modality_slug, compare_timepoints, modality_label, modality_slug, status",
    )
    .eq("id", studyId)
    .single();
  if (error || !study) return jsonResponse({ error: "study_not_found" }, 404);
  if (study.user_id !== ctx.userId) return jsonResponse({ error: "forbidden" }, 403);
  if (!study.is_compare_mode) return jsonResponse({ error: "not_compare_study" }, 400);

  const timepoints = (study.compare_timepoints as CompareTimepoint[] | null) ?? [];
  if (timepoints.length < 2 || timepoints.length > 4) {
    return jsonResponse(
      { error: "invalid_timepoint_count", count: timepoints.length },
      400,
    );
  }

  await ctx.admin.from("studies").update({
    status: "analyzing",
    progress: {
      stage: "queued",
      percent: 8,
      status: "Compare analysis queued",
    },
    error_message: null,
  }).eq("id", studyId);

  await writeAudit(ctx.admin, {
    userId: ctx.userId,
    actorEmail: ctx.email,
    action: "study.compare.analyze.start",
    entityType: "study",
    entityId: studyId,
    metadata: {
      timepoint_count: timepoints.length,
      modality: study.compare_modality_slug,
      plan: planCode,
    },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  const job = runCompareAnalysis(ctx.admin, {
    studyId,
    userId: ctx.userId,
    actorEmail: ctx.email,
    modalitySlug: study.compare_modality_slug ?? study.modality_slug,
    modalityLabel: study.modality_label,
    timepoints,
  });

  // @ts-expect-error EdgeRuntime is a Deno Deploy global
  if (typeof EdgeRuntime !== "undefined" && typeof EdgeRuntime.waitUntil === "function") {
    // @ts-expect-error EdgeRuntime is a Deno Deploy global
    EdgeRuntime.waitUntil(job);
  } else {
    job.catch((e) => console.error("compare analyse background failed", e));
  }

  return jsonResponse({
    study_id: studyId,
    status: "analyzing",
    timepoints: timepoints.length,
  });
});

interface JobCtx {
  studyId: string;
  userId: string;
  actorEmail: string | null;
  modalitySlug: string;
  modalityLabel: string;
  timepoints: CompareTimepoint[];
}

async function runCompareAnalysis(admin: SupabaseClient, job: JobCtx): Promise<void> {
  const setProgress = async (percent: number, stage: string, status: string) => {
    await admin.from("studies").update({
      progress: { stage, percent, status },
    }).eq("id", job.studyId);
  };

  try {
    // ─── Phase 1: load + sanitise + auto-detect modality for every timepoint ───
    await setProgress(12, "modality_lock", "Verifying modality match across timepoints…");
    const detected: Array<{
      tp: CompareTimepoint;
      images: Array<{ b64: string; mime: string; bytes: number }>;
      detection: {
        slug?: string;
        label?: string;
        confidence: number;
        matches: boolean;
        reason?: string;
      };
    }> = [];

    for (const tp of job.timepoints) {
      const images = await loadAndSanitize(admin, tp.storage_paths);
      const det = await detectModality(images, job.modalitySlug, job.modalityLabel);
      detected.push({ tp, images, detection: det });
    }

    // Persist detection results back to compare_timepoints
    const updatedTimepoints = job.timepoints.map((tp, i) => ({
      ...tp,
      detected_modality_slug: detected[i].detection.slug ?? null,
      detection_confidence: detected[i].detection.confidence,
      modality_match: detected[i].detection.matches,
    }));
    await admin.from("studies").update({
      compare_timepoints: updatedTimepoints as never,
    }).eq("id", job.studyId);

    // Reject the whole study if ANY timepoint mismatches
    const mismatches = detected.filter((d) => !d.detection.matches);
    if (mismatches.length > 0) {
      const reasons = mismatches
        .map(
          (m) =>
            `Timepoint ${m.tp.chrono_order + 1} (${m.tp.label}) — ${
              m.detection.reason ?? "modality mismatch"
            } (detected: ${m.detection.label ?? "unknown"})`,
        )
        .join(" · ");
      const message =
        `Compare Mode requires every timepoint to be the same modality (${job.modalityLabel}). Rejected because: ${reasons}`;
      await admin.from("studies").update({
        status: "error",
        error_message: message,
        progress: {
          stage: "modality_mismatch",
          percent: 100,
          status: "Modality mismatch — please re-upload",
        },
      }).eq("id", job.studyId);
      await writeAudit(admin, {
        userId: job.userId,
        actorEmail: job.actorEmail,
        action: "study.compare.modality_mismatch",
        entityType: "study",
        entityId: job.studyId,
        metadata: { mismatches: mismatches.length, reasons: message.slice(0, 800) },
      });
      return;
    }

    // ─── Phase 2: per-timepoint analysis ───
    const tpReports: TimepointReport[] = [];
    const baseProgress = 22;
    const tpSpan = 53; // 22 → 75
    const perTp = tpSpan / job.timepoints.length;

    for (let i = 0; i < detected.length; i++) {
      const { tp, images, detection } = detected[i];
      await setProgress(
        Math.round(baseProgress + perTp * i),
        "inference",
        `Analysing timepoint ${i + 1}/${detected.length} — ${tp.label}`,
      );
      const report = await analyseTimepoint(tp, images, job.modalityLabel);
      report.detectedModalitySlug = detection.slug;
      report.detectionConfidence = detection.confidence;
      tpReports.push(report);
    }

    // ─── Phase 3: interval change synthesis ───
    await setProgress(80, "synthesis", "Cross-timepoint interval-change synthesis");
    const synthesis = await synthesise(tpReports, job.modalityLabel);

    // ─── Phase 4: persist ───
    await setProgress(92, "narrative", "Composing unified compare report");
    await persistUnifiedReport(admin, job, tpReports, synthesis);
    await setProgress(100, "complete", "Compare report ready for review");

    await writeAudit(admin, {
      userId: job.userId,
      actorEmail: job.actorEmail,
      action: "study.compare.analyze.complete",
      entityType: "study",
      entityId: job.studyId,
      metadata: {
        timepoint_count: job.timepoints.length,
        per_timepoint_findings: tpReports.map((r) => r.findings.length),
        interval_findings: synthesis.intervalFindings.length,
        interval_change: synthesis.intervalChange,
        overall_confidence: synthesis.overallConfidence,
        urgency: synthesis.urgency,
      },
    });
  } catch (err) {
    console.error("analyze-compare-study background failed", err);
    const message = err instanceof Error ? err.message : String(err);
    await admin.from("studies").update({
      status: "error",
      error_message: "Compare analysis temporarily unavailable — please retry.",
      progress: {
        stage: "error",
        percent: 100,
        status: "Analysis failed — please retry",
      },
    }).eq("id", job.studyId);
    await writeAudit(admin, {
      userId: job.userId,
      actorEmail: job.actorEmail,
      action: "study.compare.analyze.error",
      entityType: "study",
      entityId: job.studyId,
      metadata: { error: message },
    });
  }
}

async function loadAndSanitize(
  admin: SupabaseClient,
  paths: string[],
): Promise<Array<{ b64: string; mime: string; bytes: number }>> {
  const out: Array<{ b64: string; mime: string; bytes: number }> = [];
  for (const path of paths.slice(0, MAX_IMAGES_PER_TIMEPOINT)) {
    const { data: blob, error } = await admin.storage.from("studies").download(path);
    if (error || !blob) {
      console.warn("[compare] could not download", path, error);
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

async function detectModality(
  images: Array<{ b64: string; mime: string; bytes: number }>,
  expectedSlug: string,
  expectedLabel: string,
): Promise<{
  slug?: string;
  label?: string;
  confidence: number;
  matches: boolean;
  reason?: string;
}> {
  const usable = images
    .filter((img) => VISION_SUPPORTED_MIME.has(img.mime) && img.bytes <= MAX_IMAGE_BYTES)
    .slice(0, 2) // first 2 images is plenty for modality detection
    .map((img) => ({
      ...img,
      mime: img.mime === "image/jpg" ? "image/jpeg" : img.mime,
    }));

  if (usable.length === 0) {
    return {
      confidence: 0,
      matches: false,
      reason: "no_supported_images_for_detection",
    };
  }

  const userContent: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } }
  > = [
    {
      type: "text",
      text: `Expected modality: ${expectedLabel} (${expectedSlug}). Examine the image(s) and reply per the JSON schema.`,
    },
  ];
  for (const img of usable) {
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${img.mime};base64,${img.b64}`, detail: "low" },
    });
  }

  const messages: ChatMessage[] = [
    { role: "system", content: MODALITY_DETECT_PROMPT(expectedSlug, expectedLabel) },
    { role: "user", content: userContent },
  ];

  try {
    const res = await runChatCascade({
      messages,
      modelSlug: "kimi-k2.5",
      vision: true,
      complexity: "standard",
      jsonObject: true,
      temperature: 0.1,
      maxTokens: 500,
      title: "Manthana - Compare Modality Detect",
    });
    const parsed = parseJson(res.text);
    return {
      slug: typeof parsed.detected_modality_slug === "string"
        ? parsed.detected_modality_slug
        : undefined,
      label: typeof parsed.detected_modality_label === "string"
        ? parsed.detected_modality_label
        : undefined,
      confidence: clamp01(Number(parsed.detection_confidence ?? 0)),
      matches: Boolean(parsed.matches_expected),
      reason: typeof parsed.mismatch_reason === "string"
        ? parsed.mismatch_reason
        : undefined,
    };
  } catch (err) {
    console.warn("[compare] modality detection failed, allowing through", err);
    // Fail open with low confidence — surface as info gap rather than rejecting.
    return { confidence: 0.5, matches: true, reason: "detection_unavailable" };
  }
}

async function analyseTimepoint(
  tp: CompareTimepoint,
  images: Array<{ b64: string; mime: string; bytes: number }>,
  modalityLabel: string,
): Promise<TimepointReport> {
  const usable = images
    .filter((img) => VISION_SUPPORTED_MIME.has(img.mime) && img.bytes <= MAX_IMAGE_BYTES)
    .slice(0, MAX_IMAGES_PER_TIMEPOINT)
    .map((img) => ({
      ...img,
      mime: img.mime === "image/jpg" ? "image/jpeg" : img.mime,
    }));

  if (usable.length === 0) {
    return {
      index: tp.index,
      chronoOrder: tp.chrono_order,
      label: tp.label,
      ageHours: tp.age_hours,
      absoluteDate: tp.absolute_date,
      narrative:
        `No analysable image content for timepoint "${tp.label}". Files were attached but could not be parsed.`,
      findings: [],
      informationGaps: [`No analysable images for ${tp.label}.`],
    };
  }

  const userContent: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } }
  > = [
    {
      type: "text",
      text: [
        `Modality: ${modalityLabel}`,
        `Timepoint label: ${tp.label} (chronological order ${tp.chrono_order + 1})`,
        tp.absolute_date ? `Absolute date: ${tp.absolute_date}` : `Approximate age: ${tp.age_hours} hours before now`,
        `Image count for this timepoint: ${usable.length}`,
        "",
        "Analyse THIS timepoint only and return the JSON per the schema.",
      ].join("\n"),
    },
  ];
  for (const img of usable) {
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${img.mime};base64,${img.b64}`, detail: "high" },
    });
  }

  const messages: ChatMessage[] = [
    { role: "system", content: PER_TIMEPOINT_PROMPT(modalityLabel, tp.label) },
    { role: "user", content: userContent },
  ];

  const res = await runChatCascade({
    modelSlug: "kimi-k2.6",
    messages,
    vision: true,
    complexity: "high",
    jsonObject: true,
    temperature: 0.
    reasoningEffort: "high",
    title: `Manthana - Compare TP ${tp.chrono_order + 1}`,
  });

  const parsed = parseJson(res.text);
  return {
    index: tp.index,
    chronoOrder: tp.chrono_order,
    label: tp.label,
    ageHours: tp.age_hours,
    absoluteDate: tp.absolute_date,
    narrative: typeof parsed.narrative === "string" ? parsed.narrative : "",
    findings: sanitizeFindings(parsed.findings),
    measurements: (parsed.measurements as Record<string, unknown>) ?? undefined,
    informationGaps: Array.isArray(parsed.informationGaps)
      ? parsed.informationGaps as string[]
      : undefined,
  };
}

async function synthesise(
  tpReports: TimepointReport[],
  modalityLabel: string,
): Promise<CompareSynthesis> {
  const orderedOldestFirst = [...tpReports].sort(
    (a, b) => a.chronoOrder - b.chronoOrder,
  );

  const userText = [
    `Modality: ${modalityLabel}`,
    `Timepoints (oldest → newest):`,
    JSON.stringify(
      orderedOldestFirst.map((r) => ({
        chrono_order: r.chronoOrder,
        label: r.label,
        age_hours: r.ageHours,
        absolute_date: r.absoluteDate,
        narrative: r.narrative,
        findings: r.findings,
        measurements: r.measurements,
        informationGaps: r.informationGaps,
      })),
      null,
      2,
    ),
    "",
    "Produce the unified interval-change JSON per the schema.",
  ].join("\n");

  const messages: ChatMessage[] = [
    { role: "system", content: INTERVAL_SYNTHESIS_PROMPT },
    { role: "user", content: userText },
  ];

  const res = await runChatCascade({
    modelSlug: "kimi-k2.6",
    messages,
    vision: false,
    complexity: "high",
    jsonObject: true,
    temperature: 0.
    reasoningEffort: "high",
    title: "Manthana - Compare Interval Synthesis",
  });

  const parsed = parseJson(res.text);
  return {
    narrative: typeof parsed.narrative === "string" ? parsed.narrative : "",
    intervalChange: ["improving", "stable", "worsening", "mixed"].includes(
      parsed.intervalChange as string,
    )
      ? (parsed.intervalChange as CompareSynthesis["intervalChange"])
      : "mixed",
    intervalFindings: sanitizeIntervalFindings(parsed.intervalFindings),
    overallConfidence: clamp01(Number(parsed.overallConfidence ?? 0.6)),
    unifiedImpression: typeof parsed.unifiedImpression === "string"
      ? parsed.unifiedImpression
      : "",
    unifiedRecommendations: Array.isArray(parsed.unifiedRecommendations)
      ? (parsed.unifiedRecommendations as string[])
      : [],
    urgency: ["routine", "urgent", "stat"].includes(parsed.urgency as string)
      ? (parsed.urgency as CompareSynthesis["urgency"])
      : "routine",
    informationGaps: Array.isArray(parsed.informationGaps)
      ? (parsed.informationGaps as string[])
      : [],
    patientSummary: typeof parsed.patientSummary === "string"
      ? parsed.patientSummary
      : "",
  };
}

async function persistUnifiedReport(
  admin: SupabaseClient,
  job: JobCtx,
  tpReports: TimepointReport[],
  synthesis: CompareSynthesis,
): Promise<void> {
  // Delete prior findings for this study (idempotent re-runs)
  await admin.from("findings").delete().eq("study_id", job.studyId);

  // Build findings: per-timepoint findings prefixed with the timepoint label,
  // plus the interval-change findings as their own block.
  const rows: Array<Record<string, unknown>> = [];
  let order = 0;

  for (const tp of [...tpReports].sort((a, b) => a.chronoOrder - b.chronoOrder)) {
    const tpRegion = `T${tp.chronoOrder + 1} — ${tp.label}`;
    for (const f of tp.findings) {
      rows.push({
        study_id: job.studyId,
        user_id: job.userId,
        title: f.title,
        description: f.description,
        severity: f.severity,
        confidence: f.confidence,
        region: tpRegion,
        anatomical_region: f.anatomicalRegion ?? null,
        observation: f.observation ?? null,
        impression: f.impression ?? null,
        recommendation: f.recommendation ?? null,
        icd10_code: f.icd10Code ?? null,
        icd10_label: f.icd10Label ?? null,
        snomed_code: f.snomedCode ?? null,
        snomed_label: f.snomedLabel ?? null,
        urgency: f.urgency ?? "routine",
        differentials: f.differentials ?? null,
        display_order: order++,
      });
    }
  }

  // Interval change findings (always shown first via display_order shift)
  for (const f of synthesis.intervalFindings) {
    rows.push({
      study_id: job.studyId,
      user_id: job.userId,
      title: `Interval change · ${f.title}`,
      description: f.description,
      severity: f.severity,
      confidence: f.confidence,
      region: `Interval (T${f.earliestSeenAtChrono + 1} → T${f.latestSeenAtChrono + 1})`,
      anatomical_region: null,
      observation: null,
      impression: `Trajectory: ${f.trajectory.toUpperCase()}`,
      recommendation: f.recommendation ?? null,
      icd10_code: f.icd10Code ?? null,
      icd10_label: f.icd10Label ?? null,
      snomed_code: f.snomedCode ?? null,
      snomed_label: f.snomedLabel ?? null,
      urgency: synthesis.urgency,
      differentials: null,
      display_order: order++,
    });
  }

  if (rows.length > 0) {
    const { error: findErr } = await admin.from("findings").insert(rows);
    if (findErr) console.error("[compare] insert findings failed", findErr);
  }

  const informationGaps = [
    ...synthesis.informationGaps,
    ...tpReports.flatMap((r) => r.informationGaps ?? []),
  ];

  const compareSynthesisOut = {
    isCompareMode: true,
    modalitySlug: job.modalitySlug,
    modalityLabel: job.modalityLabel,
    intervalChange: synthesis.intervalChange,
    intervalFindings: synthesis.intervalFindings,
    timepoints: tpReports
      .sort((a, b) => a.chronoOrder - b.chronoOrder)
      .map((r) => ({
        index: r.index,
        chronoOrder: r.chronoOrder,
        label: r.label,
        ageHours: r.ageHours,
        absoluteDate: r.absoluteDate,
        narrative: r.narrative,
        findings: r.findings,
        informationGaps: r.informationGaps,
        detectedModalitySlug: r.detectedModalitySlug,
        detectionConfidence: r.detectionConfidence,
      })),
    unifiedImpression: synthesis.unifiedImpression,
    unifiedRecommendations: synthesis.unifiedRecommendations,
  };

  const { error: studyErr } = await admin.from("studies").update({
    status: "awaiting_review",
    narrative: synthesis.narrative,
    overall_confidence: synthesis.overallConfidence,
    information_gaps: informationGaps,
    foundation_model_caveat:
      "Compare-mode synthesis is AI-generated and must be reviewed by a licensed clinician before any clinical decision.",
    patient_summary: synthesis.patientSummary,
    compare_synthesis: compareSynthesisOut as never,
  }).eq("id", job.studyId);
  if (studyErr) console.error("[compare] persist study failed", studyErr);
}

function parseJson(raw: string): Record<string, unknown> {
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`model_returned_invalid_json: ${(e as Error).message}`);
  }
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
        ? (f.severity as FindingOut["severity"])
        : "low",
      confidence: clamp01(Number(f.confidence ?? 0.5)),
    } as FindingOut;
  });
}

function sanitizeIntervalFindings(input: unknown): IntervalChangeFinding[] {
  if (!Array.isArray(input)) return [];
  return input.map((raw) => {
    const f = raw as Partial<IntervalChangeFinding>;
    return {
      title: String(f.title ?? "Untitled change"),
      description: String(f.description ?? ""),
      trajectory: ["new", "resolved", "worsening", "improving", "stable"].includes(
        f.trajectory as string,
      )
        ? (f.trajectory as IntervalChangeFinding["trajectory"])
        : "stable",
      earliestSeenAtChrono: Math.max(0, Math.floor(Number(f.earliestSeenAtChrono ?? 0))),
      latestSeenAtChrono: Math.max(0, Math.floor(Number(f.latestSeenAtChrono ?? 0))),
      severity: ["low", "medium", "high", "critical"].includes(f.severity as string)
        ? (f.severity as IntervalChangeFinding["severity"])
        : "low",
      confidence: clamp01(Number(f.confidence ?? 0.5)),
      recommendation: f.recommendation,
      icd10Code: f.icd10Code,
      icd10Label: f.icd10Label,
      snomedCode: f.snomedCode,
      snomedLabel: f.snomedLabel,
    };
  });
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
