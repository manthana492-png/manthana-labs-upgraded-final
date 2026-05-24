/**
 * Centralized feature flags.
 *
 * DICOM_FEATURES_ENABLED — master switch for all DICOM / NIfTI / PACS / FHIR
 * surfaces (direct CT/MRI scanner exports, PACS bridge, FHIR R4 export,
 * hospital connection settings). When false, every related UI entry point
 * is hidden and the matching edge functions return HTTP 410 Gone.
 *
 * To re-enable end-to-end, flip this to true AND remove the kill-switch
 * blocks at the top of:
 *   supabase/functions/dicom-ingest/index.ts
 *   supabase/functions/dicom-export/index.ts
 *   supabase/functions/analyze-dicom-study/index.ts
 *   supabase/functions/pacs-verify/index.ts
 *   supabase/functions/fhir-push/index.ts
 */
export const DICOM_FEATURES_ENABLED = false;
