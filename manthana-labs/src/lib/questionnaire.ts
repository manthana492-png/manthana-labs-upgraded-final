import type { Question, Modality, Report, Severity, Finding } from "./types";

// Tier A+B questionnaires: 4-6 questions. Tier C: 6-8.
// We keep one base questionnaire per category and tag importance via `required`.
const baseClinical: Question[] = [
  {
    id: "indication",
    prompt: "What's the primary clinical indication for this study?",
    helper: "Brief — the suspected condition or symptom prompting imaging.",
    kind: "text",
    required: true,
  },
  {
    id: "duration",
    prompt: "How long has the patient experienced symptoms?",
    kind: "multi",
    required: true,
    options: [
      { value: "<24h", label: "Less than 24 hours" },
      { value: "1-7d", label: "1–7 days" },
      { value: "1-4w", label: "1–4 weeks" },
      { value: ">1m", label: "More than 1 month" },
    ],
  },
  {
    id: "age",
    prompt: "Patient age (years)?",
    kind: "number",
    required: true,
    min: 0,
    max: 120,
    unit: "yrs",
  },
  {
    id: "comorbid",
    prompt: "Any significant comorbidities to flag?",
    helper: "Diabetes, immunosuppression, malignancy, etc.",
    kind: "multi",
    options: [
      { value: "none", label: "None reported" },
      { value: "dm", label: "Diabetes" },
      { value: "htn", label: "Hypertension" },
      { value: "immuno", label: "Immunosuppression" },
      { value: "malignancy", label: "Active malignancy" },
      { value: "smoker", label: "Current/former smoker" },
    ],
  },
  {
    id: "prior",
    prompt: "Has the patient had prior imaging of this region?",
    kind: "yesno",
  },
  {
    id: "acute",
    prompt: "Are there any red-flag features (acute chest pain, focal deficit, trauma)?",
    kind: "yesno",
    required: true,
  },
];

const tierCExtras: Question[] = [
  {
    id: "consent",
    prompt: "Has explicit consent for AI-assisted research review been obtained?",
    helper: "Tier C uses research-assisted analysis and requires informed consent.",
    kind: "yesno",
    required: true,
  },
  {
    id: "context",
    prompt: "Any additional clinical context that may guide interpretation?",
    helper: "Optional but improves analysis quality.",
    kind: "text",
  },
];

export function buildQuestionnaire(modality: Modality): Question[] {
  if (modality.tier === "C") return [...baseClinical, ...tierCExtras];
  // Tier A+B → 5 questions
  return baseClinical.slice(0, 5);
}

// ─────────────── Mock report generator ───────────────
// Each entry below is structured the way a radiologist actually thinks:
// observation → impression → recommendation → ranked differentials
// with ICD-10 + SNOMED CT codes for downstream EHR / billing handoff.


type Seed = Omit<Finding, "id" | "severity" | "confidence"> & {
  baseSeverity: Severity;
};

