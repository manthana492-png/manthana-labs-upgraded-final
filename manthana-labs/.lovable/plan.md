## Goal

Hide every DICOM / NIfTI / PACS / FHIR entry point from users so the app behaves as if it doesn't support files produced directly by CT/MRI machines. Code stays in the repo (no deletions) so it can be re-enabled later. All other modalities (X-ray photos, ECG strips, derm/ophthalmology images, ultrasound clips, pathology images, small clinical videos) remain exactly as they are.

## Approach: one feature flag, hard-off

Add a single source of truth:

```ts
// src/lib/featureFlags.ts
export const DICOM_FEATURES_ENABLED = false;
```

Every DICOM/NIfTI/PACS/FHIR surface short-circuits on this flag. No deletions.

## Frontend hides

1. **Routing — `src/App.tsx`**
   - Keep the `DicomStudy` import, but render `/app/dicom` as `<Navigate to="/app/studio" replace />` when flag is off. (Also covers any deep links / bookmarks.)

2. **Studio tile — `src/pages/Studio.tsx`**
   - Hide the entire "DICOM & PACS bridge" card when flag is off (don't just lock it — remove from view).
   - Drop the `useDicomEntitlement` call when hidden.

3. **NewStudy upload — `src/pages/NewStudy.tsx`**
   - Remove `.dcm` / `.nii` / `application/dicom` from the file `accept` list.
   - Reject any dropped `.dcm` / `.nii` / `.nii.gz` with a toast: "DICOM/NIfTI files are not supported. Please upload JPG, PNG, or MP4 exported from your viewer."
   - Reword help text: change "DICOM, JPG, PNG, MP4, MOV — anything from a clinic camera or PACS export." → "JPG, PNG, MP4, MOV — exports from your clinic camera or imaging viewer."
   - Local preview keeps using the existing `DicomViewer` component name (it just renders images/video); no behavior change since DICOM input is blocked upstream.

4. **Report viewer — `src/pages/ReportViewer.tsx`**
   - Wrap `<PacsPushPanel />` render with `DICOM_FEATURES_ENABLED && …` so the PACS push card never appears.

5. **Settings — `src/components/settings/HospitalConnectionSettings.tsx`**
   - Early-return `null` when flag is off so the entire "Hospital connection (PACS / RIS)" section disappears from `/app/settings`.

6. **Landing + About + Privacy copy — `src/pages/Landing.tsx`, `src/pages/About.tsx`, `src/pages/Privacy.tsx`**
   - Remove "DICOM", "PACS", "Cornerstone3D viewer", "FHIR R4 export", and the related FAQ Q/A from marketing copy and JSON-LD `description` fields.
   - Replace with neutral wording: "medical imaging photos and clips", "multi-modality and comparison studies".
   - Drop the "DICOM and PACS" FAQ item entirely; keep the rest.

7. **Modality catalog — no change**
   - CT / MR / NM / PT stay selectable; the existing upload component only accepts images/videos so they naturally fall back to "upload a photo of the film / screen-cap from your viewer". No code change needed beyond the NewStudy `accept` tightening above.

8. **No npm dep removals** — `cornerstone*` / `dicom-parser` stay installed; tree-shaking + unreachable routes mean they won't ship in the user-visible bundle since `DicomStudy` route is unreachable. (If bundle size becomes a concern later, we can lazy-route the page; out of scope for "hide only".)

## Backend hides

Goal: any deployed edge function tied to DICOM/PACS/FHIR responds 404-style so a stale client or someone poking the URL can't use them. Code is kept.

For each of:
- `supabase/functions/dicom-ingest/index.ts`
- `supabase/functions/dicom-export/index.ts`
- `supabase/functions/analyze-dicom-study/index.ts`
- `supabase/functions/pacs-verify/index.ts`
- `supabase/functions/fhir-push/index.ts`

Prepend a kill-switch at the top of the handler (after CORS preflight) returning:
```ts
return new Response(
  JSON.stringify({ error: "DICOM/PACS/FHIR features are disabled." }),
  { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
);
```

This is a 4-line edit per function; no logic deletion, easy to revert.

**`analyze-study` / `upload-study`** — these handle generic studies (images/videos) and don't need changes; only the DICOM-specific functions get the kill switch.

## Files touched

Frontend (8):
- `src/lib/featureFlags.ts` (new, 1 const)
- `src/App.tsx`
- `src/pages/Studio.tsx`
- `src/pages/NewStudy.tsx`
- `src/pages/ReportViewer.tsx`
- `src/pages/Landing.tsx`
- `src/pages/About.tsx`
- `src/pages/Privacy.tsx`
- `src/components/settings/HospitalConnectionSettings.tsx`

Backend (5 short edits):
- `supabase/functions/dicom-ingest/index.ts`
- `supabase/functions/dicom-export/index.ts`
- `supabase/functions/analyze-dicom-study/index.ts`
- `supabase/functions/pacs-verify/index.ts`
- `supabase/functions/fhir-push/index.ts`

Nothing deleted. No DB migration. No package removal. Multi-modality wizard, compare wizard, live capture, modality catalog, all viewers for non-DICOM media — all untouched.

## Verification

1. Visit `/app/dicom` → redirected to `/app/studio`.
2. `/app/studio` no longer shows the DICOM & PACS bridge card.
3. `/app/new` file picker rejects `.dcm` / `.nii` with toast; accepts JPG/PNG/MP4 as before.
4. `/app/settings` no longer shows PACS/RIS section.
5. Report viewer no longer shows the PACS push panel.
6. Landing page text/FAQ/JSON-LD has no DICOM, PACS, FHIR, or Cornerstone3D mentions.
7. `curl` to the 5 disabled edge functions returns HTTP 410 with the disabled message.
8. Multi-modality flow, compare flow, live capture, and a normal JPG study upload all still work end-to-end (smoke test).

## Re-enabling later

Flip `DICOM_FEATURES_ENABLED` to `true` and remove the 5 kill-switch lines from the edge functions. Everything else is intact.
