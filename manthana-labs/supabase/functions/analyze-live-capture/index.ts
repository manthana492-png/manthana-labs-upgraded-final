// analyze-live-capture — Live capture pipeline (production).
//
// Capture modes:
//   • video  : doctor records ≤20s clip on-device. Client extracts up to 4
//              evenly-spaced JPEG frames before upload (vision models cannot
//              consume raw webm). The clip is also stored for audit/re-review.
//   • photos : doctor takes 1–4 still photos.
//
// Three actions in one endpoint:
//   POST { action: "init", specialty_slug, kind, frame_count?, photo_count?, patient_ref_short? }
//        → creates a draft Study and returns signed upload slots.
//
//   POST { action: "analyze_pass1", study_id }
//        → sends the frames/photos to the vision cascade, returns 2-4
//          follow-up questions.
//
//   POST { action: "analyze_pass2", study_id, follow_up_answers }
//        → re-runs with the answers + web search, persists final report.
//
// Routing: shared `runChatCascade` (vision-mode) — primary OpenRouter vision
// models with Lovable AI Gemini fallback. Model identity never exposed.

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAuthCtx } from "../_shared/auth.ts";
import { runChatCascade, type ChatMessage } from "../_shared/aiCascade.ts";

const STUDIES_BUCKET = "studies";
const MAX_PHOTOS = 4;
const MAX_FRAMES = 4;
const SIGNED_URL_TTL_SEC = 60 * 15;
const CITATION_TIMEOUT_MS = 45_000;

interface SpecialtyPreset {
  slug: string;
  label: string;
  category: string;
  systemPrompt: string;
}

const COMMON_TAIL = `
Output STRICT JSON with this shape and no extra text:
{
  "findings": [{
    "title": "<short>", "severity": "low|medium|high|critical",
    "confidence": 0.0-1.0, "observation": "<seen>", "impression": "<1-line>",
    "recommendation": "<next step>", "anatomicalRegion": "<region>",
    "urgency": "routine|urgent|stat",
    "differentials": [{ "dx": "<dx>", "likelihood": 0.0-1.0 }]
  }],
  "narrative": "<2-3 sentence>", "overallConfidence": 0.0-1.0,
  "redFlags": ["..."], "informationGaps": ["..."]
}
Be conservative. Lower confidence when uncertain.`;