const corpusByCategory: Record<string, Seed[]> = {
  "X-Ray": [
    {
      title: "No acute cardiopulmonary process",
      description: "Lung fields are clear bilaterally with no focal consolidation, pleural effusion, or pneumothorax. Cardiac silhouette is within normal limits.",
      region: "Lungs / Mediastinum",
      anatomicalRegion: "Bilateral lung fields",
      observation: "Clear bilateral lung fields. Cardiothoracic ratio < 0.5. Costophrenic angles sharp.",
      impression: "Negative chest radiograph.",
      recommendation: "No imaging follow-up required. Correlate clinically.",
      icd10Code: "Z01.6", icd10Label: "Encounter for radiological examination, not elsewhere classified",
      snomedCode: "168731009", snomedLabel: "Normal chest X-ray",
      urgency: "routine",
      baseSeverity: "low",
      differentials: [
        { dx: "Normal chest", likelihood: 0.92, supportingFeatures: ["Clear lung fields", "Normal cardiac silhouette"], opposingFeatures: [], icd10Code: "Z01.6" },
        { dx: "Early viral URI (radiographically silent)", likelihood: 0.05, supportingFeatures: ["Symptomatic patient"], opposingFeatures: ["No infiltrates"] },
      ],
    },
    {
      title: "Mild interstitial prominence",
      description: "Subtle bilateral lower-zone interstitial markings — could reflect early interstitial change or chronic small-airway disease.",
      region: "Bilateral lung bases",
      anatomicalRegion: "Bilateral lower zones",
      observation: "Reticular interstitial markings at bilateral lung bases. No alveolar opacity. No pleural effusion.",
      impression: "Mild bibasal interstitial prominence — non-specific.",
      recommendation: "Clinical correlation with smoking history, occupational exposure. HRCT if symptoms progress.",
      icd10Code: "J84.10", icd10Label: "Pulmonary fibrosis, unspecified",
      snomedCode: "51615001", snomedLabel: "Interstitial lung disease",
      urgency: "routine",
      baseSeverity: "medium",
      differentials: [
        { dx: "Chronic small-airway disease", likelihood: 0.45, supportingFeatures: ["Bibasal distribution", "Reticular pattern"], opposingFeatures: ["No honeycombing"], icd10Code: "J44.9" },
        { dx: "Early interstitial lung disease", likelihood: 0.3, supportingFeatures: ["Reticular markings"], opposingFeatures: ["No volume loss"], icd10Code: "J84.10" },
        { dx: "Atypical infection", likelihood: 0.15, supportingFeatures: ["Bilateral involvement"], opposingFeatures: ["Afebrile pattern"] },
        { dx: "Pulmonary edema (interstitial phase)", likelihood: 0.1, supportingFeatures: ["Bibasal"], opposingFeatures: ["No Kerley B lines", "Normal cardiac size"], icd10Code: "J81.0" },
      ],
    },
    {
      title: "Right basal opacity — possible consolidation",
      description: "Ill-defined opacity in the right lower zone. Differential includes early consolidation versus atelectasis.",
      region: "Right lower zone",
      anatomicalRegion: "Right lower lobe",
      observation: "Patchy increased opacity in the right lower zone obscuring the right hemidiaphragm silhouette. No definite air bronchograms.",
      impression: "Right lower lobe opacity — pneumonia favored over atelectasis.",
      recommendation: "Empirical CAP antibiotics if clinically consistent. Repeat radiograph in 4–6 weeks to confirm resolution.",
      icd10Code: "J18.1", icd10Label: "Lobar pneumonia, unspecified organism",
      snomedCode: "385093006", snomedLabel: "Community acquired pneumonia",
      urgency: "urgent",
      baseSeverity: "high",
      differentials: [
        { dx: "Bacterial pneumonia (CAP)", likelihood: 0.6, supportingFeatures: ["Lobar distribution", "Silhouette sign positive"], opposingFeatures: ["No air bronchograms visible"], icd10Code: "J18.1" },
        { dx: "Atelectasis", likelihood: 0.25, supportingFeatures: ["Volume loss possible"], opposingFeatures: ["No fissural displacement"], icd10Code: "J98.11" },
        { dx: "Aspiration", likelihood: 0.1, supportingFeatures: ["Right-sided dependent location"], opposingFeatures: ["No airspace nodules"] },
        { dx: "Pulmonary infarct", likelihood: 0.05, supportingFeatures: ["Peripheral wedge"], opposingFeatures: ["No pleural-based opacity"], icd10Code: "I26.99" },
      ],
    },
  ],
  CT: [
    {
      title: "No acute intracranial findings",
      description: "No evidence of acute intracranial hemorrhage, mass effect, or midline shift.",
      region: "Supratentorial",
      anatomicalRegion: "Whole brain",
      observation: "Grey-white differentiation preserved. Ventricles normal in size and configuration. No extra-axial collection.",
      impression: "Unremarkable non-contrast head CT.",
      recommendation: "If clinical suspicion for stroke persists, consider MRI with DWI.",
      icd10Code: "Z01.6", snomedCode: "428461000124100", snomedLabel: "Normal CT of head",
      urgency: "routine",
      baseSeverity: "low",
      differentials: [
        { dx: "Normal brain CT", likelihood: 0.9, supportingFeatures: ["Preserved grey-white differentiation"], opposingFeatures: [] },
        { dx: "Hyperacute ischemia (radiographically occult)", likelihood: 0.08, supportingFeatures: ["Acute symptoms"], opposingFeatures: ["No early ischemic changes"], icd10Code: "I63.9" },
      ],
    },
    {
      title: "Sub-centimeter pulmonary nodule (RUL)",
      description: "6 mm solid pulmonary nodule in the right upper lobe.",
      region: "RUL apical segment",
      anatomicalRegion: "Right upper lobe, apical segment",
      observation: "Well-circumscribed solid nodule measuring 6 mm in long axis. No spiculation. No associated lymphadenopathy.",
      impression: "Indeterminate solid pulmonary nodule, low risk by morphology.",
      recommendation: "Per Fleischner Society 2017: low-risk patient → optional CT in 12 months. High-risk → CT at 6–12 months.",
      icd10Code: "R91.1", icd10Label: "Solitary pulmonary nodule",
      snomedCode: "427359005", snomedLabel: "Solitary pulmonary nodule",
      urgency: "routine",
      baseSeverity: "medium",
      differentials: [
        { dx: "Benign granuloma", likelihood: 0.55, supportingFeatures: ["Smooth margins", "Sub-cm size"], opposingFeatures: ["No calcification confirmed"] },
        { dx: "Hamartoma", likelihood: 0.2, supportingFeatures: ["Well-circumscribed"], opposingFeatures: ["No fat density"] },
        { dx: "Early adenocarcinoma", likelihood: 0.15, supportingFeatures: ["Solid morphology"], opposingFeatures: ["No spiculation", "Sub-cm"], icd10Code: "C34.10" },
        { dx: "Intrapulmonary lymph node", likelihood: 0.1, supportingFeatures: ["Peripheral location"], opposingFeatures: [] },
      ],
    },
    {
      title: "Hepatic steatosis (mild–moderate)",
      description: "Diffusely decreased hepatic attenuation suggestive of mild–moderate steatosis.",
      region: "Liver parenchyma",
      anatomicalRegion: "Liver, all segments",
      observation: "Hepatic attenuation 38 HU, lower than splenic attenuation by ≥ 10 HU. No focal lesion.",
      impression: "Diffuse hepatic steatosis.",
      recommendation: "Correlate with metabolic profile (lipids, HbA1c, LFTs). Lifestyle modification first-line.",
      icd10Code: "K76.0", icd10Label: "Fatty (change of) liver, not elsewhere classified",
      snomedCode: "197321007", snomedLabel: "Steatosis of liver",
      urgency: "routine",
      baseSeverity: "medium",
      differentials: [
        { dx: "Non-alcoholic fatty liver disease (NAFLD)", likelihood: 0.7, supportingFeatures: ["Diffuse low attenuation"], opposingFeatures: [], icd10Code: "K76.0" },
        { dx: "Alcoholic steatosis", likelihood: 0.2, supportingFeatures: ["Same imaging pattern"], opposingFeatures: ["History dependent"] },
        { dx: "Drug-induced steatosis", likelihood: 0.1, supportingFeatures: [], opposingFeatures: ["Requires medication review"] },
      ],
    },
  ],
  MRI: [
    {
      title: "Disc desiccation at L4–L5 with mild bulge",
      description: "T2 hypointensity of the L4–L5 disc with mild posterior disc bulge causing minimal central canal narrowing.",
      region: "L4–L5",
      anatomicalRegion: "L4–L5 intervertebral disc",
      observation: "Loss of T2 signal at L4–L5. Diffuse posterior disc bulge ~3 mm. Thecal sac patent. No nerve root impingement.",
      impression: "Degenerative disc disease at L4–L5 without neural compromise.",
      recommendation: "Conservative management. Re-image only if new neurological symptoms develop.",
      icd10Code: "M51.36", icd10Label: "Other intervertebral disc degeneration, lumbar region",
      snomedCode: "445540008", snomedLabel: "Lumbar intervertebral disc degeneration",
      urgency: "routine",
      baseSeverity: "low",
      differentials: [
        { dx: "Degenerative disc disease", likelihood: 0.85, supportingFeatures: ["T2 signal loss", "Disc bulge"], opposingFeatures: [], icd10Code: "M51.36" },
        { dx: "Discitis (early)", likelihood: 0.1, supportingFeatures: [], opposingFeatures: ["No marrow edema", "No endplate erosion"], icd10Code: "M46.46" },
        { dx: "Annular tear", likelihood: 0.05, supportingFeatures: ["Localized hyperintensity possible"], opposingFeatures: ["No HIZ identified"] },
      ],
    },
    {
      title: "Subchondral marrow edema — medial tibial plateau",
      description: "Mild subchondral marrow edema along the medial tibial plateau — could represent stress reaction.",
      region: "Medial tibia",
      anatomicalRegion: "Medial tibial plateau",
      observation: "Patchy T2/STIR hyperintensity in subchondral medial tibial plateau. No fracture line. Cartilage intact.",
      impression: "Bone marrow edema pattern, likely stress reaction.",
      recommendation: "Reduce loading activity 4–6 weeks. Repeat MRI if symptoms persist.",
      icd10Code: "M84.359A", icd10Label: "Stress fracture, lower leg, initial encounter",
      urgency: "routine",
      baseSeverity: "medium",
      differentials: [
        { dx: "Stress reaction", likelihood: 0.6, supportingFeatures: ["Diffuse marrow edema"], opposingFeatures: ["No discrete fracture line"] },
        { dx: "Early osteoarthritis", likelihood: 0.25, supportingFeatures: ["Medial compartment"], opposingFeatures: ["Cartilage preserved"], icd10Code: "M17.11" },
        { dx: "Transient bone marrow edema syndrome", likelihood: 0.15, supportingFeatures: [], opposingFeatures: [] },
      ],
    },
  ],
  Ultrasound: [
    {
      title: "Normal hepatic echotexture",
      description: "Liver demonstrates homogeneous echotexture without focal lesion. Portal vein patent with hepatopetal flow.",
      region: "Liver",
      anatomicalRegion: "Liver",
      observation: "Homogeneous parenchyma. CBD < 6 mm. Portal vein patent, hepatopetal flow on Doppler.",
      impression: "Normal hepatic ultrasound.",
      recommendation: "Routine follow-up only if clinically indicated.",
      icd10Code: "Z01.89",
      snomedCode: "168732002", snomedLabel: "Normal liver ultrasound",
      urgency: "routine",
      baseSeverity: "low",
      differentials: [
        { dx: "Normal liver", likelihood: 0.95, supportingFeatures: ["Homogeneous parenchyma", "Patent portal vein"], opposingFeatures: [] },
      ],
    },
  ],
  ECG: [
    {
      title: "Sinus rhythm with non-specific ST changes",
      description: "Rate 78 bpm. Non-specific ST-T wave changes in inferior leads.",
      region: "Inferior leads",
      anatomicalRegion: "Inferior leads (II, III, aVF)",
      observation: "Sinus rhythm, rate 78. PR 160 ms. QRS 92 ms. QTc 420 ms. Subtle ST flattening in II/III/aVF.",
      impression: "Non-specific ST-T changes — clinically correlate.",
      recommendation: "Serial ECGs and troponin if chest pain. Compare with prior ECG when available.",
      icd10Code: "R94.31", icd10Label: "Abnormal electrocardiogram [ECG] [EKG]",
      snomedCode: "164873001", snomedLabel: "ST segment changes",
      urgency: "urgent",
      baseSeverity: "medium",
      differentials: [
        { dx: "Non-specific repolarization change", likelihood: 0.55, supportingFeatures: ["No reciprocal changes"], opposingFeatures: [] },
        { dx: "Early ischemia (inferior territory)", likelihood: 0.3, supportingFeatures: ["Inferior leads involved"], opposingFeatures: ["No ST elevation"], icd10Code: "I20.9" },
        { dx: "Electrolyte derangement", likelihood: 0.1, supportingFeatures: [], opposingFeatures: ["Need labs"] },
        { dx: "LVH strain pattern", likelihood: 0.05, supportingFeatures: [], opposingFeatures: ["No LVH voltage criteria"] },
      ],
    },
  ],
  Pathology: [
    {
      title: "Benign nevus features predominate",
      description: "Symmetric architectural pattern with melanocyte maturation with depth.",
      region: "Dermal-epidermal junction",
      anatomicalRegion: "Dermal-epidermal junction",
      observation: "Symmetric nests of melanocytes. Maturation with descent. No atypical mitoses. No pagetoid spread.",
      impression: "Benign compound nevus.",
      recommendation: "No further intervention. Standard skin surveillance.",
      icd10Code: "D22.9", icd10Label: "Melanocytic nevi, unspecified",
      snomedCode: "400122007", snomedLabel: "Compound melanocytic nevus",
      urgency: "routine",
      baseSeverity: "low",
      differentials: [
        { dx: "Compound nevus", likelihood: 0.85, supportingFeatures: ["Symmetric architecture", "Maturation"], opposingFeatures: [] },
        { dx: "Dysplastic nevus", likelihood: 0.12, supportingFeatures: [], opposingFeatures: ["No cytologic atypia"] },
        { dx: "Early melanoma", likelihood: 0.03, supportingFeatures: [], opposingFeatures: ["No pagetoid spread", "No atypical mitoses"], icd10Code: "C43.9" },
      ],
    },
  ],
  Photo: [
    {
      title: "Pigmented lesion — features warrant clinical review",
      description: "Lesion shows asymmetry along one axis with mild border irregularity.",
      region: "Lesion",
      anatomicalRegion: "Cutaneous lesion",
      observation: "Asymmetry along long axis. Border irregularity grade 1. Two colour zones (tan/dark brown). Diameter ~7 mm.",
      impression: "Atypical pigmented lesion — dermoscopy and possible excision biopsy indicated.",
      recommendation: "In-person dermoscopy. Consider excisional biopsy with 2 mm margins if dermoscopic atypia confirmed.",
      icd10Code: "D48.5", icd10Label: "Neoplasm of uncertain behavior of skin",
      snomedCode: "16403006", snomedLabel: "Pigmented skin lesion",
      urgency: "urgent",
      baseSeverity: "high",
      differentials: [
        { dx: "Atypical (dysplastic) nevus", likelihood: 0.5, supportingFeatures: ["Asymmetry", "Border irregularity"], opposingFeatures: [] },
        { dx: "Melanoma in situ", likelihood: 0.25, supportingFeatures: ["Two colours", "Asymmetry"], opposingFeatures: ["Diameter < 8 mm"], icd10Code: "D03.9" },
        { dx: "Seborrheic keratosis", likelihood: 0.15, supportingFeatures: ["Pigmented"], opposingFeatures: ["No stuck-on appearance"], icd10Code: "L82.1" },
        { dx: "Pigmented BCC", likelihood: 0.1, supportingFeatures: [], opposingFeatures: ["No pearly border described"], icd10Code: "C44.91" },
      ],
    },
  ],
  Video: [
    {
      title: "Diffuse mucosal erythema, no active bleeding",
      description: "Diffuse mucosal erythema noted in sampled segments. No actively bleeding lesion identified.",
      region: "Distal segment",
      anatomicalRegion: "Distal sampled segment",
      observation: "Erythematous, friable mucosa over the distal segment. No ulcer crater. No active hemorrhage. No mass lesion.",
      impression: "Inflammatory mucosal change — biopsy recommended.",
      recommendation: "Targeted biopsies of erythematous areas. Initiate empirical PPI if upper GI; await histology before further therapy.",
      icd10Code: "K29.70", icd10Label: "Gastritis, unspecified, without bleeding",
      snomedCode: "4556007", snomedLabel: "Gastritis",
      urgency: "routine",
      baseSeverity: "medium",
      differentials: [
        { dx: "Non-erosive gastritis", likelihood: 0.55, supportingFeatures: ["Diffuse erythema", "No erosion"], opposingFeatures: [], icd10Code: "K29.70" },
        { dx: "H. pylori-associated gastritis", likelihood: 0.25, supportingFeatures: ["Mucosal change"], opposingFeatures: ["Need biopsy"], icd10Code: "B96.81" },
        { dx: "NSAID-induced mucosal injury", likelihood: 0.15, supportingFeatures: [], opposingFeatures: ["History needed"] },
        { dx: "Inflammatory bowel involvement", likelihood: 0.05, supportingFeatures: [], opposingFeatures: ["No ulceration"], icd10Code: "K50.90" },
      ],
    },
  ],
  Nuclear: [
    {
      title: "Focal area of increased radiotracer uptake",
      description: "Focal area of increased uptake — pattern is non-specific.",
      region: "Focal",
      anatomicalRegion: "Focal — see localized image",
      observation: "Discrete focus of intense radiotracer uptake. SUVmax pending. No diffuse multifocal involvement.",
      impression: "Solitary focus of increased uptake — requires structural correlation.",
      recommendation: "Correlate with contemporaneous CT/MRI of the same region.",
      icd10Code: "R94.6", icd10Label: "Abnormal results of thyroid function studies",
      urgency: "urgent",
      baseSeverity: "high",
      differentials: [
        { dx: "Inflammatory uptake", likelihood: 0.4, supportingFeatures: ["Focal"], opposingFeatures: [] },
        { dx: "Neoplastic process", likelihood: 0.35, supportingFeatures: ["Intense focal uptake"], opposingFeatures: [] },
        { dx: "Post-procedural / traumatic", likelihood: 0.15, supportingFeatures: [], opposingFeatures: ["History dependent"] },
        { dx: "Physiologic uptake variant", likelihood: 0.1, supportingFeatures: [], opposingFeatures: [] },
      ],
    },
  ],
};

