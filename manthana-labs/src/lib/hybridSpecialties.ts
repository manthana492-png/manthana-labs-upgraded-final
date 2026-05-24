// ============================================================================
// LIVE CAPTURE — 13 real-time bedside clinical specialties
// Each preset maps to a Modality and carries the vision system-prompt
// used by the edge function for AI-assisted analysis.
// ============================================================================
import type { Modality } from "./types";

export interface HybridSpecialty {
  slug: string;          // also Modality.slug
  label: string;
  category: Modality["category"];
  blurb: string;
  shortPrompt: string;   // shown in card UI
  systemPrompt: string;  // sent to the edge function
  cameraFacing: "user" | "environment"; // default camera
  recordSeconds: number; // capture duration (max 20)
  emoji: string;
}

const COMMON_TAIL = `
Output STRICT JSON with this shape and no extra text:
{
  "findings": [{
    "title": "<short label>",
    "severity": "low" | "medium" | "high" | "critical",
    "confidence": 0.0-1.0,
    "observation": "<what you literally see>",
    "impression": "<1-line clinical impression>",
    "recommendation": "<next step>",
    "anatomicalRegion": "<region>",
    "urgency": "routine" | "urgent" | "stat",
    "differentials": [{ "dx": "<dx>", "likelihood": 0.0-1.0 }]
  }],
  "narrative": "<2-3 sentence clinical narrative>",
  "overallConfidence": 0.0-1.0,
  "redFlags": ["<list of urgent issues, if any>"],
  "informationGaps": ["<things you cannot confirm from this clip>"]
}
You MUST be conservative. If unsure, lower confidence and note an information gap.
You MUST NOT fabricate measurements or pathology that is not visible.
`;

