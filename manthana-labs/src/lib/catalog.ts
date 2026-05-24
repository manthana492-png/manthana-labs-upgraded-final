// ============================================================================
// CLINICAL LANES — neutral, doctor-mental-model grouping of all modalities.
// 5 top-level lanes. No backend / vendor / model names ever surface here.
// ============================================================================
import type { Modality } from "./types";

export type Lane = "imaging" | "live" | "pathology" | "ecg" | "photo";

export interface LaneMeta {
  id: Lane;
  label: string;
  short: string;
  description: string;
  icon: "scan" | "radio" | "microscope" | "activity" | "camera";
}

export const LANES: LaneMeta[] = [
  {
    id: "imaging",
    label: "Imaging",
    short: "Imaging",
    description: "X-Ray · CT · MRI · Ultrasound · Nuclear",
    icon: "scan",
  },
  {
    id: "live",
    label: "Live Capture",
    short: "Live",
    description: "Real-time bedside video & photo analysis",
    icon: "radio",
  },
  {
    id: "pathology",
    label: "Pathology",
    short: "Pathology",
    description: "Whole-slide histology & cytology",
    icon: "microscope",
  },
  {
    id: "ecg",
    label: "ECG",
    short: "ECG",
    description: "12-lead, Holter & event monitoring",
    icon: "activity",
  },
  {
    id: "photo",
    label: "Photo",
    short: "Photo",
    description: "Dermatology, ophthalmology & wound photography",
    icon: "camera",
  },
];

export function laneForModality(m: Pick<Modality, "category" | "slug">): Lane {
  if (m.slug.startsWith("live_")) return "live";
  if (m.category === "Pathology") return "pathology";
  if (m.category === "ECG") return "ecg";
  if (m.category === "Photo") return "photo";
  // Imaging covers X-Ray, CT, MRI, Ultrasound, Nuclear, Video (endoscopy)
  return "imaging";
}

// 3D / volumetric modalities — locked behind "Coming Soon" until the
// volumetric viewer + GPU service is ready.
const LOCKED_3D_SLUGS = new Set<string>([
  "ct_brain_perfusion",
  "ct_angio_cardiac",
  "ct_angio_pulmonary",
  "mri_cardiac_cine",
  "mri_breast_dce",
  "mri_prostate_multiparametric",
  "mri_liver_elastography",
  "pet_ct_oncology",
  "pet_ct_cardiac",
  "spect_bone",
  "mra_brain",
  "cta_aorta",
  "ct_colonography",
]);

export type LockReason = "coming_soon_3d";

export function lockReasonForModality(m: Pick<Modality, "slug" | "tier">): LockReason | null {
  if (LOCKED_3D_SLUGS.has(m.slug)) return "coming_soon_3d";
  // Defensive: any future Tier B slug also gets locked.
  if (m.tier === "B") return "coming_soon_3d";
  return null;
}

export function isLocked(m: Pick<Modality, "slug" | "tier">): boolean {
  return lockReasonForModality(m) !== null;
}

export const LANE_BY_ID: Record<Lane, LaneMeta> = LANES.reduce((acc, l) => {
  acc[l.id] = l;
  return acc;
}, {} as Record<Lane, LaneMeta>);