// Tier-aware severity adjustment — Tier C is more conservative.
function severityForTier(base: Severity, modality: Modality): Severity {
  if (modality.tier === "C" && base === "high") return Math.random() > 0.7 ? "critical" : "high";
  return base;
}

function buildPatientSummary(modality: Modality, findings: Finding[]): string {
  if (!findings.length) return "Your test was reviewed. No findings to report at this time.";
  const lines: string[] = [
    `Your ${modality.label.toLowerCase()} was reviewed with computer assistance and a doctor.`,
    "",
    "Here is what was seen, in plain language:",
  ];
  findings.forEach((f, i) => {
    const where = f.anatomicalRegion ?? f.region ?? "the area examined";
    const action =
      f.urgency === "stat"
        ? "This needs attention right away."
        : f.urgency === "urgent"
        ? "Please follow up with your doctor soon."
        : "This is not urgent — discuss with your doctor at your next visit.";
    lines.push(`${i + 1}. In ${where.toLowerCase()}: ${(f.impression ?? f.title).replace(/\.$/, "")}. ${action}`);
    if (f.recommendation) lines.push(`   Suggested next step: ${f.recommendation}`);
  });
  lines.push("");
  lines.push("This summary is a simplified version of the medical report. Always discuss with a qualified doctor before acting.");
  return lines.join("\n");
}

// `mockReport` was removed for production — analysis must come from the
// cloud-AI cascade via `analyze-study` / `analyze-live-capture`.

// ─────────────── Tier-aware confidence floors ───────────────
// Used by ReportViewer to surface a "low-confidence" banner when the
// model's overall probability falls below the safety threshold for the tier.
export const CONFIDENCE_FLOOR: Record<"A" | "B" | "C", number> = {
  A: 0.6,
  B: 0.6,
  C: 0.75,
};

