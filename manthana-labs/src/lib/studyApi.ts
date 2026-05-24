// Manthana studies API — wraps Edge Function endpoints with offline-friendly
// fallbacks. All calls require the user to be authenticated; the Supabase JS
// client automatically attaches the bearer token.
import { supabase } from "@/integrations/supabase/client";
import type { Modality, Report, Study, StudyStatus } from "./types";

export interface UploadResult {
  studyId: string;
  storagePaths: string[];
  status: StudyStatus;
}

export interface DynamicQuestion {
  id: string;
  prompt: string;
  helper?: string;
  kind: "yesno" | "multi" | "number" | "text";
  required?: boolean;
  min?: number;
  max?: number;
  unit?: string;
  options?: Array<{ value: string; label: string }>;
}

export interface DetectResult {
  detectedModalitySlug: string;
  modalityLabel?: string;
  confidence: number;
  reasoning?: string;
  requiresConfirmation: boolean;
  tier: "A" | "B" | "C" | "H";
  catalog: "nvidia_backed" | "research_assisted" | "hybrid_nvidia_quaasx108";
  category?: string;
  questions?: DynamicQuestion[];
}

/** Multipart upload of images + videos. Server validates count + size limits. */
export async function uploadStudy(opts: {
  modality: Modality;
  images: File[];
  videos: File[];
  patientRefShort?: string;
}): Promise<UploadResult> {
  const fd = new FormData();
  fd.append("modality_slug", opts.modality.slug);
  fd.append("modality_label", opts.modality.label);
  fd.append("modality_category", opts.modality.category);
  fd.append("tier", opts.modality.tier);
  fd.append("catalog", opts.modality.catalog);
  if (opts.patientRefShort) fd.append("patient_ref_short", opts.patientRefShort);
  // Server reads `files` (single field, multiple values).
  for (const img of opts.images) fd.append("files", img, img.name);
  for (const vid of opts.videos) fd.append("files", vid, vid.name);

  const { data, error } = await supabase.functions.invoke("upload-study", { body: fd });
  if (error) throw new Error(error.message);
  return {
    studyId: (data as { study_id: string }).study_id,
    storagePaths: (data as { storage_paths: string[] }).storage_paths ?? [],
    status: (data as { status: StudyStatus }).status,
  };
}

/** Detect modality + generate dynamic clinical questionnaire in one AI call. */
export async function detectModality(studyId: string): Promise<DetectResult> {
  const { data, error } = await supabase.functions.invoke("detect-and-brief", {
    body: { study_id: studyId },
  });
  if (error) throw new Error(error.message);
  const d = data as Record<string, unknown>;
  return {
    detectedModalitySlug: String(d.detected_modality_slug ?? ""),
    modalityLabel: (d.modality_label as string) ?? undefined,
    confidence: Number(d.confidence ?? 0),
    reasoning: (d.reasoning as string) ?? undefined,
    requiresConfirmation: Boolean(d.requires_confirmation),
    tier: d.tier as DetectResult["tier"],
    catalog: d.catalog as DetectResult["catalog"],
    category: (d.category as string) ?? undefined,
    questions: (d.questions as DynamicQuestion[]) ?? [],
  };
}

