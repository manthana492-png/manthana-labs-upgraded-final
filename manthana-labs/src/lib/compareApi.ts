// Compare Mode (longitudinal) API — uploads N timepoints of the SAME modality
// for the SAME patient and triggers the analyze-compare-study edge function.
//
// Tier gate: Pro / Pro+ only. Quota: flat 2 scans per compare study.
// Files: images only (PNG / JPEG / WebP / GIF / HEIC), max 4 per timepoint.

import { supabase } from "@/integrations/supabase/client";
import type { Modality } from "./types";
import type { ParsedTimepoint } from "./timelineParser";

export interface CompareTimepointInput {
  parsed: ParsedTimepoint; // user-provided + parsed timeline label
  files: File[];           // up to 4 images
}

export interface CompareUploadResult {
  studyId: string;
  modalitySlug: string;
  timepoints: Array<{
    index: number;
    chronoOrder: number; // 0 = oldest
    label: string;
    ageHours: number;
    absoluteDate?: string;
    storagePaths: string[];
  }>;
}

const ACCEPTED_IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/heic",
]);
const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_TIMEPOINTS = 4;
export const MIN_TIMEPOINTS = 2;
export const MAX_FILES_PER_TIMEPOINT = 4;

export function validateCompareFile(file: File): string | null {
  if (file.size > MAX_FILE_BYTES) return `${file.name} exceeds 20 MB`;
  if (!ACCEPTED_IMAGE_MIME.has(file.type)) {
    return `${file.name}: only image files (PNG/JPEG/WebP/HEIC) are allowed in Compare Mode.`;
  }
  return null;
}

export async function createAndUploadCompareStudy(opts: {
  patientRefShort?: string;
  modality: Modality; // the locked modality every timepoint will be validated against server-side
  timepoints: CompareTimepointInput[];
}): Promise<CompareUploadResult> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) throw new Error("not_authenticated");

  if (
    opts.timepoints.length < MIN_TIMEPOINTS ||
    opts.timepoints.length > MAX_TIMEPOINTS
  ) {
    throw new Error(
      `Compare Mode needs ${MIN_TIMEPOINTS}–${MAX_TIMEPOINTS} timepoints.`,
    );
  }
  if (opts.timepoints.some((t) => t.files.length === 0)) {
    throw new Error("Each timepoint needs at least one image.");
  }

  // Sort timepoints oldest → newest by ageHours so chronoOrder is stable.
  const ordered = [...opts.timepoints]
    .map((t, i) => ({ ...t, originalIndex: i }))
    .sort((a, b) => b.parsed.ageHours - a.parsed.ageHours);

  const totalImages = ordered.reduce((sum, t) => sum + t.files.length, 0);

  // 1. Create study row.
  const { data: studyRow, error: insertErr } = await supabase
    .from("studies")
    .insert({
      user_id: uid,
      modality_slug: opts.modality.slug,
      modality_label: `${opts.modality.label} · Compare (${ordered.length} timepoints)`,
      modality_category: opts.modality.category,
      tier: opts.modality.tier,
      catalog: opts.modality.catalog,
      status: "uploading",
      patient_ref_short: opts.patientRefShort ?? null,
      images_count: totalImages,
      videos_count: 0,
      storage_paths: [],
      progress: {
        stage: "uploading",
        percent: 0,
        status: "Uploading compare timepoints…",
      },
      is_compare_mode: true,
      compare_modality_slug: opts.modality.slug,
    })
    .select("id")
    .single();
  if (insertErr || !studyRow) throw new Error(insertErr?.message ?? "study_create_failed");
  const studyId = studyRow.id as string;

  // 2. Upload each timepoint's files.
  const tpResults: CompareUploadResult["timepoints"] = [];
  const allStoragePaths: string[] = [];
  try {
    for (let i = 0; i < ordered.length; i++) {
      const tp = ordered[i];
      const tpPaths: string[] = [];
      for (const file of tp.files.slice(0, MAX_FILES_PER_TIMEPOINT)) {
        const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
        const path = `${uid}/${studyId}/tp-${i}/${Date.now()}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("studies")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw new Error(`Timepoint ${i + 1} upload failed: ${upErr.message}`);
        tpPaths.push(path);
        allStoragePaths.push(path);
      }
      tpResults.push({
        index: tp.originalIndex,
        chronoOrder: i,
        label: tp.parsed.label,
        ageHours: tp.parsed.ageHours,
        absoluteDate: tp.parsed.absoluteDate,
        storagePaths: tpPaths,
      });
    }

    // 3. Persist timepoint manifest.
    const { error: updErr } = await supabase
      .from("studies")
      .update({
        storage_paths: allStoragePaths,
        compare_timepoints: tpResults.map((t) => ({
          index: t.index,
          chrono_order: t.chronoOrder,
          label: t.label,
          age_hours: t.ageHours,
          absolute_date: t.absoluteDate ?? null,
          storage_paths: t.storagePaths,
          // detection result fields populated server-side
          detected_modality_slug: null,
          detection_confidence: null,
          modality_match: null,
        })) as never,
        status: "questionnaire",
        progress: {
          stage: "uploaded",
          percent: 12,
          status: "All timepoints uploaded",
        },
      })
      .eq("id", studyId);
    if (updErr) throw new Error(updErr.message);

    return { studyId, modalitySlug: opts.modality.slug, timepoints: tpResults };
  } catch (err) {
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

/** Kick off compare analysis. Realtime updates surface progress. */
export async function startCompareAnalysis(studyId: string): Promise<void> {
  const { error } = await supabase.functions.invoke("analyze-compare-study", {
    body: { study_id: studyId },
  });
  if (error) throw new Error(error.message);
}

/** Compare Mode consumes a flat 2 scan units regardless of timepoint count. */
export async function consumeCompareQuota(): Promise<{
  allowed: boolean;
  reason?: string;
  plan?: string;
}> {
  for (let i = 0; i < 2; i++) {
    const { data, error } = await supabase.functions.invoke("check-and-consume-quota", {
      body: { mode: "scan" },
    });
    if (error) return { allowed: false, reason: error.message };
    const d = data as { allowed?: boolean; reason?: string; plan?: string };
    if (!d?.allowed) {
      return { allowed: false, reason: d?.reason ?? "quota_denied", plan: d?.plan };
    }
  }
  return { allowed: true };
}
