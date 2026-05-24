// Mirror of src/lib/modalities.ts — kept Deno-importable for edge functions.
// Source of truth remains the frontend file; only the lookup helpers used by
// the backend live here. The full DETECTABLE_CATALOG below is what we send
// to the AI for modality detection (3D-locked slugs are excluded).
export type Tier = "A" | "B" | "C";
export type Catalog = "nvidia_backed" | "research_assisted";
export type ModalityCategory =
  | "X-Ray" | "CT" | "MRI" | "Ultrasound" | "ECG"
  | "Pathology" | "Photo" | "Video" | "Nuclear";

export interface BackendModality {
  slug: string;
  label: string;
  category: ModalityCategory;
  tier: Tier;
  catalog: Catalog;
}

const NVIDIA_TIER_A = new Set<string>([
  "xray_chest_pa", "xray_chest_lat", "xray_chest_ap",
  "ct_lung_screen", "ct_chest_contrast", "ct_abdomen_pelvis",
  "mri_brain_t1", "mri_brain_t2", "mri_brain_flair",
  "mri_knee_sagittal", "mri_spine_lumbar",
]);

const NVIDIA_TIER_B = new Set<string>([
  "ct_brain_perfusion", "ct_angio_cardiac", "ct_angio_pulmonary",
  "mri_cardiac_cine", "mri_breast_dce", "mri_prostate_multiparametric",
  "mri_liver_elastography", "pet_ct_oncology", "pet_ct_cardiac",
  "spect_bone", "mra_brain", "cta_aorta", "ct_colonography",
]);

export function tierForSlug(slug: string): Tier {
  if (NVIDIA_TIER_A.has(slug)) return "A";
  if (NVIDIA_TIER_B.has(slug)) return "B";
  return "C";
}

export function catalogForSlug(slug: string): Catalog {
  return (NVIDIA_TIER_A.has(slug) || NVIDIA_TIER_B.has(slug))
    ? "nvidia_backed"
    : "research_assisted";
}

export function categoryFromSlug(slug: string): ModalityCategory {
  if (slug.startsWith("xray_")) return "X-Ray";
  if (slug.startsWith("ct_") || slug.startsWith("cta_")) return "CT";
  if (slug.startsWith("mri_") || slug.startsWith("mra_")) return "MRI";
  if (slug.startsWith("us_") || slug.startsWith("ultrasound_")) return "Ultrasound";
  if (slug.startsWith("ecg_") || slug.startsWith("ekg_")) return "ECG";
  if (slug.startsWith("path_") || slug.startsWith("pathology_")) return "Pathology";
  if (slug.startsWith("photo_") || slug.startsWith("derm_")) return "Photo";
  if (slug.startsWith("video_") || slug.startsWith("endo_")) return "Video";
  if (slug.startsWith("pet_") || slug.startsWith("spect_") || slug.startsWith("nuc_")) return "Nuclear";
  return "Photo";
}

