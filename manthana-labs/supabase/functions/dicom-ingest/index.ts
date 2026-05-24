// dicom-ingest — accepts multipart DICOM uploads (browser path) or DICOMweb
// STOW-RS pushes (PACS path via ?token=...). Stores files in the studies
// bucket, parses minimal tags, inserts a `studies` row + `dicom_assets` rows.
//
// Note: Full SR / encapsulated-PDF builders live in dicom-export. This
// function just gets bytes onto storage and lets analyze-dicom-study handle
// the rest.

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAuthCtx, clientIp } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/audit.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// DICOM / NIfTI / PACS / FHIR features are disabled. Re-enable by removing
// this block and flipping DICOM_FEATURES_ENABLED in src/lib/featureFlags.ts.
const FEATURE_DISABLED = true;

const MAX_FILES = 200;
const MAX_FILE_BYTES = 200 * 1024 * 1024; // 200MB per DICOM instance

// Read minimal DICOM tags (Explicit VR LE) — same shape as src/lib/dicom/parse.ts
const WANTED_TAGS: Record<string, string> = {
  "00080016": "sop_class_uid",
  "00080018": "sop_instance_uid",
  "00080060": "modality",
  "0020000D": "study_instance_uid",
  "0020000E": "series_instance_uid",
  "00100020": "patient_id",
  "00180015": "body_part",
  "00280008": "frames",
  "00280010": "rows",
  "00280011": "cols",
};

interface ParsedTags {
  sop_instance_uid?: string;
  sop_class_uid?: string;
  modality?: string;
  study_instance_uid?: string;
  series_instance_uid?: string;
  body_part?: string;
  rows?: number;
  cols?: number;
  frames?: number;
}