const SPECIALTIES: Record<string, SpecialtyPreset> = {
  live_emergency_triage: {
    slug: "live_emergency_triage", label: "Emergency Triage", category: "Video",
    systemPrompt: `You are an emergency clinical AI watching a 20-second bedside video. Report pallor, cyanosis, jaundice, FAST symmetry, breathing pattern, GCS estimate, abnormal movements.${COMMON_TAIL}`,
  },
  live_neurology: {
    slug: "live_neurology", label: "Neurology", category: "Video",
    systemPrompt: `You are a neurology AI watching a movement-disorder video. Report tremor (rest/intention/postural), bradykinesia decrement, dyskinesia, gait (festination/freezing), and estimate UPDRS-III sub-score.${COMMON_TAIL}`,
  },
  live_oral_medicine: {
    slug: "live_oral_medicine", label: "Oral Medicine & Dentistry", category: "Video",
    systemPrompt: `You are an oral medicine AI watching an intraoral video. Describe tongue, gums, floor of mouth, tonsil grade 0–4, lesion border character, differential (SCC vs candidiasis vs lichen planus vs aphthous). State biopsy vs observation.${COMMON_TAIL}`,
  },
  live_dermatology: {
    slug: "live_dermatology", label: "Dermatology", category: "Photo",
    systemPrompt: `You are a dermatology AI. Score ABCDE for moles, wound tissue %, rash morphology + distribution, nail changes, burn depth.${COMMON_TAIL}`,
  },
  live_ent: {
    slug: "live_ent", label: "ENT", category: "Video",
    systemPrompt: `You are an ENT AI. Identify ear/throat/nose then report TM (light reflex, color, contour, perforation), tonsil grade, peritonsillar fullness, septum, turbinate, polyps. Conclude AOM vs OME, abscess risk.${COMMON_TAIL}`,
  },
  live_ophthalmology: {
    slug: "live_ophthalmology", label: "Ophthalmology", category: "Photo",
    systemPrompt: `You are an ophthalmology AI. Report conjunctival injection, scleral jaundice, corneal clarity/ulcer, anterior chamber/hypopyon, pupil size/symmetry, ptosis/proptosis. Flag urgent referrals.${COMMON_TAIL}`,
  },
  live_respiratory: {
    slug: "live_respiratory", label: "Respiratory", category: "Video",
    systemPrompt: `You are a pulmonology AI. From a 20s chest video report RR, symmetry, accessory muscles, retractions, pursed-lip breathing, paradoxical movement. Classify distress severity and likely COPD/asthma/edema/pneumonia pattern.${COMMON_TAIL}`,
  },
  live_orthopedics: {
    slug: "live_orthopedics", label: "Orthopedics", category: "Video",
    systemPrompt: `You are an orthopedics AI. Report ROM, gait pattern (antalgic/Trendelenburg/steppage/scissor), posture, joint swelling distribution.${COMMON_TAIL}`,
  },
  live_neonatology: {
    slug: "live_neonatology", label: "Neonatology", category: "Video",
    systemPrompt: `You are a neonatology AI. Score Silverman-Anderson /10, Kramer jaundice zone 1-5, fontanelle, tone, activity. Flag sepsis behavioral pattern.${COMMON_TAIL}`,
  },
  live_geriatrics: {
    slug: "live_geriatrics", label: "Geriatrics", category: "Video",
    systemPrompt: `You are a geriatrics AI. Identify TUG fall risk vs pressure-sore staging vs CAM delirium vs sarcopenia visual signs.${COMMON_TAIL}`,
  },
  live_obstetrics_general: {
    slug: "live_obstetrics_general", label: "OB/Antenatal General", category: "Video",
    systemPrompt: `You are an obstetrics AI. Report pedal/sacral edema, conjunctival/palmar pallor, respiratory effort, posture. Flag pre-eclampsia red flags.${COMMON_TAIL}`,
  },
  live_psychiatry_mse: {
    slug: "live_psychiatry_mse", label: "Psychiatry MSE", category: "Video",
    systemPrompt: `You are a psychiatry AI. Score visible MSE: appearance, psychomotor, eye contact, speech, affect, thought-content cues.${COMMON_TAIL}`,
  },
  live_auto_detect: {
    slug: "live_auto_detect", label: "Auto-detect", category: "Video",
    systemPrompt: `You are a versatile clinical AI. First identify body part / scenario / specialty from the provided frames. Then perform the appropriate exam (emergency, neuro, oral, derm, ENT, ophtho, respiratory, ortho, neonatology, geriatrics, obstetrics, psychiatry MSE). State the detected scenario in the narrative.${COMMON_TAIL}`,
  },
};

function getPreset(slug: string): SpecialtyPreset {
  return SPECIALTIES[slug] ?? SPECIALTIES.live_auto_detect;
}