// Full detectable catalog — 115 entries (all non-3D, non-live modalities).
// Auto-generated mirror of src/lib/modalities.ts. Keep in sync when adding
// new modalities to the frontend.
export const DETECTABLE_CATALOG: Array<{
  slug: string;
  label: string;
  category: ModalityCategory;
}> = [
  { slug: "xray_chest_pa", label: "Chest X-ray (PA View)", category: "X-Ray" },
  { slug: "xray_chest_lat", label: "Chest X-ray (Lateral)", category: "X-Ray" },
  { slug: "xray_chest_ap", label: "Chest X-ray (AP View)", category: "X-Ray" },
  { slug: "ct_lung_screen", label: "Lung CT Screening", category: "CT" },
  { slug: "ct_chest_contrast", label: "Chest CT (Contrast)", category: "CT" },
  { slug: "ct_abdomen_pelvis", label: "Abdomen & Pelvis CT", category: "CT" },
  { slug: "mri_brain_t1", label: "Brain MRI (T1)", category: "MRI" },
  { slug: "mri_brain_t2", label: "Brain MRI (T2)", category: "MRI" },
  { slug: "mri_brain_flair", label: "Brain MRI (FLAIR)", category: "MRI" },
  { slug: "mri_knee_sagittal", label: "Knee MRI (Sagittal)", category: "MRI" },
  { slug: "mri_spine_lumbar", label: "Lumbar Spine MRI", category: "MRI" },
  { slug: "xray_skull_ap", label: "Skull X-ray (AP)", category: "X-Ray" },
  { slug: "xray_skull_lat", label: "Skull X-ray (Lateral)", category: "X-Ray" },
  { slug: "xray_cervical_spine_ap", label: "Cervical Spine X-ray (AP)", category: "X-Ray" },
  { slug: "xray_cervical_spine_lat", label: "Cervical Spine X-ray (Lateral)", category: "X-Ray" },
  { slug: "xray_thoracic_spine_ap", label: "Thoracic Spine X-ray (AP)", category: "X-Ray" },
  { slug: "xray_lumbar_spine_ap", label: "Lumbar Spine X-ray (AP)", category: "X-Ray" },
  { slug: "xray_lumbar_spine_lat", label: "Lumbar Spine X-ray (Lateral)", category: "X-Ray" },
  { slug: "xray_pelvis_ap", label: "Pelvis X-ray (AP)", category: "X-Ray" },
  { slug: "xray_hip_ap", label: "Hip X-ray (AP)", category: "X-Ray" },
  { slug: "xray_shoulder_ap", label: "Shoulder X-ray (AP)", category: "X-Ray" },
  { slug: "xray_elbow_ap", label: "Elbow X-ray (AP)", category: "X-Ray" },
  { slug: "xray_wrist_pa", label: "Wrist X-ray (PA)", category: "X-Ray" },
  { slug: "xray_hand_pa", label: "Hand X-ray (PA)", category: "X-Ray" },
  { slug: "xray_knee_ap", label: "Knee X-ray (AP)", category: "X-Ray" },
  { slug: "xray_knee_lat", label: "Knee X-ray (Lateral)", category: "X-Ray" },
  { slug: "xray_ankle_ap", label: "Ankle X-ray (AP)", category: "X-Ray" },
  { slug: "xray_foot_oblique", label: "Foot X-ray (Oblique)", category: "X-Ray" },
  { slug: "xray_dental_panoramic", label: "Dental Panoramic X-ray", category: "X-Ray" },
  { slug: "ct_sinus_facial", label: "Sinus/Facial CT", category: "CT" },
  { slug: "ct_temporal_bone", label: "Temporal Bone CT", category: "CT" },
  { slug: "ct_orbits", label: "Orbits CT", category: "CT" },
  { slug: "ct_neck_soft_tissue", label: "Neck Soft Tissue CT", category: "CT" },
  { slug: "ct_thyroid", label: "Thyroid CT", category: "CT" },
  { slug: "ct_liver_triphasic", label: "Liver CT (Triphasic)", category: "CT" },
  { slug: "ct_pancreas", label: "Pancreas CT", category: "CT" },
  { slug: "ct_kidneys_renal", label: "Renal CT", category: "CT" },
  { slug: "ct_adrenals", label: "Adrenal CT", category: "CT" },
  { slug: "ct_spleen", label: "Spleen CT", category: "CT" },
  { slug: "ct_urography", label: "CT Urography", category: "CT" },
  { slug: "ct_enterography", label: "CT Enterography", category: "CT" },
  { slug: "ct_appendicitis", label: "Appendicitis CT", category: "CT" },
  { slug: "ct_renal_collic", label: "Renal Collic CT", category: "CT" },
  { slug: "ct_trauma_pan_scan", label: "Trauma Pan-Scan CT", category: "CT" },
  { slug: "ct_virtual_bronchoscopy", label: "Virtual Bronchoscopy CT", category: "CT" },
  { slug: "mri_orbits", label: "Orbits MRI", category: "MRI" },
  { slug: "mri_pituitary", label: "Pituitary MRI", category: "MRI" },
  { slug: "mri_iac", label: "Internal Auditory Canal MRI", category: "MRI" },
  { slug: "mri_nasopharynx", label: "Nasopharynx MRI", category: "MRI" },
  { slug: "mri_salivary_glands", label: "Salivary Glands MRI", category: "MRI" },
  { slug: "mri_brain_perfusion", label: "Brain Perfusion MRI", category: "MRI" },
  { slug: "mri_brain_spectroscopy", label: "MR Spectroscopy", category: "MRI" },
  { slug: "mri_brain_funct", label: "Functional MRI (fMRI)", category: "MRI" },
  { slug: "mri_brain_tract", label: "Tractography MRI", category: "MRI" },
  { slug: "mri_cervical_spine", label: "Cervical Spine MRI", category: "MRI" },
  { slug: "mri_thoracic_spine", label: "Thoracic Spine MRI", category: "MRI" },
  { slug: "mri_sacrum_coccyx", label: "Sacrum & Coccyx MRI", category: "MRI" },
  { slug: "mri_shoulder", label: "Shoulder MRI", category: "MRI" },
  { slug: "mri_elbow", label: "Elbow MRI", category: "MRI" },
  { slug: "mri_wrist", label: "Wrist MRI", category: "MRI" },
  { slug: "mri_hand", label: "Hand MRI", category: "MRI" },
  { slug: "mri_ankle", label: "Ankle MRI", category: "MRI" },
  { slug: "mri_foot", label: "Foot MRI", category: "MRI" },
  { slug: "mri_temporomandibular", label: "TMJ MRI", category: "MRI" },
  { slug: "mri_brachial_plexus", label: "Brachial Plexus MRI", category: "MRI" },
  { slug: "us_abdomen_complete", label: "Abdominal Ultrasound (Complete)", category: "Ultrasound" },
  { slug: "us_abdomen_limited", label: "Abdominal Ultrasound (Limited)", category: "Ultrasound" },
  { slug: "us_pelvis_transabdominal", label: "Pelvic Ultrasound (Transabdominal)", category: "Ultrasound" },
  { slug: "us_pelvis_transvaginal", label: "Pelvic Ultrasound (Transvaginal)", category: "Ultrasound" },
  { slug: "us_renal", label: "Renal Ultrasound", category: "Ultrasound" },
  { slug: "us_scrotal", label: "Scrotal Ultrasound", category: "Ultrasound" },
  { slug: "us_thyroid", label: "Thyroid Ultrasound", category: "Ultrasound" },
  { slug: "us_carotid_doppler", label: "Carotid Doppler Ultrasound", category: "Ultrasound" },
  { slug: "us_venous_doppler_le", label: "Venous Doppler (Lower Extremity)", category: "Ultrasound" },
  { slug: "us_arterial_doppler_le", label: "Arterial Doppler (Lower Extremity)", category: "Ultrasound" },
  { slug: "us_breast", label: "Breast Ultrasound", category: "Ultrasound" },
  { slug: "us_musculoskeletal", label: "Musculoskeletal Ultrasound", category: "Ultrasound" },
  { slug: "us_ocular_b_scan", label: "Ocular B-Scan Ultrasound", category: "Ultrasound" },
  { slug: "us_neonatal_brain", label: "Neonatal Brain Ultrasound", category: "Ultrasound" },
  { slug: "ecg_12_lead_standard", label: "12-Lead ECG (Standard)", category: "ECG" },
  { slug: "ecg_12_lead_stress", label: "12-Lead ECG (Stress Test)", category: "ECG" },
  { slug: "ecg_holter_24h", label: "24-Hour Holter Monitor", category: "ECG" },
  { slug: "ecg_holter_48h", label: "48-Hour Holter Monitor", category: "ECG" },
  { slug: "ecg_event_monitor", label: "Event Monitor ECG", category: "ECG" },
  { slug: "ecg_pediatric", label: "Pediatric ECG", category: "ECG" },
  { slug: "pathology_wsi_skin", label: "Skin Histopathology (WSI)", category: "Pathology" },
  { slug: "pathology_wsi_breast", label: "Breast Histopathology (WSI)", category: "Pathology" },
  { slug: "pathology_wsi_prostate", label: "Prostate Histopathology (WSI)", category: "Pathology" },
  { slug: "pathology_wsi_colon", label: "Colon Histopathology (WSI)", category: "Pathology" },
  { slug: "pathology_wsi_lung", label: "Lung Histopathology (WSI)", category: "Pathology" },
  { slug: "pathology_wsi_liver", label: "Liver Histopathology (WSI)", category: "Pathology" },
  { slug: "pathology_wsi_lymph_node", label: "Lymph Node Histopathology (WSI)", category: "Pathology" },
  { slug: "pathology_cytopathology", label: "Cytopathology (WSI)", category: "Pathology" },
  { slug: "photo_derm_skin_lesion", label: "Skin Lesion Photography", category: "Photo" },
  { slug: "photo_derm_mole_mapping", label: "Mole Mapping Photography", category: "Photo" },
  { slug: "photo_derm_hair_disorders", label: "Hair Disorder Photography", category: "Photo" },
  { slug: "photo_derm_nail_disorders", label: "Nail Disorder Photography", category: "Photo" },
  { slug: "photo_wound_documentation", label: "Wound Documentation", category: "Photo" },
  { slug: "photo_burn_assessment", label: "Burn Assessment Photography", category: "Photo" },
  { slug: "photo_eye_anterior_segment", label: "Anterior Segment Eye Photo", category: "Photo" },
  { slug: "photo_eye_fundus", label: "Fundus Photography", category: "Photo" },
  { slug: "video_endoscopy_gi_upper", label: "Upper GI Endoscopy", category: "Video" },
  { slug: "video_endoscopy_gi_lower", label: "Lower GI Endoscopy", category: "Video" },
  { slug: "video_endoscopy_bronchoscopy", label: "Bronchoscopy", category: "Video" },
  { slug: "video_endoscopy_cystoscopy", label: "Cystoscopy", category: "Video" },
  { slug: "video_endoscopy_hysteroscopy", label: "Hysteroscopy", category: "Video" },
  { slug: "video_endoscopy_laparoscopy", label: "Laparoscopy", category: "Video" },
  { slug: "video_endoscopy_arthroscopy", label: "Arthroscopy", category: "Video" },
  { slug: "video_capsule_endoscopy", label: "Capsule Endoscopy", category: "Video" },
  { slug: "nuc_medicine_thyroid_uptake", label: "Thyroid Uptake Scan", category: "Nuclear" },
  { slug: "nuc_medicine_parathyroid", label: "Parathyroid Scan", category: "Nuclear" },
  { slug: "nuc_medicine_renal_dmsa", label: "Renal DMSA Scan", category: "Nuclear" },
  { slug: "nuc_medicine_renal_mag3", label: "Renal MAG3 Scan", category: "Nuclear" },
  { slug: "nuc_medicine_hepatobiliary", label: "Hepatobiliary Scan (HIDA)", category: "Nuclear" },
  { slug: "nuc_medicine_white_blood_cell", label: "WBC Scan (Infection)", category: "Nuclear" },
];

export const DETECTABLE_SLUGS: Set<string> = new Set(
  DETECTABLE_CATALOG.map((m) => m.slug),
);

export function findCatalogEntry(slug: string) {
  return DETECTABLE_CATALOG.find((m) => m.slug === slug) ?? null;
}
