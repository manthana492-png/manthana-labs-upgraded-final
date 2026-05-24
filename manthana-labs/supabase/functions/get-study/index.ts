// get-study — GET /functions/v1/get-study?id={study_id}
// Returns the full study row + nested findings array, shaped to match the
// frontend `Study + Report` types in src/lib/types.ts.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAuthCtx } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return jsonResponse({ error: "method_not_allowed" }, 405);

  const ctx = await getAuthCtx(req);
  if (!ctx) return jsonResponse({ error: "unauthorized" }, 401);

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return jsonResponse({ error: "missing_id" }, 400);

  const { data: study, error } = await ctx.admin
    .from("studies")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return jsonResponse({ error: error.message }, 500);
  if (!study) return jsonResponse({ error: "not_found" }, 404);
  // Defence-in-depth: even though RLS would block, double-check ownership.
  if (study.user_id !== ctx.userId) return jsonResponse({ error: "forbidden" }, 403);

  const { data: findings } = await ctx.admin
    .from("findings")
    .select("*")
    .eq("study_id", id)
    .order("display_order", { ascending: true });

  // Shape findings to match the camelCase frontend `Finding` type.
  const findingsOut = (findings ?? []).map((f) => ({
    id: f.id,
    title: f.title,
    description: f.description ?? "",
    severity: f.severity,
    confidence: Number(f.confidence),
    region: f.region ?? undefined,
    anatomicalRegion: f.anatomical_region ?? undefined,
    observation: f.observation ?? undefined,
    impression: f.impression ?? undefined,
    recommendation: f.recommendation ?? undefined,
    icd10Code: f.icd10_code ?? undefined,
    icd10Label: f.icd10_label ?? undefined,
    snomedCode: f.snomed_code ?? undefined,
    snomedLabel: f.snomed_label ?? undefined,
    urgency: f.urgency ?? undefined,
    differentials: f.differentials ?? undefined,
    escalationAcknowledged: f.escalation_acknowledged,
    escalationCallbackTarget: f.escalation_callback_target ?? undefined,
    escalationCommunicationNote: f.escalation_communication_note ?? undefined,
    escalationAcknowledgedAt: f.escalation_acknowledged_at ?? undefined,
    escalationAcknowledgedBy: f.escalation_acknowledged_by ?? undefined,
  }));

  // Build a Report object only if analysis has produced narrative or findings.
  const hasReport = !!study.narrative || findingsOut.length > 0;
  const mmSynthesis = study.multi_modality_synthesis as Record<string, unknown> | null;
  const cmpSynthesis = study.compare_synthesis as Record<string, unknown> | null;
  const report = hasReport
    ? {
        narrative: study.narrative ?? "",
        findings: findingsOut,
        overallConfidence: study.overall_confidence != null ? Number(study.overall_confidence) : 0,
        informationGaps: study.information_gaps ?? [],
        foundationModelCaveat: study.foundation_model_caveat ?? undefined,
        patientSummary: study.patient_summary ?? undefined,
        criticalAcknowledgedAt: study.critical_acknowledged_at ?? undefined,
        criticalAcknowledgedBy: study.critical_acknowledged_by ?? undefined,
        criticalCallbackTarget: study.critical_callback_target ?? undefined,
        reportHash: study.report_hash ?? undefined,
        reportSignature: study.report_signature ?? undefined,
        webCitations: study.web_citations ?? [],
        // Multi-modality (single patient · multiple investigations)
        ...(study.is_multi_modality && mmSynthesis ? mmSynthesis : {}),
        // Compare mode (longitudinal · same modality · multiple timepoints)
        ...(study.is_compare_mode && cmpSynthesis ? cmpSynthesis : {}),
      }
    : null;

  return jsonResponse({
    id: study.id,
    status: study.status,
    progress: study.progress ?? {},
    errorMessage: study.error_message ?? null,
    modality: {
      slug: study.modality_slug,
      label: study.modality_label,
      category: study.modality_category,
      tier: study.tier,
      catalog: study.catalog,
    },
    detectedModalitySlug: study.detected_modality_slug ?? null,
    detectionConfidence: study.detection_confidence != null ? Number(study.detection_confidence) : null,
    patientRefShort: study.patient_ref_short ?? null,
    imagesCount: study.images_count,
    videosCount: study.videos_count,
    storagePaths: study.storage_paths ?? [],
    questionnaireAnswers: study.questionnaire_answers ?? {},
    dynamicQuestions: study.dynamic_questions ?? [],
    webCitations: study.web_citations ?? [],
    createdAt: study.created_at,
    updatedAt: study.updated_at,
    reviewConfirmedAt: study.review_confirmed_at,
    reviewingDoctorNote: study.reviewing_doctor_note,
    isMultiModality: !!study.is_multi_modality,
    multiModalityLegs: study.multi_modality_legs ?? null,
    isCompareMode: !!study.is_compare_mode,
    compareTimepoints: study.compare_timepoints ?? null,
    compareModalitySlug: study.compare_modality_slug ?? null,
    report,
  });
});
