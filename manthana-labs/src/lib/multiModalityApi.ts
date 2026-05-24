// Multi-modality patient study API — uploads N modality "legs" for one patient,
// stores them in the existing private `studies` bucket, and triggers the
// dedicated edge function that produces a unified report.
//
// Quota: caller (UI) consumes 2 scan units via check-and-consume-quota *twice*
// before kicking off analysis. Tier gating (Pro / Pro+) is enforced both in
// the UI and inside the edge function.

import { supabase } from "@/integrations/supabase/client";
import type { Modality } from "./types";

export interface MultiLegInput {
  modality: Modality;
  files: File[]; // up to 4 — image / pdf / doc / camera snap
}

export interface MultiUploadResult {
  studyId: string;
  legs: Array<{
    index: number;
    slug: string;
    label: string;
    category: string;
    storagePaths: string[];
  }>;
}

const ACCEPTED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/heic",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_LEGS = 4;
export const MIN_LEGS = 2;
export const MAX_FILES_PER_LEG = 4;

export function validateLegFile(file: File): string | null {
  if (file.size > MAX_FILE_BYTES) return `${file.name} exceeds 20 MB`;
  if (!ACCEPTED_MIME.has(file.type)) {
    return `${file.name}: unsupported type (${file.type || "unknown"})`;
  }
  return null;
}

/**
 * Create the multi-modality study row, upload all leg files to storage, and
 * persist the questionnaire answers. Does NOT trigger AI analysis — call
 * `startMultiAnalysis` after.
 */
