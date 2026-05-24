import type { Modality } from "./types";
import { HYBRID_MODALITIES } from "./hybridSpecialties";

// ============================================================================
// 128 MODALITY CATALOG (+ 13 Hybrid live-capture presets)
// 24 NVIDIA-Backed (Tier A: 11, Tier B: 13) + 104 Research-Assisted (Tier C)
// + 13 Hybrid NVIDIA + Quaasx108 (Tier H, real-time live capture)
// ============================================================================

const BASE_MODALITIES: Modality[] = [
  // ── NVIDIA-Backed Tier A (11) ─────────────────────────────────────────────
  { slug: "xray_chest_pa", label: "Chest X-ray (PA View)", category: "X-Ray", tier: "A", catalog: "nvidia_backed", blurb: "Posteroanterior chest radiograph" },
  { slug: "xray_chest_lat", label: "Chest X-ray (Lateral)", category: "X-Ray", tier: "A", catalog: "nvidia_backed", blurb: "Lateral chest radiograph" },
  { slug: "xray_chest_ap", label: "Chest X-ray (AP View)", category: "X-Ray", tier: "A", catalog: "nvidia_backed", blurb: "Anteroposterior chest radiograph" },
  { slug: "ct_lung_screen", label: "Lung CT Screening", category: "CT", tier: "A", catalog: "nvidia_backed", blurb: "Low-dose lung cancer screening" },
  { slug: "ct_chest_contrast", label: "Chest CT (Contrast)", category: "CT", tier: "A", catalog: "nvidia_backed" },
  { slug: "ct_abdomen_pelvis", label: "Abdomen & Pelvis CT", category: "CT", tier: "A", catalog: "nvidia_backed" },
  { slug: "mri_brain_t1", label: "Brain MRI (T1)", category: "MRI", tier: "A", catalog: "nvidia_backed" },
  { slug: "mri_brain_t2", label: "Brain MRI (T2)", category: "MRI", tier: "A", catalog: "nvidia_backed" },
  { slug: "mri_brain_flair", label: "Brain MRI (FLAIR)", category: "MRI", tier: "A", catalog: "nvidia_backed" },
  { slug: "mri_knee_sagittal", label: "Knee MRI (Sagittal)", category: "MRI", tier: "A", catalog: "nvidia_backed" },
  { slug: "mri_spine_lumbar", label: "Lumbar Spine MRI", category: "MRI", tier: "A", catalog: "nvidia_backed" },

  // ── NVIDIA-Backed Tier B (13) — 3D volumetric ────────────────────────────
  { slug: "ct_brain_perfusion", label: "Brain CT Perfusion", category: "CT", tier: "B", catalog: "nvidia_backed", blurb: "Volumetric perfusion mapping" },
  { slug: "ct_angio_cardiac", label: "Cardiac CT Angiography", category: "CT", tier: "B", catalog: "nvidia_backed" },
  { slug: "ct_angio_pulmonary", label: "Pulmonary CT Angiography", category: "CT", tier: "B", catalog: "nvidia_backed" },
  { slug: "mri_cardiac_cine", label: "Cardiac MRI (Cine)", category: "MRI", tier: "B", catalog: "nvidia_backed" },
  { slug: "mri_breast_dce", label: "Breast MRI (DCE)", category: "MRI", tier: "B", catalog: "nvidia_backed" },
  { slug: "mri_prostate_multiparametric", label: "Prostate MRI (Multiparametric)", category: "MRI", tier: "B", catalog: "nvidia_backed" },
  { slug: "mri_liver_elastography", label: "Liver MRI Elastography", category: "MRI", tier: "B", catalog: "nvidia_backed" },
  { slug: "pet_ct_oncology", label: "PET-CT (Oncology)", category: "Nuclear", tier: "B", catalog: "nvidia_backed" },
  { slug: "pet_ct_cardiac", label: "PET-CT (Cardiac)", category: "Nuclear", tier: "B", catalog: "nvidia_backed" },
  { slug: "spect_bone", label: "Bone SPECT", category: "Nuclear", tier: "B", catalog: "nvidia_backed" },
  { slug: "mra_brain", label: "Brain MRA", category: "MRI", tier: "B", catalog: "nvidia_backed" },
  { slug: "cta_aorta", label: "Aortic CTA", category: "CT", tier: "B", catalog: "nvidia_backed" },
  { slug: "ct_colonography", label: "CT Colonography", category: "CT", tier: "B", catalog: "nvidia_backed" },

  // ── Research-Assisted Tier C — X-Ray (18) ────────────────────────────────
  { slug: "xray_skull_ap", label: "Skull X-ray (AP)", category: "X-Ray", tier: "C", catalog: "research_assisted" },
  { slug: "xray_skull_lat", label: "Skull X-ray (Lateral)", category: "X-Ray", tier: "C", catalog: "research_assisted" },
  { slug: "xray_cervical_spine_ap", label: "Cervical Spine X-ray (AP)", category: "X-Ray", tier: "C", catalog: "research_assisted" },
  { slug: "xray_cervical_spine_lat", label: "Cervical Spine X-ray (Lateral)", category: "X-Ray", tier: "C", catalog: "research_assisted" },
  { slug: "xray_thoracic_spine_ap", label: "Thoracic Spine X-ray (AP)", category: "X-Ray", tier: "C", catalog: "research_assisted" },
  { slug: "xray_lumbar_spine_ap", label: "Lumbar Spine X-ray (AP)", category: "X-Ray", tier: "C", catalog: "research_assisted" },
  { slug: "xray_lumbar_spine_lat", label: "Lumbar Spine X-ray (Lateral)", category: "X-Ray", tier: "C", catalog: "research_assisted" },
  { slug: "xray_pelvis_ap", label: "Pelvis X-ray (AP)", category: "X-Ray", tier: "C", catalog: "research_assisted" },
  { slug: "xray_hip_ap", label: "Hip X-ray (AP)", category: "X-Ray", tier: "C", catalog: "research_assisted" },
  { slug: "xray_shoulder_ap", label: "Shoulder X-ray (AP)", category: "X-Ray", tier: "C", catalog: "research_assisted" },
  { slug: "xray_elbow_ap", label: "Elbow X-ray (AP)", category: "X-Ray", tier: "C", catalog: "research_assisted" },
  { slug: "xray_wrist_pa", label: "Wrist X-ray (PA)", category: "X-Ray", tier: "C", catalog: "research_assisted" },
  { slug: "xray_hand_pa", label: "Hand X-ray (PA)", category: "X-Ray", tier: "C", catalog: "research_assisted" },
  { slug: "xray_knee_ap", label: "Knee X-ray (AP)", category: "X-Ray", tier: "C", catalog: "research_assisted" },
  { slug: "xray_knee_lat", label: "Knee X-ray (Lateral)", category: "X-Ray", tier: "C", catalog: "research_assisted" },
  { slug: "xray_ankle_ap", label: "Ankle X-ray (AP)", category: "X-Ray", tier: "C", catalog: "research_assisted" },
  { slug: "xray_foot_oblique", label: "Foot X-ray (Oblique)", category: "X-Ray", tier: "C", catalog: "research_assisted" },
  { slug: "xray_dental_panoramic", label: "Dental Panoramic X-ray", category: "X-Ray", tier: "C", catalog: "research_assisted" },

  // ── Tier C — CT (16) ──────────────────────────────────────────────────────
  { slug: "ct_sinus_facial", label: "Sinus/Facial CT", category: "CT", tier: "C", catalog: "research_assisted" },
  { slug: "ct_temporal_bone", label: "Temporal Bone CT", category: "CT", tier: "C", catalog: "research_assisted" },
  { slug: "ct_orbits", label: "Orbits CT", category: "CT", tier: "C", catalog: "research_assisted" },
  { slug: "ct_neck_soft_tissue", label: "Neck Soft Tissue CT", category: "CT", tier: "C", catalog: "research_assisted" },
  { slug: "ct_thyroid", label: "Thyroid CT", category: "CT", tier: "C", catalog: "research_assisted" },
  { slug: "ct_liver_triphasic", label: "Liver CT (Triphasic)", category: "CT", tier: "C", catalog: "research_assisted" },
  { slug: "ct_pancreas", label: "Pancreas CT", category: "CT", tier: "C", catalog: "research_assisted" },
  { slug: "ct_kidneys_renal", label: "Renal CT", category: "CT", tier: "C", catalog: "research_assisted" },
  { slug: "ct_adrenals", label: "Adrenal CT", category: "CT", tier: "C", catalog: "research_assisted" },
  { slug: "ct_spleen", label: "Spleen CT", category: "CT", tier: "C", catalog: "research_assisted" },
  { slug: "ct_urography", label: "CT Urography", category: "CT", tier: "C", catalog: "research_assisted" },
  { slug: "ct_enterography", label: "CT Enterography", category: "CT", tier: "C", catalog: "research_assisted" },
  { slug: "ct_appendicitis", label: "Appendicitis CT", category: "CT", tier: "C", catalog: "research_assisted" },
  { slug: "ct_renal_collic", label: "Renal Collic CT", category: "CT", tier: "C", catalog: "research_assisted" },
  { slug: "ct_trauma_pan_scan", label: "Trauma Pan-Scan CT", category: "CT", tier: "C", catalog: "research_assisted" },
  { slug: "ct_virtual_bronchoscopy", label: "Virtual Bronchoscopy CT", category: "CT", tier: "C", catalog: "research_assisted" },

  // ── Tier C — MRI (20) ─────────────────────────────────────────────────────
  { slug: "mri_orbits", label: "Orbits MRI", category: "MRI", tier: "C", catalog: "research_assisted" },
  { slug: "mri_pituitary", label: "Pituitary MRI", category: "MRI", tier: "C", catalog: "research_assisted" },
  { slug: "mri_iac", label: "Internal Auditory Canal MRI", category: "MRI", tier: "C", catalog: "research_assisted" },
  { slug: "mri_nasopharynx", label: "Nasopharynx MRI", category: "MRI", tier: "C", catalog: "research_assisted" },
  { slug: "mri_salivary_glands", label: "Salivary Glands MRI", category: "MRI", tier: "C", catalog: "research_assisted" },
  { slug: "mri_brain_perfusion", label: "Brain Perfusion MRI", category: "MRI", tier: "C", catalog: "research_assisted" },
  { slug: "mri_brain_spectroscopy", label: "MR Spectroscopy", category: "MRI", tier: "C", catalog: "research_assisted" },
  { slug: "mri_brain_funct", label: "Functional MRI (fMRI)", category: "MRI", tier: "C", catalog: "research_assisted" },
  { slug: "mri_brain_tract", label: "Tractography MRI", category: "MRI", tier: "C", catalog: "research_assisted" },
  { slug: "mri_cervical_spine", label: "Cervical Spine MRI", category: "MRI", tier: "C", catalog: "research_assisted" },
  { slug: "mri_thoracic_spine", label: "Thoracic Spine MRI", category: "MRI", tier: "C", catalog: "research_assisted" },
  { slug: "mri_sacrum_coccyx", label: "Sacrum & Coccyx MRI", category: "MRI", tier: "C", catalog: "research_assisted" },
  { slug: "mri_shoulder", label: "Shoulder MRI", category: "MRI", tier: "C", catalog: "research_assisted" },
  { slug: "mri_elbow", label: "Elbow MRI", category: "MRI", tier: "C", catalog: "research_assisted" },
  { slug: "mri_wrist", label: "Wrist MRI", category: "MRI", tier: "C", catalog: "research_assisted" },
  { slug: "mri_hand", label: "Hand MRI", category: "MRI", tier: "C", catalog: "research_assisted" },
  { slug: "mri_ankle", label: "Ankle MRI", category: "MRI", tier: "C", catalog: "research_assisted" },
  { slug: "mri_foot", label: "Foot MRI", category: "MRI", tier: "C", catalog: "research_assisted" },
  { slug: "mri_temporomandibular", label: "TMJ MRI", category: "MRI", tier: "C", catalog: "research_assisted" },
  { slug: "mri_brachial_plexus", label: "Brachial Plexus MRI", category: "MRI", tier: "C", catalog: "research_assisted" },

  // ── Tier C — Ultrasound (14) ──────────────────────────────────────────────
  { slug: "us_abdomen_complete", label: "Abdominal Ultrasound (Complete)", category: "Ultrasound", tier: "C", catalog: "research_assisted" },
  { slug: "us_abdomen_limited", label: "Abdominal Ultrasound (Limited)", category: "Ultrasound", tier: "C", catalog: "research_assisted" },
  { slug: "us_pelvis_transabdominal", label: "Pelvic Ultrasound (Transabdominal)", category: "Ultrasound", tier: "C", catalog: "research_assisted" },
  { slug: "us_pelvis_transvaginal", label: "Pelvic Ultrasound (Transvaginal)", category: "Ultrasound", tier: "C", catalog: "research_assisted" },
  { slug: "us_renal", label: "Renal Ultrasound", category: "Ultrasound", tier: "C", catalog: "research_assisted" },
  { slug: "us_scrotal", label: "Scrotal Ultrasound", category: "Ultrasound", tier: "C", catalog: "research_assisted" },
  { slug: "us_thyroid", label: "Thyroid Ultrasound", category: "Ultrasound", tier: "C", catalog: "research_assisted" },
  { slug: "us_carotid_doppler", label: "Carotid Doppler Ultrasound", category: "Ultrasound", tier: "C", catalog: "research_assisted" },
  { slug: "us_venous_doppler_le", label: "Venous Doppler (Lower Extremity)", category: "Ultrasound", tier: "C", catalog: "research_assisted" },
  { slug: "us_arterial_doppler_le", label: "Arterial Doppler (Lower Extremity)", category: "Ultrasound", tier: "C", catalog: "research_assisted" },
  { slug: "us_breast", label: "Breast Ultrasound", category: "Ultrasound", tier: "C", catalog: "research_assisted" },
  { slug: "us_musculoskeletal", label: "Musculoskeletal Ultrasound", category: "Ultrasound", tier: "C", catalog: "research_assisted" },
  { slug: "us_ocular_b_scan", label: "Ocular B-Scan Ultrasound", category: "Ultrasound", tier: "C", catalog: "research_assisted" },
  { slug: "us_neonatal_brain", label: "Neonatal Brain Ultrasound", category: "Ultrasound", tier: "C", catalog: "research_assisted" },

  // ── Tier C — ECG (6) ──────────────────────────────────────────────────────
  { slug: "ecg_12_lead_standard", label: "12-Lead ECG (Standard)", category: "ECG", tier: "C", catalog: "research_assisted" },
  { slug: "ecg_12_lead_stress", label: "12-Lead ECG (Stress Test)", category: "ECG", tier: "C", catalog: "research_assisted" },
  { slug: "ecg_holter_24h", label: "24-Hour Holter Monitor", category: "ECG", tier: "C", catalog: "research_assisted" },
  { slug: "ecg_holter_48h", label: "48-Hour Holter Monitor", category: "ECG", tier: "C", catalog: "research_assisted" },
  { slug: "ecg_event_monitor", label: "Event Monitor ECG", category: "ECG", tier: "C", catalog: "research_assisted" },
  { slug: "ecg_pediatric", label: "Pediatric ECG", category: "ECG", tier: "C", catalog: "research_assisted" },

  // ── Tier C — Pathology (8) ────────────────────────────────────────────────
  { slug: "pathology_wsi_skin", label: "Skin Histopathology (WSI)", category: "Pathology", tier: "C", catalog: "research_assisted" },
  { slug: "pathology_wsi_breast", label: "Breast Histopathology (WSI)", category: "Pathology", tier: "C", catalog: "research_assisted" },
  { slug: "pathology_wsi_prostate", label: "Prostate Histopathology (WSI)", category: "Pathology", tier: "C", catalog: "research_assisted" },
  { slug: "pathology_wsi_colon", label: "Colon Histopathology (WSI)", category: "Pathology", tier: "C", catalog: "research_assisted" },
  { slug: "pathology_wsi_lung", label: "Lung Histopathology (WSI)", category: "Pathology", tier: "C", catalog: "research_assisted" },
  { slug: "pathology_wsi_liver", label: "Liver Histopathology (WSI)", category: "Pathology", tier: "C", catalog: "research_assisted" },
  { slug: "pathology_wsi_lymph_node", label: "Lymph Node Histopathology (WSI)", category: "Pathology", tier: "C", catalog: "research_assisted" },
  { slug: "pathology_cytopathology", label: "Cytopathology (WSI)", category: "Pathology", tier: "C", catalog: "research_assisted" },

  // ── Tier C — Photo / Dermatology (8) ──────────────────────────────────────
  { slug: "photo_derm_skin_lesion", label: "Skin Lesion Photography", category: "Photo", tier: "C", catalog: "research_assisted" },
  { slug: "photo_derm_mole_mapping", label: "Mole Mapping Photography", category: "Photo", tier: "C", catalog: "research_assisted" },
  { slug: "photo_derm_hair_disorders", label: "Hair Disorder Photography", category: "Photo", tier: "C", catalog: "research_assisted" },
  { slug: "photo_derm_nail_disorders", label: "Nail Disorder Photography", category: "Photo", tier: "C", catalog: "research_assisted" },
  { slug: "photo_wound_documentation", label: "Wound Documentation", category: "Photo", tier: "C", catalog: "research_assisted" },
  { slug: "photo_burn_assessment", label: "Burn Assessment Photography", category: "Photo", tier: "C", catalog: "research_assisted" },
  { slug: "photo_eye_anterior_segment", label: "Anterior Segment Eye Photo", category: "Photo", tier: "C", catalog: "research_assisted" },
  { slug: "photo_eye_fundus", label: "Fundus Photography", category: "Photo", tier: "C", catalog: "research_assisted" },

  // ── Tier C — Video / Endoscopy (8) ────────────────────────────────────────
  { slug: "video_endoscopy_gi_upper", label: "Upper GI Endoscopy", category: "Video", tier: "C", catalog: "research_assisted" },
  { slug: "video_endoscopy_gi_lower", label: "Lower GI Endoscopy", category: "Video", tier: "C", catalog: "research_assisted" },
  { slug: "video_endoscopy_bronchoscopy", label: "Bronchoscopy", category: "Video", tier: "C", catalog: "research_assisted" },
  { slug: "video_endoscopy_cystoscopy", label: "Cystoscopy", category: "Video", tier: "C", catalog: "research_assisted" },
  { slug: "video_endoscopy_hysteroscopy", label: "Hysteroscopy", category: "Video", tier: "C", catalog: "research_assisted" },
  { slug: "video_endoscopy_laparoscopy", label: "Laparoscopy", category: "Video", tier: "C", catalog: "research_assisted" },
  { slug: "video_endoscopy_arthroscopy", label: "Arthroscopy", category: "Video", tier: "C", catalog: "research_assisted" },
  { slug: "video_capsule_endoscopy", label: "Capsule Endoscopy", category: "Video", tier: "C", catalog: "research_assisted" },

  // ── Tier C — Nuclear (6) ──────────────────────────────────────────────────
  { slug: "nuc_medicine_thyroid_uptake", label: "Thyroid Uptake Scan", category: "Nuclear", tier: "C", catalog: "research_assisted" },
  { slug: "nuc_medicine_parathyroid", label: "Parathyroid Scan", category: "Nuclear", tier: "C", catalog: "research_assisted" },
  { slug: "nuc_medicine_renal_dmsa", label: "Renal DMSA Scan", category: "Nuclear", tier: "C", catalog: "research_assisted" },
  { slug: "nuc_medicine_renal_mag3", label: "Renal MAG3 Scan", category: "Nuclear", tier: "C", catalog: "research_assisted" },
  { slug: "nuc_medicine_hepatobiliary", label: "Hepatobiliary Scan (HIDA)", category: "Nuclear", tier: "C", catalog: "research_assisted" },
  { slug: "nuc_medicine_white_blood_cell", label: "WBC Scan (Infection)", category: "Nuclear", tier: "C", catalog: "research_assisted" },
];

export const MODALITIES: Modality[] = [...BASE_MODALITIES, ...HYBRID_MODALITIES];

export const CATEGORIES = [
  "X-Ray",
  "CT",
  "MRI",
  "Ultrasound",
  "ECG",
  "Pathology",
  "Photo",
  "Video",
  "Nuclear",
] as const;

export const findModality = (slug: string) => MODALITIES.find((m) => m.slug === slug);

export const tierMeta = {
  A: { catalog: "nvidia_backed", label: "NVIDIA-Backed · Tier A", short: "NVIDIA-Backed" },
  B: { catalog: "nvidia_backed", label: "NVIDIA-Backed · Tier B (3D)", short: "NVIDIA-Backed" },
  C: { catalog: "research_assisted", label: "Research-Assisted", short: "Research-Assisted" },
  H: { catalog: "hybrid_nvidia_quaasx108", label: "Hybrid · NVIDIA + Quaasx108", short: "Hybrid Live" },
} as const;
