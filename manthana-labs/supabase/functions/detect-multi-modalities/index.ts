// detect-multi-modalities — POST /functions/v1/detect-multi-modalities
// Body: { files: [{ name, mime, b64? }] }   (2–16 entries)
// Returns: { groups: [{ modality_slug, modality_label, category, tier, catalog,
//                       confidence, reasoning, file_indexes }], requires_manual }
//
// Uses the vision cascade (Kimi-VL primary) to cluster a bulk upload into
// 2–4 modality "legs" for the Multi-Modality wizard. Pure detection — no
// storage writes, no quota consumption. Files are NOT persisted here; the
// wizard uploads them only after the user confirms the proposed legs.

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAuthCtx } from "../_shared/auth.ts";
import {
  tierForSlug, catalogForSlug, categoryFromSlug,
  DETECTABLE_CATALOG, DETECTABLE_SLUGS, findCatalogEntry,
} from "../_shared/modalities.ts";
import { runChatCascade, type ChatMessage } from "../_shared/aiCascade.ts";

interface InFile { name?: string; mime?: string; b64?: string }
interface Body { files?: InFile[] }

const MAX_FILES = 16;
const MIN_FILES = 2;
const VISION_MIMES = new Set([
  "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const ctx = await getAuthCtx(req);
  if (!ctx) return jsonResponse({ error: "unauthorized" }, 401);

  let body: Body;
  try { body = await req.json(); } catch { return jsonResponse({ error: "invalid_json" }, 400); }
  const files = Array.isArray(body.files) ? body.files.slice(0, MAX_FILES) : [];
  if (files.length < MIN_FILES) {
    return jsonResponse({ error: "need_at_least_2_files" }, 400);
  }

  // Build prompt: catalog + filenames. Attach image previews as separate
  // messages so the model can correlate "image N" with its index.
  const catalogText = DETECTABLE_CATALOG
    .map((m) => `${m.slug} | ${m.label} (${m.category})`)
    .join("\n");

  const fileList = files.map((f, i) => {
    const mime = (f.mime ?? "").toLowerCase();
    const isImg = VISION_MIMES.has(mime) && typeof f.b64 === "string" && f.b64.length > 0;
    return `#${i}: ${f.name ?? "file"} (${mime || "unknown"})${isImg ? " [image attached]" : " [no preview]"}`;
  }).join("\n");

  const systemPrompt = `You are Manthana, a senior multi-disciplinary radiologist.
You receive 2–16 medical files for ONE patient. Cluster them into 2–4 groups
("legs"), one per investigation modality, and label each group with the SINGLE
most-suitable slug from this catalog (use the slug exactly):

${catalogText}

Rules:
- Every input file index MUST appear in exactly one group.
- 2 ≤ groups ≤ 4. Each group has at least one file.
- Slugs MUST be unique across groups (don't pick the same slug twice).
- If you cannot confidently distinguish modalities, return a single group
  with confidence ≤ 0.4 — the UI will fall back to manual selection.
- For non-image files (PDF/DOC) without preview, infer from the filename.

You MUST call the function "submit_groups" exactly once.`;

  const tools = [{
    type: "function",
    function: {
      name: "submit_groups",
      description: "Modality clustering for a multi-modality patient study",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["groups"],
        properties: {
          groups: {
            type: "array", minItems: 1, maxItems: 4,
            items: {
              type: "object",
              required: ["modality_slug", "confidence", "file_indexes"],
              additionalProperties: false,
              properties: {
                modality_slug: { type: "string" },
                confidence: { type: "number", minimum: 0, maximum: 1 },
                reasoning: { type: "string" },
                file_indexes: {
                  type: "array",
                  items: { type: "integer", minimum: 0 },
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
    | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } }
  > = [{
    type: "text",
    text: [
      `Files for this patient (${files.length}):`,
      fileList,
      "",
      "Attached images follow in order. Cluster the files and call submit_groups.",
    ].join("\n"),
  }];

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const mime = (f.mime ?? "").toLowerCase();
    if (!VISION_MIMES.has(mime) || !f.b64) continue;
    const normMime = mime === "image/jpg" ? "image/jpeg" : mime;
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${normMime};base64,${f.b64}`, detail: "low" },
    });
  }

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];

  let rawGroups: Array<{
    modality_slug: string;
    confidence: number;
    reasoning?: string;
    file_indexes: number[];
  }> = [];

  try {
    const res = await runChatCascade({
      messages,
      modelSlug: "kimi-k2.5",
      vision: true,
      complexity: "high",
      temperature: 0.1,
      maxTokens: 1800,
      tools,
      toolChoice: { type: "function", function: { name: "submit_groups" } },
      title: "Manthana - Multi Detect",
    });

    const parsed = (res.toolArgs ?? extractJson(res.text)) as
      | { groups?: unknown }
      | null;
    if (parsed && Array.isArray(parsed.groups)) {
      rawGroups = parsed.groups as typeof rawGroups;
    }
  } catch (e) {
    console.warn("detect-multi-modalities AI call failed", e);
  }

  // Validate + normalize. Build a quick filename-fallback if AI failed.
  const normalized = validateGroups(rawGroups, files.length);
  if (!normalized) {
    const fallback = heuristicGroups(files);
    return jsonResponse({
      groups: enrich(fallback),
      requires_manual: true,
      reason: "ai_detection_failed",
    });
  }

  const lowConfidence = normalized.some((g) => g.confidence < 0.45);
  const singleGroup = normalized.length < 2;

  return jsonResponse({
    groups: enrich(normalized),
    requires_manual: lowConfidence || singleGroup,
  });
});

function validateGroups(
  groups: Array<{ modality_slug?: string; confidence?: number; reasoning?: string; file_indexes?: number[] }>,
  totalFiles: number,
):
  | Array<{ modality_slug: string; confidence: number; reasoning: string; file_indexes: number[] }>
  | null {
  if (!Array.isArray(groups) || groups.length === 0) return null;
  const seenSlugs = new Set<string>();
  const seenIdxs = new Set<number>();
  const out: ReturnType<typeof validateGroups> = [] as never;
  for (const g of groups) {
    const slug = String(g.modality_slug ?? "").trim();
    if (!DETECTABLE_SLUGS.has(slug)) return null;
    if (seenSlugs.has(slug)) return null;
    seenSlugs.add(slug);
    const idxs = Array.isArray(g.file_indexes)
      ? g.file_indexes.filter((n) => Number.isInteger(n) && n >= 0 && n < totalFiles)
      : [];
    if (idxs.length === 0) return null;
    for (const i of idxs) {
      if (seenIdxs.has(i)) return null;
      seenIdxs.add(i);
    }
    out!.push({
      modality_slug: slug,
      confidence: clamp01(Number(g.confidence ?? 0.6)),
      reasoning: String(g.reasoning ?? ""),
      file_indexes: idxs,
    });
  }
  // Every file must be assigned (allow at most one unassigned → push to last group).
  const missing: number[] = [];
  for (let i = 0; i < totalFiles; i++) if (!seenIdxs.has(i)) missing.push(i);
  if (missing.length > 0) {
    if (missing.length > Math.max(1, Math.floor(totalFiles / 4))) return null;
    out![out!.length - 1].file_indexes.push(...missing);
  }
  if (out!.length > 4) return null;
  return out!;
}

function heuristicGroups(files: InFile[]): Array<{
  modality_slug: string; confidence: number; reasoning: string; file_indexes: number[];
}> {
  // Group by filename keywords; fallback "photo_derm_skin_lesion" sink.
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < files.length; i++) {
    const name = (files[i].name ?? "").toLowerCase();
    let slug = "photo_derm_skin_lesion";
    if (/chest|cxr|thorax/.test(name)) slug = "xray_chest_pa";
    else if (/ecg|ekg/.test(name)) slug = "ecg_12_lead_standard";
    else if (/endoscop|colonoscop/.test(name)) slug = "video_endoscopy_gi_upper";
    else if (/brain.*flair/.test(name)) slug = "mri_brain_flair";
    else if (/brain.*t2/.test(name)) slug = "mri_brain_t2";
    else if (/brain.*t1/.test(name)) slug = "mri_brain_t1";
    else if (/lumbar|spine/.test(name)) slug = "mri_spine_lumbar";
    else if (/knee/.test(name)) slug = "mri_knee_sagittal";
    else if (/abdomen|pelvis/.test(name)) slug = "ct_abdomen_pelvis";
    else if (/derm|skin|mole|lesion/.test(name)) slug = "photo_derm_skin_lesion";
    const arr = buckets.get(slug) ?? [];
    arr.push(i);
    buckets.set(slug, arr);
  }
  return Array.from(buckets.entries()).slice(0, 4).map(([slug, idxs]) => ({
    modality_slug: slug, confidence: 0.3,
    reasoning: "Filename heuristic — confirm or change before continuing.",
    file_indexes: idxs,
  }));
}

function enrich(groups: Array<{
  modality_slug: string; confidence: number; reasoning: string; file_indexes: number[];
}>) {
  return groups.map((g) => {
    const entry = findCatalogEntry(g.modality_slug);
    return {
      modality_slug: g.modality_slug,
      modality_label: entry?.label ?? g.modality_slug,
      category: categoryFromSlug(g.modality_slug),
      tier: tierForSlug(g.modality_slug),
      catalog: catalogForSlug(g.modality_slug),
      confidence: g.confidence,
      reasoning: g.reasoning,
      file_indexes: g.file_indexes,
    };
  });
}

function extractJson(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}
