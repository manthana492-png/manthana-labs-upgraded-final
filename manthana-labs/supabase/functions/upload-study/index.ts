// upload-study — POST /functions/v1/upload-study
// Multipart form-data: files[] (1..N), modality_slug? (optional explicit pick)
// Validates: max 4 images, 3 videos. Video duration check is best-effort
// (Deno can't decode arbitrary container metadata) — enforced by file-size
// proxy + later by Modal pre-flight.
//
// Inserts a `studies` row, uploads files to private `studies` bucket at
// {user_id}/{study_id}/{filename}, returns {study_id, storage_paths[]}.

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAuthCtx, clientIp } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/audit.ts";
import {
  tierForSlug, catalogForSlug, categoryFromSlug,
} from "../_shared/modalities.ts";

const MAX_IMAGES = 4;
const MAX_VIDEOS = 3;
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB per file
const VIDEO_BYTES_LIMIT = 25 * 1024 * 1024; // proxy for ≤10s video

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const ctx = await getAuthCtx(req);
  if (!ctx) return jsonResponse({ error: "unauthorized" }, 401);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonResponse({ error: "expected_multipart_form_data" }, 400);
  }

  const slugRaw = form.get("modality_slug");
  const modalitySlug = typeof slugRaw === "string" && slugRaw.length > 0 ? slugRaw : null;
  const labelRaw = form.get("modality_label");
  const modalityLabel = typeof labelRaw === "string" && labelRaw.length > 0 ? labelRaw : null;
  const patientRefRaw = form.get("patient_ref_short");
  const patientRefShort = typeof patientRefRaw === "string" ? patientRefRaw.slice(0, 40) : null;

  const fileEntries = form.getAll("files").filter((f): f is File => f instanceof File);
  if (fileEntries.length === 0) {
    return jsonResponse({ error: "no_files_provided" }, 400);
  }

  // Validate counts and sizes
  let imageCount = 0, videoCount = 0;
  for (const f of fileEntries) {
    if (f.size > MAX_FILE_BYTES) {
      return jsonResponse({ error: "file_too_large", file: f.name, max_bytes: MAX_FILE_BYTES }, 413);
    }
    if (f.type.startsWith("video/")) {
      videoCount++;
      if (f.size > VIDEO_BYTES_LIMIT) {
        return jsonResponse({
          error: "video_likely_exceeds_10s",
          file: f.name,
          hint: "Compress video to ≤25MB / ≤10s",
        }, 413);
      }
    } else {
      imageCount++;
    }
  }
  if (imageCount > MAX_IMAGES) return jsonResponse({ error: "too_many_images", max: MAX_IMAGES }, 400);
  if (videoCount > MAX_VIDEOS) return jsonResponse({ error: "too_many_videos", max: MAX_VIDEOS }, 400);

  // Resolve tier/catalog (defaults to Tier C if slug unknown)
  const tier = modalitySlug ? tierForSlug(modalitySlug) : "C";
  const catalog = modalitySlug ? catalogForSlug(modalitySlug) : "research_assisted";
  const category = modalitySlug ? categoryFromSlug(modalitySlug) : "Photo";
  const finalSlug = modalitySlug ?? "unknown";
  const finalLabel = modalityLabel ?? "Pending detection";

  // Insert study row first to get an id
  const { data: studyRow, error: insertErr } = await ctx.admin
    .from("studies")
    .insert({
      user_id: ctx.userId,
      modality_slug: finalSlug,
      modality_label: finalLabel,
      modality_category: category,
      tier,
      catalog,
      status: "uploading",
      images_count: imageCount,
      videos_count: videoCount,
      patient_ref_short: patientRefShort,
      progress: { stage: "uploading", percent: 0, status: "Uploading files…" },
      storage_paths: [],
    })
    .select("id")
    .single();

  if (insertErr || !studyRow) {
    console.error("study insert failed", insertErr);
    return (console.error("study_insert_failed:", insertErr), jsonResponse({ error: "Could not save study. Please try again." }, 500));
  }
  const studyId = studyRow.id as string;

  // Upload each file under {user_id}/{study_id}/{safeName}
  const storagePaths: string[] = [];
  let i = 0;
  for (const f of fileEntries) {
    i++;
    const safeName = `${String(i).padStart(2, "0")}_${(f.name || "file")
      .replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100)}`;
    const path = `${ctx.userId}/${studyId}/${safeName}`;
    const bytes = new Uint8Array(await f.arrayBuffer());
    const { error: upErr } = await ctx.admin.storage.from("studies").upload(path, bytes, {
      contentType: f.type || "application/octet-stream",
      upsert: false,
    });
    if (upErr) {
      console.error("upload failed", path, upErr);
      // Mark study as error and bail
      await ctx.admin.from("studies").update({
        status: "error",
        error_message: `Upload failed for ${f.name}: ${upErr.message}`,
      }).eq("id", studyId);
      return (console.error("upload_failed:", f.name, upErr), jsonResponse({ error: "File upload failed. Please try again." }, 500));
    }
    storagePaths.push(path);
  }

  // Mark uploading complete (next call will be detect-modality or analyze-study)
  await ctx.admin.from("studies").update({
    storage_paths: storagePaths,
    status: modalitySlug ? "questionnaire" : "draft",
    progress: { stage: "uploaded", percent: 10, status: "Files uploaded" },
  }).eq("id", studyId);

  await writeAudit(ctx.admin, {
    userId: ctx.userId,
    actorEmail: ctx.email,
    action: "study.upload",
    entityType: "study",
    entityId: studyId,
    metadata: {
      modality_slug: finalSlug, tier, catalog,
      images: imageCount, videos: videoCount, file_count: fileEntries.length,
    },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonResponse({
    study_id: studyId,
    storage_paths: storagePaths,
    tier, catalog, modality_slug: finalSlug,
    status: modalitySlug ? "questionnaire" : "draft",
  });
});