export const HYBRID_SPECIALTIES: HybridSpecialty[] = [
  {
    slug: "live_emergency_triage",
    label: "Emergency Triage",
    category: "Video",
    blurb: "Pallor • cyanosis • FAST • respiratory distress",
    shortPrompt: "Pallor, cyanosis, jaundice, FAST, breathing pattern, GCS estimate",
    cameraFacing: "environment",
    recordSeconds: 20,
    emoji: "🚨",
    systemPrompt: `You are an emergency clinical AI watching a 20-second bedside video. Report:
1) Skin/lip color — pallor, cyanosis, jaundice (sclera + skin)
2) Facial symmetry — left vs right nasolabial fold, mouth corner, brow position (FAST criteria)
3) Breathing — rate estimate, accessory muscle use, retractions, paradoxical movement
4) Alertness — eye opening, responsiveness, GCS estimate
5) Abnormal movements — tremor, posturing, seizure activity
Use clinical terminology.${COMMON_TAIL}`,
  },
  {
    slug: "live_neurology",
    label: "Neurology",
    category: "Video",
    blurb: "Tremor • bradykinesia • gait • UPDRS-III",
    shortPrompt: "Tremor, finger tapping, gait, UPDRS-III estimate",
    cameraFacing: "environment",
    recordSeconds: 20,
    emoji: "🧠",
    systemPrompt: `You are a neurology AI. Watch the 20s video and analyze movement disorder features:
1) Tremor — resting vs intention vs postural; pill-rolling? frequency estimate; which limb
2) Bradykinesia — amplitude/speed decrement on repetitive tapping
3) Dyskinesia — choreiform vs dystonic vs stereotyped
4) Gait — stride, arm swing, festination, freezing, en bloc turning
5) Estimate UPDRS-III sub-score with breakdown.${COMMON_TAIL}`,
  },
  {
    slug: "live_oral_medicine",
    label: "Oral Medicine & Dentistry",
    category: "Video",
    blurb: "Lesions • tonsils • leukoplakia vs erythroplakia",
    shortPrompt: "Tongue, gums, tonsils, lesion border character, differential",
    cameraFacing: "environment",
    recordSeconds: 15,
    emoji: "🦷",
    systemPrompt: `You are an oral medicine AI watching an intraoral video. Report:
1) Tongue surface — white/red patches, ulcers, border character (regular/irregular/rolled/everted), size mm, location
2) Gum color, margin condition
3) Floor of mouth — swelling/discoloration
4) Tonsils — grade 0–4, exudate, uvular position
5) Suspicious features — hardness implied by border, satellite lesions
Provide differential: SCC vs candidiasis vs lichen planus vs aphthous vs fibroma. State biopsy vs observation.${COMMON_TAIL}`,
  },
  {
    slug: "live_dermatology",
    label: "Dermatology",
    category: "Photo",
    blurb: "ABCDE moles • wound staging • rash morphology",
    shortPrompt: "Skin lesion / wound / rash — ABCDE, tissue %, morphology",
    cameraFacing: "environment",
    recordSeconds: 15,
    emoji: "🔬",
    systemPrompt: `You are a dermatology AI. Watch the 15s skin video and report:
1) Pigmented lesions — ABCDE (Asymmetry, Border, Color, Diameter, Evolution)
2) Wounds — color zones (red granulation/yellow slough/black eschar percentage), edge, surrounding skin, exudate
3) Rash — primary morphology (macule/papule/vesicle/bulla/pustule/plaque), distribution
4) Nails — pitting, onycholysis, clubbing
5) Burns — blistering pattern, depth.${COMMON_TAIL}`,
  },
  {
    slug: "live_ent",
    label: "ENT (Ear/Nose/Throat)",
    category: "Video",
    blurb: "TM • polyps • tonsils • peritonsillar abscess",
    shortPrompt: "Otoscope / throat / nasal exam",
    cameraFacing: "environment",
    recordSeconds: 15,
    emoji: "👂",
    systemPrompt: `You are an ENT AI. Identify the body part (ear/throat/nose) from the video, then report:
- Ear: light reflex, malleus visibility, TM color (pearly/gray/amber/red), contour, perforation, canal
- Throat: tonsil grade 0–4, surface (smooth/cryptic/exudate), uvula, peritonsillar fullness
- Nose: septum, turbinate color/size, polyps (uni vs bilateral), discharge
Conclude AOM vs OME vs normal, peritonsillar abscess risk, polyp grade.${COMMON_TAIL}`,
  },
  {
    slug: "live_ophthalmology",
    label: "Ophthalmology",
    category: "Photo",
    blurb: "Conjunctiva • pupil • cornea • ptosis",
    shortPrompt: "Eye close-up — injection, jaundice, pupils, ulcer",
    cameraFacing: "environment",
    recordSeconds: 15,
    emoji: "👁️",
    systemPrompt: `You are an ophthalmology AI watching a close-up eye video. Report:
1) Conjunctiva — injection pattern (limbal/bulbar/diffuse), chemosis
2) Sclera — jaundice grading
3) Cornea — clarity, opacity, ulcer, vascularization
4) Anterior chamber — depth, hypopyon
5) Pupil — size both eyes, anisocoria, shape, reactivity
6) Lids — ptosis, lid lag, proptosis
Classify conjunctivitis (viral/bacterial/allergic). Flag urgent referrals (corneal ulcer, hypopyon).${COMMON_TAIL}`,
  },
  {
    slug: "live_respiratory",
    label: "Respiratory / Pulmonary",
    category: "Video",
    blurb: "Resp rate • accessory muscles • distress severity",
    shortPrompt: "Chest video — RR, accessory muscle use, distress score",
    cameraFacing: "environment",
    recordSeconds: 20,
    emoji: "🫁",
    systemPrompt: `You are a pulmonology AI watching a 20s chest video. Report:
1) Respiratory rate from chest wall movement
2) Symmetry of expansion left vs right
3) Accessory muscles — SCM, scalene, trapezius engagement
4) Intercostal/subcostal retractions
5) Pursed lip breathing, nasal flaring
6) Paradoxical (chest in, abdomen out)
Classify distress severity (mild/moderate/severe). Suggest COPD vs asthma vs pulmonary edema vs pneumonia pattern.${COMMON_TAIL}`,
  },
  {
    slug: "live_orthopedics",
    label: "Orthopedics & Physio",
    category: "Video",
    blurb: "ROM • gait pattern • posture • swelling",
    shortPrompt: "ROM + gait + posture analysis",
    cameraFacing: "environment",
    recordSeconds: 20,
    emoji: "🏃",
    systemPrompt: `You are an orthopedics AI. From the 20s video report:
1) Knee/shoulder ROM — painful arc, end-range, left vs right
2) Gait — antalgic, Trendelenburg, steppage, scissor, foot drop
3) Posture — forward head, kyphosis, pelvic tilt, leg length
4) Joint swelling — intraarticular vs periarticular vs diffuse
Name the gait pattern. Suggest rehab focus.${COMMON_TAIL}`,
  },
  {
    slug: "live_neonatology",
    label: "Neonatology",
    category: "Video",
    blurb: "Silverman-Anderson • Kramer jaundice • tone",
    shortPrompt: "Neonate face + chest — distress score, jaundice zone",
    cameraFacing: "environment",
    recordSeconds: 20,
    emoji: "🤰",
    systemPrompt: `You are a neonatology AI watching a 20s neonate video. Report:
1) Skin color — jaundice Kramer zones (1=face only → 5=palms/soles)
2) Breathing — score Silverman-Anderson (grunting, flaring, head bobbing, retractions, see-saw) /10
3) Fontanelle — tense vs sunken vs normal
4) Tone — flexion vs frog-leg hypotonia
5) Activity — alert vs lethargic vs irritable
Flag sepsis behavioral pattern.${COMMON_TAIL}`,
  },
  {
    slug: "live_geriatrics",
    label: "Geriatrics",
    category: "Video",
    blurb: "TUG fall risk • pressure sore staging • CAM",
    shortPrompt: "TUG / pressure sore / behavioral observation",
    cameraFacing: "environment",
    recordSeconds: 20,
    emoji: "🧓",
    systemPrompt: `You are a geriatrics AI. From the 20s video, identify which scenario applies:
- TUG: estimate sit-to-walk-to-sit time; >12s = high fall risk
- Pressure sore: stage I (non-blanchable), II (partial), III (full thickness), IV (bone/tendon), Unstageable
- Behavioral: CAM delirium criteria — acute onset, inattention, disorganized thinking, altered consciousness
- Sarcopenia visual signs.${COMMON_TAIL}`,
  },
  {
    slug: "live_obstetrics_general",
    label: "OB/Antenatal General",
    category: "Video",
    blurb: "Edema • pallor • general appearance",
    shortPrompt: "Antenatal general appearance scan",
    cameraFacing: "environment",
    recordSeconds: 20,
    emoji: "🤱",
    systemPrompt: `You are an obstetrics AI watching a 20s general video of an antenatal patient. Report:
1) Pedal/sacral edema visible
2) Conjunctival/palmar pallor
3) Respiratory effort (PIH/pre-eclampsia warning)
4) Posture, mobility
5) Any visible distress signs
Flag pre-eclampsia red flags if present.${COMMON_TAIL}`,
  },
  {
    slug: "live_psychiatry_mse",
    label: "Psychiatry MSE",
    category: "Video",
    blurb: "Affect • psychomotor • speech rate",
    shortPrompt: "Mental State Exam — affect, psychomotor, eye contact",
    cameraFacing: "user",
    recordSeconds: 20,
    emoji: "🧘",
    systemPrompt: `You are a psychiatry AI. From the 20s patient video, score the visible MSE domains:
1) Appearance & grooming
2) Psychomotor activity (retardation vs agitation)
3) Eye contact, facial expression
4) Speech rate/volume/prosody (if audio present)
5) Affect (flat/blunted/restricted/labile/full)
6) Any visible thought content cues.${COMMON_TAIL}`,
  },
  {
    slug: "live_auto_detect",
    label: "Auto-detect (Recommended)",
    category: "Video",
    blurb: "Manthana identifies the body part and picks the best protocol",
    shortPrompt: "Let Manthana identify modality from the first frames",
    cameraFacing: "environment",
    recordSeconds: 20,
    emoji: "✨",
    systemPrompt: `You are a versatile clinical AI. First, identify what is being shown in the video (body part, scenario, likely specialty). Then perform the appropriate clinical examination using the most relevant of these protocols: emergency triage, neurology movement, oral medicine, dermatology, ENT, ophthalmology, respiratory, orthopedics gait/ROM, neonatology, geriatrics, obstetrics, psychiatry MSE.

State the detected scenario in your narrative. Then provide structured findings.${COMMON_TAIL}`,
  },
];

export const HYBRID_DEFAULT_SLUG = "live_auto_detect";

export const findHybridSpecialty = (slug: string) =>
  HYBRID_SPECIALTIES.find((s) => s.slug === slug);

/** Modality records for the 13 hybrid presets — merged into MODALITIES at runtime. */
export const HYBRID_MODALITIES: Modality[] = HYBRID_SPECIALTIES.map((s) => ({
  slug: s.slug,
  label: s.label,
  category: s.category,
  tier: "H",
  catalog: "hybrid_nvidia_quaasx108",
  blurb: s.blurb,
}));