export async function createAndUploadMultiStudy(opts: {
  patientRefShort?: string;
  legs: MultiLegInput[];
  combinedQA: Record<string, unknown>;
}): Promise<MultiUploadResult> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) throw new Error("not_authenticated");

  if (opts.legs.length < MIN_LEGS || opts.legs.length > MAX_LEGS) {
    throw new Error(`A multi-modality study needs ${MIN_LEGS}-${MAX_LEGS} legs.`);
  }

  // 1. Create the study row first (uploading-state) so we have an ID for paths.
  const primaryLeg = opts.legs[0];
  const totalImages = opts.legs.reduce(
    (sum, l) => sum + l.files.filter((f) => f.type.startsWith("image/")).length,
    0,
  );

  const { data: studyRow, error: insertErr } = await supabase
    .from("studies")
    .insert({
      user_id: uid,
      modality_slug: primaryLeg.modality.slug,
      modality_label: `Multi-modality (${opts.legs.length} legs)`,
      modality_category: "Multi",
      tier: primaryLeg.modality.tier,
      catalog: primaryLeg.modality.catalog,
      status: "uploading",
      patient_ref_short: opts.patientRefShort ?? null,
      images_count: totalImages,
      videos_count: 0,
      storage_paths: [],
      progress: { stage: "uploading", percent: 0, status: "Uploading multi-modality files…" },
      is_multi_modality: true,
      multi_modality_combined_qa: opts.combinedQA as never,
    })
    .select("id")
    .single();
  if (insertErr || !studyRow) throw new Error(insertErr?.message ?? "study_create_failed");
  const studyId = studyRow.id as string;

  // 2. Upload each leg's files to {uid}/{studyId}/leg-{idx}/{filename}
  const legResults: MultiUploadResult["legs"] = [];
  const allStoragePaths: string[] = [];
  try {
    for (let i = 0; i < opts.legs.length; i++) {
      const leg = opts.legs[i];
      const legPaths: string[] = [];
      for (const file of leg.files.slice(0, MAX_FILES_PER_LEG)) {
        const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
        const path = `${uid}/${studyId}/leg-${i}/${Date.now()}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("studies")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw new Error(`leg ${i + 1} upload failed: ${upErr.message}`);
        legPaths.push(path);
        allStoragePaths.push(path);
      }
      legResults.push({
        index: i,
        slug: leg.modality.slug,
        label: leg.modality.label,
        category: leg.modality.category,
        storagePaths: legPaths,
      });
    }

    // 3. Persist the leg manifest + storage_paths summary on the study row.
    const { error: updErr } = await supabase
      .from("studies")
      .update({
        storage_paths: allStoragePaths,
        multi_modality_legs: legResults.map((l) => ({
          index: l.index,
          slug: l.slug,
          label: l.label,
          category: l.category,
          storage_paths: l.storagePaths,
        })) as never,
        status: "questionnaire",
        progress: { stage: "uploaded", percent: 12, status: "All legs uploaded" },
      })
      .eq("id", studyId);
    if (updErr) throw new Error(updErr.message);

    return { studyId, legs: legResults };
  } catch (err) {
    // Best-effort cleanup: mark study errored so it doesn't sit in limbo.
    await supabase
      .from("studies")
      .update({
        status: "error",
        error_message: err instanceof Error ? err.message : "upload failed",
      })
      .eq("id", studyId);
    throw err;
  }
}

// ─────────────────── Auto-detect modalities (no upload) ───────────────────

export interface DetectedGroup {
  modalitySlug: string;
  modalityLabel: string;
  category: string;
  tier: string;
  catalog: string;
  confidence: number;
  reasoning: string;
  fileIndexes: number[];
}

const VISION_MIMES = new Set([
  "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif",
]);
const DETECT_MAX_FILES = 16;
const DETECT_PREVIEW_MAX_DIM = 1024;
const DETECT_PREVIEW_QUALITY = 0.78;

async function downscaleToJpegBase64(file: File): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) return null;
    const scale = Math.min(1, DETECT_PREVIEW_MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", DETECT_PREVIEW_QUALITY);
    const comma = dataUrl.indexOf(",");
    return comma >= 0 ? dataUrl.slice(comma + 1) : null;
  } catch {
    return null;
  }
}

/**
 * Ask the AI to cluster a bulk set of files into 2–4 modality "legs".
 * Files are NOT uploaded — only downscaled previews are sent for detection.
 * Caller should fall back to manual selection when `requiresManual` is true.
 */
export async function detectMultiModalities(files: File[]): Promise<{
  groups: DetectedGroup[];
  requiresManual: boolean;
}> {
  const trimmed = files.slice(0, DETECT_MAX_FILES);
  const payload = await Promise.all(trimmed.map(async (f) => {
    const mime = (f.type || "").toLowerCase();
    let b64: string | null = null;
    if (VISION_MIMES.has(mime)) {
      b64 = await downscaleToJpegBase64(f);
    }
    return {
      name: f.name,
      mime: b64 ? "image/jpeg" : (f.type || "application/octet-stream"),
      b64: b64 ?? undefined,
    };
  }));

  const { data, error } = await supabase.functions.invoke("detect-multi-modalities", {
    body: { files: payload },
  });
  if (error) throw new Error(error.message);

  const d = data as {
    groups?: Array<{
      modality_slug: string;
      modality_label: string;
      category: string;
      tier: string;
      catalog: string;
      confidence: number;
      reasoning: string;
      file_indexes: number[];
    }>;
    requires_manual?: boolean;
  };

  const groups = (d.groups ?? []).map((g) => ({
    modalitySlug: g.modality_slug,
    modalityLabel: g.modality_label,
    category: g.category,
    tier: g.tier,
    catalog: g.catalog,
    confidence: g.confidence,
    reasoning: g.reasoning,
    fileIndexes: g.file_indexes,
  }));
  return { groups, requiresManual: !!d.requires_manual };
}

/** Kick off the multi-modality analysis. Returns immediately — progress is realtime. */
export async function startMultiAnalysis(studyId: string): Promise<void> {
  const { error } = await supabase.functions.invoke("analyze-multi-modality-study", {
    body: { study_id: studyId },
  });
  if (error) throw new Error(error.message);
}

/**
 * Consume scan quota up-front. Multi-modality counts as 2 flat scans regardless
 * of leg count. Returns true if both units were granted.
 */
export async function consumeMultiModalityQuota(): Promise<{
  allowed: boolean;
  reason?: string;
  plan?: string;
}> {
  // Two sequential scan consumptions — keeps the existing edge function
  // contract intact (no schema change there).
  for (let i = 0; i < 2; i++) {
    const { data, error } = await supabase.functions.invoke("check-and-consume-quota", {
      body: { mode: "scan" },
    });
    if (error) return { allowed: false, reason: error.message };
    const d = data as { allowed?: boolean; reason?: string; plan?: string };
    if (!d?.allowed) return { allowed: false, reason: d?.reason ?? "quota_denied", plan: d?.plan };
  }
  return { allowed: true };
}