/** Kick off background analysis. Returns immediately. */
export async function startAnalysis(opts: {
  studyId: string;
  modalitySlug: string;
  questionnaireAnswers: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabase.functions.invoke("analyze-study", {
    body: {
      study_id: opts.studyId,
      modality_slug: opts.modalitySlug,
      questionnaire_answers: opts.questionnaireAnswers,
    },
  });
  if (error) throw new Error(error.message);
}

/**
 * Server-side study + report fetch. Returns null if not found.
 *
 * - Throws `missing_id` synchronously when no studyId is provided so callers
 *   can surface a clear UI error (and never make the network call).
 * - Accepts an `AbortSignal` so polling loops can cancel a stale request before
 *   firing the next one (prevents request pile-up + intermittent 4xx noise).
 */
export async function fetchStudy(
  studyId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<{
  study: Partial<Study>;
  status: StudyStatus;
  progress: { stage?: string; percent?: number };
  errorMessage: string | null;
} | null> {
  // supabase-js `invoke` doesn't cleanly support GET query strings — use fetch
  // directly so the `?id=…` parameter actually reaches the edge function.
  if (!studyId || typeof studyId !== "string" || studyId.trim() === "") {
    throw new Error("missing_id");
  }
  const sess = (await supabase.auth.getSession()).data.session;
  if (!sess) throw new Error("not_authenticated");
  const url = new URL(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-study`,
  );
  url.searchParams.set("id", studyId);
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${sess.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    signal: opts.signal,
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`get-study ${res.status}`);
  const payload = await res.json();
  return shapeStudyPayload(payload);
}

function shapeStudyPayload(p: Record<string, unknown>): {
  study: Partial<Study>;
  status: StudyStatus;
  progress: { stage?: string; percent?: number };
  errorMessage: string | null;
} {
  const modality = p.modality as Modality;
  const report = p.report as (Report & Record<string, unknown>) | null;
  const webCitations = p.webCitations as Report["webCitations"] | undefined;
  const study: Partial<Study> & {
    webCitations?: Report["webCitations"];
    isMultiModality?: boolean;
    multiModalityLegs?: unknown;
    isCompareMode?: boolean;
    compareTimepoints?: unknown;
    compareModalitySlug?: string | null;
  } = {
    id: p.id as string,
    modality,
    createdAt: p.createdAt as string,
    status: p.status as StudyStatus,
    imagesCount: (p.imagesCount as number) ?? 0,
    videosCount: (p.videosCount as number) ?? 0,
    patientRefShort: (p.patientRefShort as string) ?? undefined,
    reviewConfirmedAt: (p.reviewConfirmedAt as string) ?? undefined,
    reviewingDoctorNote: (p.reviewingDoctorNote as string) ?? undefined,
    editedByDoctor: (p.editedByDoctor as boolean) ?? (p.edited_by_doctor as boolean) ?? false,
    reportLocked: (p.reportLocked as boolean) ?? (p.report_locked as boolean) ?? false,
    report: report
      ? { ...report, studyId: p.id as string, webCitations: webCitations ?? report.webCitations }
      : undefined,
    webCitations,
    isMultiModality: !!p.isMultiModality,
    multiModalityLegs: p.multiModalityLegs ?? null,
    isCompareMode: !!p.isCompareMode,
    compareTimepoints: p.compareTimepoints ?? null,
    compareModalitySlug: (p.compareModalitySlug as string | null) ?? null,
  };
  return {
    study,
    status: p.status as StudyStatus,
    progress: (p.progress as { stage?: string; percent?: number }) ?? {},
    errorMessage: (p.errorMessage as string) ?? null,
  };
}

/** Confirm review server-side. */
export async function confirmReviewRemote(studyId: string, note?: string): Promise<void> {
  const { error } = await supabase.functions.invoke("confirm-review", {
    body: { study_id: studyId, note },
  });
  if (error) throw new Error(error.message);
}

/** Server-rendered PDF — returns a blob URL the caller is responsible for revoking. */
export async function generatePdfUrl(studyId: string): Promise<string> {
  const sess = (await supabase.auth.getSession()).data.session;
  if (!sess) throw new Error("not_authenticated");
  const url = new URL(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-pdf`,
  );
  url.searchParams.set("id", studyId);
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${sess.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`generate-pdf ${res.status}: ${txt.slice(0, 200)}`);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/** Subscribe to Realtime progress updates on a single study row. */
export function subscribeStudyProgress(
  studyId: string,
  onUpdate: (row: {
    status: StudyStatus;
    progress: { stage?: string; percent?: number };
    error_message: string | null;
  }) => void,
) {
  const channel = supabase
    .channel(`study:${studyId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "studies",
        filter: `id=eq.${studyId}`,
      },
      (payload) => {
        const row = payload.new as {
          status: StudyStatus;
          progress: { stage?: string; percent?: number };
          error_message: string | null;
        };
        onUpdate(row);
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
