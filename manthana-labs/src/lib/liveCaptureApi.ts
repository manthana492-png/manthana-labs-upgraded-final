// Lightweight client wrapper around the analyze-live-capture edge function.
// Supports two capture modes:
//   - video: full webm clip + 1-4 frames extracted on-device for vision AI
//   - photos: 1-4 still photos
import { supabase } from "@/integrations/supabase/client";
import type { FollowUpQuestion, WebCitation } from "./types";

export interface LiveProgress {
  stage: string;
  pct: number;
  label?: string;
}

export function subscribeLiveProgress(
  studyId: string,
  onUpdate: (progress: LiveProgress) => void,
) {
  const channel = supabase
    .channel(`live-capture:${studyId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "studies",
        filter: `id=eq.${studyId}`,
      },
      (payload) => {
        const row = payload.new as { progress?: LiveProgress };
        if (row?.progress && typeof row.progress.pct === "number") {
          onUpdate(row.progress);
        }
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

interface SignedUploadSlot {
  url: string;
  token: string;
  path: string;
}

export interface InitResult {
  studyId: string;
  videoPath: string | null;
  photoPaths: string[];
  videoUpload: SignedUploadSlot | null;
  frameUploads: SignedUploadSlot[];
  photoUploads: SignedUploadSlot[];
  holoscanEnabled: boolean;
  kind: "video" | "photos";
}

export interface InitParams {
  specialtySlug: string;
  kind: "video" | "photos";
  /** number of frames to extract on-device (video mode). 0 if unsupported. */
  frameCount?: number;
  photoCount?: number;
  patientRefShort?: string;
}

export async function liveCaptureInit(params: InitParams): Promise<InitResult> {
  const { data, error } = await supabase.functions.invoke("analyze-live-capture", {
    body: {
      action: "init",
      specialty_slug: params.specialtySlug,
      kind: params.kind,
      frame_count: params.frameCount ?? 0,
      photo_count: params.photoCount ?? 0,
      patient_ref_short: params.patientRefShort,
    },
  });
  if (error) throw new Error(error.message);
  const d = data as {
    study_id: string;
    kind: "video" | "photos";
    video_path: string | null;
    photo_paths: string[];
    video_upload: SignedUploadSlot | null;
    frame_uploads: SignedUploadSlot[];
    photo_uploads: SignedUploadSlot[];
    holoscan_enabled: boolean;
  };
  return {
    studyId: d.study_id,
    kind: d.kind,
    videoPath: d.video_path,
    photoPaths: d.photo_paths ?? [],
    videoUpload: d.video_upload,
    frameUploads: d.frame_uploads ?? [],
    photoUploads: d.photo_uploads ?? [],
    holoscanEnabled: d.holoscan_enabled,
  };
}

async function uploadToSlot(slot: SignedUploadSlot, blob: Blob, contentType?: string) {
  const { error } = await supabase.storage
    .from("studies")
    .uploadToSignedUrl(slot.path, slot.token, blob, {
      contentType: contentType || blob.type || "application/octet-stream",
      upsert: true,
    });
  if (error) throw error;
}

export async function liveCaptureUploadVideo(
  init: InitResult,
  videoBlob: Blob,
  frameBlobs: Blob[],
): Promise<void> {
  if (!init.videoUpload) throw new Error("missing_video_upload_slot");
  await uploadToSlot(init.videoUpload, videoBlob, videoBlob.type || "video/webm");
  // Upload as many frames as we have slots for.
  const pairs = init.frameUploads.slice(0, frameBlobs.length).map((slot, i) => ({
    slot,
    blob: frameBlobs[i],
  }));
  await Promise.all(pairs.map(({ slot, blob }) => uploadToSlot(slot, blob, "image/jpeg")));
}

export async function liveCaptureUploadPhotos(
  init: InitResult,
  photoBlobs: Blob[],
): Promise<void> {
  const pairs = init.photoUploads.slice(0, photoBlobs.length).map((slot, i) => ({
    slot,
    blob: photoBlobs[i],
  }));
  if (pairs.length === 0) throw new Error("no_photo_upload_slots");
  await Promise.all(pairs.map(({ slot, blob }) => uploadToSlot(slot, blob, "image/jpeg")));
}

export interface Pass1Result {
  studyId: string;
  followUpQuestions: FollowUpQuestion[];
  preliminary: { narrative: string; findings: unknown[] };
  holoscanUsed: boolean;
}

export async function liveCapturePass1(studyId: string): Promise<Pass1Result> {
  const { data, error } = await supabase.functions.invoke("analyze-live-capture", {
    body: { action: "analyze_pass1", study_id: studyId },
  });
  if (error) throw new Error(error.message);
  const d = data as {
    study_id: string;
    follow_up_questions: FollowUpQuestion[];
    preliminary: { narrative: string; findings: unknown[] };
    holoscan_used: boolean;
  };
  return {
    studyId: d.study_id,
    followUpQuestions: d.follow_up_questions ?? [],
    preliminary: d.preliminary ?? { narrative: "", findings: [] },
    holoscanUsed: d.holoscan_used,
  };
}

export interface Pass2Result {
  studyId: string;
  status: string;
  narrative: string;
  findings: unknown[];
  webCitations: WebCitation[];
  overallConfidence: number;
  informationGaps: string[];
}

export async function liveCapturePass2(
  studyId: string,
  followUpAnswers: Record<string, string>,
): Promise<Pass2Result> {
  const { data, error } = await supabase.functions.invoke("analyze-live-capture", {
    body: { action: "analyze_pass2", study_id: studyId, follow_up_answers: followUpAnswers },
  });
  if (error) throw new Error(error.message);
  const d = data as {
    study_id: string;
    status: string;
    narrative: string;
    findings: unknown[];
    web_citations: WebCitation[];
    overall_confidence: number;
    information_gaps: string[];
  };
  return {
    studyId: d.study_id,
    status: d.status,
    narrative: d.narrative,
    findings: d.findings ?? [],
    webCitations: d.web_citations ?? [],
    overallConfidence: d.overall_confidence,
    informationGaps: d.information_gaps ?? [],
  };
}

export async function liveCaptureFetchStudy(studyId: string): Promise<Pass2Result | null> {
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) throw new Error("not_authenticated");
  const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-study`);
  url.searchParams.set("id", studyId);
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const report = data?.report as {
    narrative?: string;
    findings?: unknown[];
    webCitations?: WebCitation[];
    web_citations?: WebCitation[];
    overallConfidence?: number;
    informationGaps?: string[];
  } | null;
  if (!report || data?.status !== "awaiting_review") return null;
  return {
    studyId,
    status: String(data.status),
    narrative: report.narrative ?? "",
    findings: report.findings ?? [],
    webCitations: report.webCitations ?? report.web_citations ?? [],
    overallConfidence: Number(report.overallConfidence ?? 0.7),
    informationGaps: report.informationGaps ?? [],
  };
}
