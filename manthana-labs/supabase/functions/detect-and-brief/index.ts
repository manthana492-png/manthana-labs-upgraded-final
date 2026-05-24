// detect-and-brief — POST /functions/v1/detect-and-brief
// Body: { study_id }
// Single AI call: looks at the uploaded image(s) and returns
//   1. The most-suitable modality slug from the full catalog (115 entries)
//   2. 5–8 dynamic, modality-specific clinical questions to ask the doctor
//
// Uses vision-thinking model (Kimi K2 Thinking) via OpenRouter cascade.
// Falls back through Qwen VL Thinking → Gemini 2.5 Pro (Lovable AI).

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAuthCtx } from "../_shared/auth.ts";
import {
  tierForSlug, catalogForSlug, categoryFromSlug,
  DETECTABLE_CATALOG, DETECTABLE_SLUGS, findCatalogEntry,
} from "../_shared/modalities.ts";
import { runChatCascade, type ChatMessage } from "../_shared/aiCascade.ts";
import dicomParser from "npm:dicom-parser@1.8.21";

interface Body { study_id?: string }

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
    .select("id, user_id, storage_paths")
    .eq("id", studyId).single();
  if (error || !study) return jsonResponse({ error: "study_not_found" }, 404);
  if (study.user_id !== ctx.userId) return jsonResponse({ error: "forbidden" }, 403);

  const paths = (study.storage_paths as string[] | null) ?? [];
  if (paths.length === 0) return jsonResponse({ error: "no_files_to_inspect" }, 400);

  // Download up to 3 images, build DICOM hint
  const images: Array<{ b64: string; mime: string; name: string }> = [];
  let dicomHint: string | null = null;
  for (const path of paths.slice(0, 3)) {
    try {
      const { data: blob, error: dl } = await ctx.admin.storage.from("studies").download(path);
      if (dl || !blob) continue;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const mime = blob.type || "application/octet-stream";
      const name = path.split("/").pop() ?? "file";

      const isDicom = bytes.length > 132 &&
        bytes[128] === 0x44 && bytes[129] === 0x49 &&
        bytes[130] === 0x43 && bytes[131] === 0x4d;
      if (isDicom && !dicomHint) {
        try {
          const ds = dicomParser.parseDicom(bytes);
          const m = ds.string("x00080060") ?? "";
          const desc = ds.string("x00081030") ?? "";
          dicomHint = `DICOM Modality=${m}; StudyDescription=${desc}`.trim();
        } catch { /* ignore */ }
      }
      if (mime.startsWith("image/")) {
        images.push({ b64: encodeB64(bytes), mime, name });
      }
    } catch (e) { console.warn("download failed", path, e); }
  }

  // Build catalog string for prompt
  const catalogText = DETECTABLE_CATALOG
    .map((m) => `${m.slug} | ${m.label} (${m.category})`)
    .join("\n");

  const systemPrompt = `You are Manthana, a senior radiologist + clinician AI.
Given one or more medical images (and optionally a DICOM modality hint),
you must do TWO things in a single response:

1) Pick the SINGLE most-suitable modality slug from this catalog (use the slug exactly as shown):
${catalogText}

2) Generate 5–8 clinically-relevant questions tailored to that specific modality + anatomy.
   Questions should be the ones a radiologist would actually want answered before reading
   the study (e.g. for chest X-ray: cough/fever/duration/smoking; for knee MRI: trauma
   mechanism/locking/swelling; for skin lesion: duration/change/itching/family history).

You MUST call the function "submit_modality_and_questions" exactly once.

Question kinds:
  - "yesno"   → Yes/No/Unsure
  - "multi"   → MUST include 3-5 options
  - "number"  → use min/max/unit (e.g. age in years)
  - "text"    → free-text

Always include an "indication" (text, required) and "age" (number, required) question.
Never ask for patient name/identifiers — privacy.`;

  const tools = [{
    type: "function",
    function: {
      name: "submit_modality_and_questions",
      description: "Detected modality + dynamic clinical questionnaire",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["modality_slug", "confidence", "reasoning", "questions"],
        properties: {
          modality_slug: { type: "string", description: "Exact slug from the catalog" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          reasoning: { type: "string", description: "Short explanation (≤2 sentences)" },
          anatomy: { type: "string" },
          view: { type: "string" },
          questions: {
            type: "array", minItems: 5, maxItems: 8,
            items: {
              type: "object",
              required: ["id", "prompt", "kind"],
              additionalProperties: false,
              properties: {
                id: { type: "string", description: "snake_case identifier" },
                prompt: { type: "string" },
                helper: { type: "string" },
                kind: { type: "string", enum: ["yesno", "multi", "number", "text"] },
                required: { type: "boolean" },
                min: { type: "number" },
                max: { type: "number" },
                unit: { type: "string" },
                options: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["value", "label"],
                    additionalProperties: false,
                    properties: {
                      value: { type: "string" },
                      label: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  }];

  const userContent: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [{
    type: "text",
    text: [
      dicomHint ? `Hint: ${dicomHint}` : "No DICOM tags available.",
      `Filenames: ${paths.map((p) => p.split("/").pop()).join(", ")}`,
      "",
      "Look at the attached image(s) and call submit_modality_and_questions.",
    ].join("\n"),
  }];
  for (const img of images) {
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${img.mime};base64,${img.b64}` },
    });
  }

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];

  let detectedSlug: string | null = null;
  let confidence = 0.6;
  let reasoning = "";
  let questions: unknown[] = [];

  try {
    const res = await runChatCascade({
      messages,
      modelSlug: "kimi-k2.5",
      vision: true,
      temperature: 0.1,
      maxTokens: 2200,
      tools,
      toolChoice: { type: "function", function: { name: "submit_modality_and_questions" } },
      title: "Manthana — Detect & Brief",
    });

    let parsed: Record<string, unknown> | null = res.toolArgs ?? null;
    if (!parsed && res.text) {
      // Some providers return JSON in text instead of tool args
      const cleaned = res.text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { /* */ } }
    }
    if (parsed) {
      const slug = String(parsed.modality_slug ?? "").trim();
      if (DETECTABLE_SLUGS.has(slug)) {
        detectedSlug = slug;
        confidence = clamp01(Number(parsed.confidence ?? 0.7));
        reasoning = String(parsed.reasoning ?? "");
        if (Array.isArray(parsed.questions)) questions = parsed.questions;
      } else {
        console.warn("model returned unknown slug:", slug);
      }
    }
  } catch (e) {
    console.warn("detect-and-brief AI call failed", e);
  }

  // Fallback to filename heuristics if AI failed
  if (!detectedSlug) {
    detectedSlug = guessFromFilename(paths) ?? "photo_derm_skin_lesion";
    confidence = 0.35;
    reasoning = "Fallback heuristic — AI detection unavailable.";
    questions = defaultQuestions();
  }
  if (!questions || questions.length === 0) questions = defaultQuestions();

  const entry = findCatalogEntry(detectedSlug);
  const tier = tierForSlug(detectedSlug);
  const catalog = catalogForSlug(detectedSlug);
  const category = categoryFromSlug(detectedSlug);

  await ctx.admin.from("studies").update({
    detected_modality_slug: detectedSlug,
    detection_confidence: confidence,
    modality_slug: detectedSlug,
    modality_label: entry?.label ?? "Detected modality",
    modality_category: category,
    tier, catalog,
    dynamic_questions: questions,
    progress: {
      stage: "detected", percent: 15,
      status: `Detected ${entry?.label ?? detectedSlug} (${Math.round(confidence * 100)}%)`,
    },
  }).eq("id", studyId);

  return jsonResponse({
    study_id: studyId,
    detected_modality_slug: detectedSlug,
    modality_label: entry?.label ?? "Detected modality",
    confidence,
    reasoning,
    requires_confirmation: confidence < 0.85,
    tier, catalog, category,
    questions,
  });
});

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function encodeB64(bytes: Uint8Array): string {
  let bin = ""; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

function guessFromFilename(paths: string[]): string | null {
  const text = paths.map((p) => p.toLowerCase()).join(" ");
  if (/chest|cxr|thorax/.test(text)) return "xray_chest_pa";
  if (/ecg|ekg/.test(text)) return "ecg_12_lead_standard";
  if (/derm|skin|mole|lesion/.test(text)) return "photo_derm_skin_lesion";
  if (/endoscop|colonoscop/.test(text)) return "video_endoscopy_gi_upper";
  if (/brain.*flair/.test(text)) return "mri_brain_flair";
  if (/brain.*t2/.test(text)) return "mri_brain_t2";
  if (/brain.*t1/.test(text)) return "mri_brain_t1";
  if (/knee.*sag/.test(text)) return "mri_knee_sagittal";
  if (/lumbar/.test(text)) return "mri_spine_lumbar";
  if (/abdomen.*ct|ct.*abdomen/.test(text)) return "ct_abdomen_pelvis";
  if (/chest.*ct|ct.*chest/.test(text)) return "ct_chest_contrast";
  return null;
}

function defaultQuestions() {
  return [
    { id: "indication", prompt: "What's the primary clinical indication?", kind: "text", required: true,
      helper: "Brief — the suspected condition or symptom prompting imaging." },
    { id: "age", prompt: "Patient age (years)?", kind: "number", required: true, min: 0, max: 120, unit: "yrs" },
    { id: "duration", prompt: "How long has the patient experienced symptoms?", kind: "multi", required: true,
      options: [
        { value: "<24h", label: "<24 hours" },
        { value: "1-7d", label: "1–7 days" },
        { value: "1-4w", label: "1–4 weeks" },
        { value: ">1m", label: ">1 month" },
      ] },
    { id: "acute", prompt: "Any red-flag features (acute pain, focal deficit, trauma)?",
      kind: "yesno", required: true },
    { id: "context", prompt: "Any additional clinical context?", kind: "text" },
  ];
}