// ─────────────────────────── Main handler ───────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const ctx = await getAuthCtx(req);
  if (!ctx) return jsonResponse({ error: "unauthorized" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const action = String(body.action ?? "");
  try {
    if (action === "init") return await handleInit(ctx, body);
    if (action === "analyze_pass1") return await handlePass1(ctx, body);
    if (action === "analyze_pass2") return await handlePass2(ctx, body);
    return jsonResponse({ error: "unknown_action", action }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[analyze-live-capture] error:", msg, e);
    return jsonResponse({ error: "internal_error", message: msg }, 500);
  }
});

// ─────────────────────────── INIT ───────────────────────────
async function handleInit(ctx: NonNullable<Awaited<ReturnType<typeof getAuthCtx>>>, body: Record<string, unknown>) {
  const specialtySlug = String(body.specialty_slug ?? "live_auto_detect");
  const preset = getPreset(specialtySlug);
  const kindRaw = String(body.kind ?? "video");
  const kind: "video" | "photos" = kindRaw === "photos" ? "photos" : "video";
  const frameCount = clampInt(body.frame_count, 0, MAX_FRAMES, kind === "video" ? MAX_FRAMES : 0);
  const photoCount = clampInt(body.photo_count, 0, MAX_PHOTOS, kind === "photos" ? MAX_PHOTOS : 0);
  if (kind === "photos" && photoCount === 0) {
    return jsonResponse({ error: "photo_count_required" }, 400);
  }

  const patientRef = typeof body.patient_ref_short === "string"
    ? (body.patient_ref_short as string).slice(0, 40) : null;

  const studyId = crypto.randomUUID();
  const baseDir = `${ctx.userId}/${studyId}`;
  const videoPath = kind === "video" ? `${baseDir}/live_capture.webm` : null;
  const framePaths: string[] = kind === "video"
    ? Array.from({ length: frameCount }, (_, i) => `${baseDir}/frame_${i + 1}.jpg`)
    : [];
  const photoPaths: string[] = kind === "photos"
    ? Array.from({ length: photoCount }, (_, i) => `${baseDir}/photo_${i + 1}.jpg`)
    : [];

  // Allow vision pass to find frames OR photos.
  const aiPaths = kind === "video" ? framePaths : photoPaths;
  const allPaths = [
    ...(videoPath ? [videoPath] : []),
    ...framePaths,
    ...photoPaths,
  ];

  const { error: insertError } = await ctx.admin.from("studies").insert({
    id: studyId,
    user_id: ctx.userId,
    modality_slug: preset.slug,
    modality_label: preset.label,
    modality_category: preset.category,
    tier: "H",
    catalog: "hybrid_nvidia_quaasx108",
    status: "uploading",
    patient_ref_short: patientRef,
    is_live_capture: true,
    live_capture_kind: kind,
    live_capture_pass: 0,
    live_capture_video_path: videoPath,
    live_photo_paths: aiPaths,
    storage_paths: allPaths,
    progress: { stage: "awaiting_upload", pct: 5, label: "Waiting for upload…" },
  });
  if (insertError) throw insertError;

  // Issue signed upload URLs in parallel.
  async function sign(path: string) {
    const { data, error } = await ctx.admin.storage
      .from(STUDIES_BUCKET)
      .createSignedUploadUrl(path);
    if (error) throw error;
    return { url: data.signedUrl, token: data.token, path: data.path };
  }

  const [videoUpload, frameUploads, photoUploads] = await Promise.all([
    videoPath ? sign(videoPath) : Promise.resolve(null),
    Promise.all(framePaths.map(sign)),
    Promise.all(photoPaths.map(sign)),
  ]);

  return jsonResponse({
    study_id: studyId,
    kind,
    video_path: videoPath,
    photo_paths: aiPaths,
    video_upload: videoUpload,
    frame_uploads: frameUploads,
    photo_uploads: photoUploads,
    holoscan_enabled: !!Deno.env.get("HOLOSCAN_INFERENCE_URL"),
  });
}

// ─────────────────────────── PASS 1 ───────────────────────────
async function handlePass1(ctx: NonNullable<Awaited<ReturnType<typeof getAuthCtx>>>, body: Record<string, unknown>) {
  const studyId = String(body.study_id ?? "");
  if (!studyId) return jsonResponse({ error: "missing_study_id" }, 400);

  const { data: study, error: getErr } = await ctx.admin
    .from("studies").select("*").eq("id", studyId).eq("user_id", ctx.userId).maybeSingle();
  if (getErr) throw getErr;
  if (!study) return jsonResponse({ error: "study_not_found" }, 404);

  await ctx.admin.from("studies")
    .update({ status: "analyzing", progress: { stage: "pass1_preparing", pct: 25, label: "Preparing images for vision model…" } })
    .eq("id", studyId);

  const preset = getPreset(study.modality_slug);

  // Resolve image (frame OR photo) signed URLs the vision model will fetch.
  const imagePaths: string[] = Array.isArray(study.live_photo_paths)
    ? study.live_photo_paths as string[]
    : [];
  if (imagePaths.length === 0) {
    return jsonResponse({ error: "no_images_to_analyze" }, 400);
  }
  const imageUrls = await signMany(ctx, imagePaths);

  await ctx.admin.from("studies")
    .update({ progress: { stage: "pass1_measurements", pct: 35, label: "Running enhanced measurements…" } })
    .eq("id", studyId);

  // Optional Holoscan call (works on the original video if available).
  const videoUrl = study.live_capture_video_path
    ? await signOne(ctx, study.live_capture_video_path)
    : null;
  const holoscan = videoUrl ? await callHoloscan(videoUrl).catch(() => null) : null;

  await ctx.admin.from("studies")
    .update({ progress: { stage: "pass1_vision", pct: 50, label: "AI vision is examining the images…" } })
    .eq("id", studyId);

  const captureKind = study.live_capture_kind ?? "video";
  const userText = [
    `Specialty: ${preset.label}`,
    `Capture mode: ${captureKind === "photos" ? "still photos" : "video frames extracted from a short clip"}`,
    `Number of images: ${imageUrls.length}`,
    holoscan ? `Holoscan measurements:\n${JSON.stringify(holoscan)}` : null,
    `This is the FIRST PASS. After your initial analysis, you MUST also list 2 to 4 short clarifying follow-up questions a doctor should answer to improve diagnostic accuracy. Return them in a "follow_up_questions" array of objects { id, question, kind: "yesno"|"text"|"choice", options?: string[] }.`,
  ].filter(Boolean).join("\n\n");

  const visionResp = await callVisionCascade({
    systemPrompt: preset.systemPrompt,
    userText,
    imageUrls,
    enableWebSearch: false,
  });

  await ctx.admin.from("studies")
    .update({ progress: { stage: "pass1_parsing", pct: 60, label: "Composing follow-up questions…" } })
    .eq("id", studyId);

  const parsed = safeParseJson(visionResp);
  const followUps = Array.isArray(parsed?.follow_up_questions) ? parsed.follow_up_questions : [];

  await ctx.admin.from("studies").update({
    live_capture_pass: 1,
    live_holoscan_measurements: holoscan ?? null,
    live_follow_up_questions: followUps,
    progress: { stage: "awaiting_followups", pct: 65, label: "Waiting for your follow-up answers" },
  }).eq("id", studyId);

  return jsonResponse({
    study_id: studyId,
    follow_up_questions: followUps,
    preliminary: {
      narrative: parsed?.narrative ?? "",
      findings: parsed?.findings ?? [],
    },
    holoscan_used: !!holoscan,
  });
}

// ─────────────────────────── PASS 2 ───────────────────────────
async function handlePass2(ctx: NonNullable<Awaited<ReturnType<typeof getAuthCtx>>>, body: Record<string, unknown>) {
  const studyId = String(body.study_id ?? "");
  const answers = (body.follow_up_answers ?? {}) as Record<string, string>;
  if (!studyId) return jsonResponse({ error: "missing_study_id" }, 400);

  const { data: study, error: getErr } = await ctx.admin
    .from("studies").select("*").eq("id", studyId).eq("user_id", ctx.userId).maybeSingle();
  if (getErr) throw getErr;
  if (!study) return jsonResponse({ error: "study_not_found" }, 404);

  await ctx.admin.from("studies")
    .update({ status: "analyzing", progress: { stage: "pass2_preparing", pct: 75, label: "Preparing final pass with your answers…" } })
    .eq("id", studyId);

  const preset = getPreset(study.modality_slug);
  const imagePaths: string[] = Array.isArray(study.live_photo_paths)
    ? study.live_photo_paths as string[]
    : [];
  const imageUrls = await signMany(ctx, imagePaths);

  const holoscan = study.live_holoscan_measurements;
  const followUpQs = (study.live_follow_up_questions ?? []) as Array<{ id: string; question: string }>;
  const qaPairs = followUpQs.map((q) => ({
    question: q.question,
    answer: answers[q.id] ?? "(no answer)",
  }));

  const userText = [
    `Specialty: ${preset.label}`,
    `Capture mode: ${study.live_capture_kind === "photos" ? "still photos" : "video frames"}`,
    `Number of images: ${imageUrls.length}`,
    holoscan ? `Holoscan measurements:\n${JSON.stringify(holoscan)}` : null,
    `Doctor's answers to your follow-up questions:\n${JSON.stringify(qaPairs, null, 2)}`,
    `This is the FINAL PASS. Produce the clinically authoritative report as strict JSON. Do not wait for external citations; citations may be added by a separate fast retrieval pass.`,
  ].filter(Boolean).join("\n\n");

  await ctx.admin.from("studies")
    .update({ progress: { stage: "pass2_vision", pct: 85, label: "Reasoning + searching the web…" } })
    .eq("id", studyId);

  const visionResp = await callVisionCascade({
    systemPrompt: preset.systemPrompt,
    userText,
    imageUrls,
    enableWebSearch: false,
  });

  await ctx.admin.from("studies")
    .update({ progress: { stage: "pass2_parsing", pct: 95, label: "Compiling findings and citations…" } })
    .eq("id", studyId);

  const parsed = safeParseJson(visionResp);
  const findings = Array.isArray(parsed?.findings) ? parsed.findings : [];
  const narrative = String(parsed?.narrative ?? "");
  const overallConfidence = clamp01(Number(parsed?.overallConfidence ?? 0.7));
  const informationGaps = Array.isArray(parsed?.informationGaps) ? parsed.informationGaps : [];
  const citations = await fetchCitationsFast(ctx, studyId, preset, narrative, findings, informationGaps);

  if (findings.length > 0) {
    const rows = findings.map((f: Record<string, unknown>, i: number) => ({
      study_id: studyId,
      user_id: ctx.userId,
      title: String(f.title ?? "Finding"),
      description: String(f.observation ?? f.impression ?? ""),
      severity: normalizeSeverity(String(f.severity ?? "low")),
      confidence: clamp01(Number(f.confidence ?? 0.6)),
      anatomical_region: f.anatomicalRegion ? String(f.anatomicalRegion) : null,
      observation: f.observation ? String(f.observation) : null,
      impression: f.impression ? String(f.impression) : null,
      recommendation: f.recommendation ? String(f.recommendation) : null,
      urgency: normalizeUrgency(String(f.urgency ?? "routine")),
      differentials: Array.isArray(f.differentials) ? f.differentials : null,
      display_order: i,
    }));
    await ctx.admin.from("findings").insert(rows);
  }

  await ctx.admin.from("studies").update({
    status: "awaiting_review",
    live_capture_pass: 2,
    live_follow_up_answers: answers,
    web_citations: citations,
    narrative,
    overall_confidence: overallConfidence,
    information_gaps: informationGaps,
    report: { narrative, findings, web_citations: citations, overallConfidence, informationGaps },
    progress: { stage: "ready_for_review", pct: 100, label: "Report ready" },
  }).eq("id", studyId);

  return jsonResponse({
    study_id: studyId,
    status: "awaiting_review",
    narrative,
    findings,
    web_citations: citations,
    overall_confidence: overallConfidence,
    information_gaps: informationGaps,
  });
}

// ─────────────────────────── Vision cascade ───────────────────────────
async function callVisionCascade(opts: {
  systemPrompt: string;
  userText: string;
  imageUrls: string[];
  enableWebSearch: boolean;
}): Promise<string> {
  const userContent: ChatMessage["content"] = [
    { type: "text", text: opts.userText },
    ...opts.imageUrls.map((url) => ({
      type: "image_url" as const,
      image_url: { url, detail: "high" as const },
    })),
  ];

  const messages: ChatMessage[] = [
    { role: "system", content: opts.systemPrompt },
    { role: "user", content: userContent },
  ];
  const res = await runChatCascade({
    messages,
    modelSlug: "kimi-k2.6",
    vision: true,
    complexity: opts.enableWebSearch ? "high" : "standard",
    jsonObject: true,
    temperature: 0.2,
    maxTokens: 2048,
    thinkingDisabled: !!opts.enableWebSearch,
    enableWebSearch: opts.enableWebSearch,
    title: "Manthana — Live Capture",
  });
  return res.text;
}

async function fetchCitationsFast(
  ctx: NonNullable<Awaited<ReturnType<typeof getAuthCtx>>>,
  studyId: string,
  preset: SpecialtyPreset,
  narrative: string,
  findings: unknown[],
  informationGaps: unknown[],
): Promise<Array<{ title: string; url: string; source?: string; snippet?: string }>> {
  await ctx.admin.from("studies")
    .update({ progress: { stage: "pass2_citations", pct: 90, label: "Adding references without blocking report generation…" } })
    .eq("id", studyId);

  const citationPrompt = [
    `Specialty: ${preset.label}`,
    `Clinical narrative: ${narrative}`,
    `Findings JSON: ${JSON.stringify(findings).slice(0, 4000)}`,
    `Information gaps: ${JSON.stringify(informationGaps).slice(0, 1000)}`,
    `Return STRICT JSON only: {"web_citations":[{"title":"","url":"","source":"","snippet":""}]}. Include 1 to 4 real, authoritative medical references only. Prefer PubMed, NIH/NCBI, AAFP, NICE, WHO, CDC, peer-reviewed journals, or recognized clinical guidelines. Do not invent URLs.`,
  ].join("\n\n");

  try {
    const res = await Promise.race([
      runChatCascade({
        messages: [
          { role: "system", content: "You retrieve authoritative clinical references and return only strict JSON." },
          { role: "user", content: citationPrompt },
        modelSlug: "kimi-k2.6",
        ],
        vision: false,
        complexity: "standard",
        jsonObject: true,
        temperature: 0.,
        thinkingDisabled: true1,
        maxTokens: 1200,
        enableWebSearch: true,
        webMaxResults: 4,
        title: "Manthana Live Capture Citations",
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("citation_lookup_timeout")), CITATION_TIMEOUT_MS)
      ),
    ]);
    const parsed = safeParseJson(res.text);
    return Array.isArray(parsed?.web_citations)
      ? parsed.web_citations.slice(0, 4).filter((c: { url?: string }) => typeof c?.url === "string" && c.url.startsWith("http"))
      : [];
  } catch (e) {
    console.warn("[analyze-live-capture] citation lookup skipped:", e instanceof Error ? e.message : String(e));
    return [];
  }
}