function parseDicomTags(bytes: Uint8Array): ParsedTags | null {
  if (bytes.length < 132) return null;
  const magic = String.fromCharCode(bytes[128], bytes[129], bytes[130], bytes[131]);
  if (magic !== "DICM") return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: ParsedTags = {};
  let off = 132;
  const limit = Math.min(bytes.length, 256 * 1024);
  while (off + 8 <= limit) {
    const group = dv.getUint16(off, true);
    const elem = dv.getUint16(off + 2, true);
    const tag =
      group.toString(16).padStart(4, "0").toUpperCase() +
      elem.toString(16).padStart(4, "0").toUpperCase();
    const vr = String.fromCharCode(bytes[off + 4], bytes[off + 5]);
    let length = 0;
    let dataStart = 0;
    const longVR = ["OB", "OW", "OF", "SQ", "UT", "UN"];
    if (longVR.includes(vr)) {
      if (off + 12 > limit) break;
      length = dv.getUint32(off + 8, true);
      dataStart = off + 12;
    } else {
      length = dv.getUint16(off + 6, true);
      dataStart = off + 8;
    }
    if (vr === "SQ" || tag === "7FE00010" || length === 0xffffffff) break;
    if (dataStart + length > limit) break;
    const key = WANTED_TAGS[tag];
    if (key) {
      if (vr === "US" && length >= 2) {
        (out as Record<string, unknown>)[key] = dv.getUint16(dataStart, true);
      } else if (vr === "UL" && length >= 4) {
        (out as Record<string, unknown>)[key] = dv.getUint32(dataStart, true);
      } else {
        let s = "";
        for (let i = 0; i < length; i++) {
          const c = bytes[dataStart + i];
          if (c === 0) break;
          s += String.fromCharCode(c);
        }
        (out as Record<string, unknown>)[key] = s.trim();
      }
    }
    off = dataStart + length;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  if (FEATURE_DISABLED) {
    return jsonResponse({ error: "feature_disabled", message: "DICOM/PACS/FHIR features are disabled." }, 410);
  }

  // Two auth modes:
  //  - JWT (browser-driven manual upload)
  //  - ?token=... matched against hospital_connections.inbound_token (PACS push)
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  let userId: string | null = null;
  let actorEmail: string | null = null;
  let admin: ReturnType<typeof createClient>;

  if (token) {
    admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: conn } = await admin
      .from("hospital_connections")
      .select("user_id,enabled")
      .eq("inbound_token", token)
      .maybeSingle();
    if (!conn || !conn.enabled) {
      return jsonResponse({ error: "invalid_inbound_token" }, 401);
    }
    userId = conn.user_id as string;
  } else {
    const ctx = await getAuthCtx(req);
    if (!ctx) return jsonResponse({ error: "unauthorized" }, 401);
    userId = ctx.userId;
    actorEmail = ctx.email;
    admin = ctx.admin;

    // Server-side entitlement check
    const [{ data: sub }, { data: profile }] = await Promise.all([
      admin.from("user_subscriptions").select("plan_code,status").eq("user_id", userId).maybeSingle(),
      admin.from("profiles").select("professional_role").eq("id", userId).maybeSingle(),
    ]);
    const plan = sub?.status === "active" ? sub?.plan_code : "free";
    const role = (profile as { professional_role?: string } | null)?.professional_role ?? "other";
    const planOk = plan === "pro_plus" || plan === "enterprise";
    const roleOk = role === "radiologist" || role === "hospital" || role === "nursing_home";
    if (!planOk || !roleOk) {
      return jsonResponse({ error: "feature_not_in_plan" }, 403);
    }
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonResponse({ error: "expected_multipart_form_data" }, 400);
  }

  const patientRefRaw = form.get("patient_ref_short");
  const patientRefShort =
    typeof patientRefRaw === "string" ? patientRefRaw.slice(0, 40) : null;

  const fileEntries = form.getAll("files").filter((f): f is File => f instanceof File);
  if (fileEntries.length === 0) return jsonResponse({ error: "no_files_provided" }, 400);
  if (fileEntries.length > MAX_FILES) return jsonResponse({ error: "too_many_files" }, 400);

  // Parse first file's tags to derive study-level metadata
  const firstBytes = new Uint8Array(await fileEntries[0].arrayBuffer());
  const firstTags = parseDicomTags(firstBytes);
  if (!firstTags) return jsonResponse({ error: "not_dicom" }, 400);

  const modality = firstTags.modality ?? "DICOM";
  const studyUID = firstTags.study_instance_uid ?? null;

  const { data: studyRow, error: insertErr } = await admin
    .from("studies")
    .insert({
      user_id: userId,
      modality_slug: `dicom-${modality.toLowerCase()}`,
      modality_label: `DICOM ${modality}${firstTags.body_part ? ` · ${firstTags.body_part}` : ""}`,
      modality_category: "Imaging",
      tier: "A",
      catalog: "nvidia_backed",
      status: "uploading",
      images_count: fileEntries.length,
      videos_count: 0,
      patient_ref_short: patientRefShort,
      is_dicom: true,
      study_instance_uid: studyUID,
      progress: { stage: "uploading", percent: 0, status: "Ingesting DICOM…" },
      storage_paths: [],
    })
    .select("id")
    .single();

  if (insertErr || !studyRow) {
    return (console.error("study_insert_failed:", insertErr), jsonResponse({ error: "Could not save study. Please try again." }, 500));
  }
  const studyId = studyRow.id as string;

  let accepted = 0;
  let rejected = 0;
  const storagePaths: string[] = [];

  for (let i = 0; i < fileEntries.length; i++) {
    const f = fileEntries[i];
    if (f.size > MAX_FILE_BYTES) {
      rejected++;
      continue;
    }
    const bytes = i === 0 ? firstBytes : new Uint8Array(await f.arrayBuffer());
    const tags = i === 0 ? firstTags : parseDicomTags(bytes);
    if (!tags) {
      rejected++;
      continue;
    }
    const safeName = `${String(i + 1).padStart(3, "0")}_${(f.name || "instance.dcm")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 100)}`;
    const path = `${userId}/${studyId}/dicom/${safeName}`;
    const { error: upErr } = await admin.storage.from("studies").upload(path, bytes, {
      contentType: "application/dicom",
      upsert: false,
    });
    if (upErr) {
      rejected++;
      continue;
    }
    storagePaths.push(path);
    accepted++;

    await admin.from("dicom_assets").insert({
      study_id: studyId,
      user_id: userId,
      sop_instance_uid: tags.sop_instance_uid ?? `unknown-${i}`,
      sop_class_uid: tags.sop_class_uid ?? null,
      series_instance_uid: tags.series_instance_uid ?? null,
      study_instance_uid: tags.study_instance_uid ?? null,
      modality: tags.modality ?? null,
      body_part: tags.body_part ?? null,
      rows: tags.rows ?? null,
      cols: tags.cols ?? null,
      frame_count: tags.frames ?? 1,
      dcm_path: path,
      phi_scrubbed: true,
    });
  }

  await admin
    .from("studies")
    .update({
      storage_paths: storagePaths,
      status: "questionnaire",
      progress: { stage: "uploaded", percent: 15, status: `Ingested ${accepted} instance(s)` },
    })
    .eq("id", studyId);

  await writeAudit(admin, {
    userId,
    actorEmail,
    action: "dicom.ingest",
    entityType: "study",
    entityId: studyId,
    metadata: { accepted, rejected, modality, study_instance_uid: studyUID, source: token ? "pacs" : "manual" },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonResponse({
    study_id: studyId,
    accepted_files: accepted,
    rejected_files: rejected,
    study_instance_uid: studyUID,
    modality,
  });
});