// ─────────────────────────── Holoscan stub ───────────────────────────
async function callHoloscan(videoUrl: string): Promise<Record<string, unknown> | null> {
  const url = Deno.env.get("HOLOSCAN_INFERENCE_URL");
  if (!url) return null;
  const token = Deno.env.get("HOLOSCAN_INFERENCE_TOKEN") ?? "";
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ video_url: videoUrl }),
  });
  if (!r.ok) return null;
  return await r.json().catch(() => null);
}

// ─────────────────────────── Helpers ───────────────────────────
async function signOne(
  ctx: NonNullable<Awaited<ReturnType<typeof getAuthCtx>>>,
  path: string,
): Promise<string> {
  const { data, error } = await ctx.admin.storage
    .from(STUDIES_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);
  if (error) throw error;
  return data.signedUrl;
}

async function signMany(
  ctx: NonNullable<Awaited<ReturnType<typeof getAuthCtx>>>,
  paths: string[],
): Promise<string[]> {
  if (paths.length === 0) return [];
  const { data, error } = await ctx.admin.storage
    .from(STUDIES_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SEC);
  if (error) throw error;
  return (data ?? []).map((d) => d.signedUrl).filter(Boolean) as string[];
}

function clampInt(v: unknown, min: number, max: number, dflt: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function safeParseJson(s: string): Record<string, unknown> | null {
  if (!s) return null;
  const cleaned = s.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch { /* noop */ }
    }
    return null;
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function normalizeSeverity(s: string): "low" | "medium" | "high" | "critical" {
  const k = s.toLowerCase();
  if (["critical", "severe"].includes(k)) return "critical";
  if (["high"].includes(k)) return "high";
  if (["medium", "moderate"].includes(k)) return "medium";
  return "low";
}

function normalizeUrgency(s: string): "routine" | "urgent" | "stat" {
  const k = s.toLowerCase();
  if (k === "stat" || k === "emergency") return "stat";
  if (k === "urgent") return "urgent";
  return "routine";
}
