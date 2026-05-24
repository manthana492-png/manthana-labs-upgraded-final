// Server-side questionnaire definitions — mirrors src/lib/questionnaire.ts
// (frontend keeps its own copy for offline rendering). Tier A/B → 5 Qs,
// Tier C → 7 Qs (adds consent + free-text context).
import type { Tier } from "./modalities.ts";

export type QuestionKind = "yesno" | "multi" | "number" | "text";
export interface QuestionOption { value: string; label: string }
export interface Question {
  id: string;
  prompt: string;
  helper?: string;
  kind: QuestionKind;
  options?: QuestionOption[];
  required?: boolean;
  min?: number;
  max?: number;
  unit?: string;
}

const baseClinical: Question[] = [
  { id: "indication", prompt: "What's the primary clinical indication for this study?",
    helper: "Brief — the suspected condition or symptom prompting imaging.",
    kind: "text", required: true },
  { id: "duration", prompt: "How long has the patient experienced symptoms?",
    kind: "multi", required: true,
    options: [
      { value: "<24h",  label: "Less than 24 hours" },
      { value: "1-7d",  label: "1–7 days" },
      { value: "1-4w",  label: "1–4 weeks" },
      { value: ">1m",   label: "More than 1 month" },
    ] },
  { id: "age", prompt: "Patient age (years)?",
    kind: "number", required: true, min: 0, max: 120, unit: "yrs" },
  { id: "comorbid", prompt: "Any significant comorbidities to flag?",
    helper: "Diabetes, immunosuppression, malignancy, etc.",
    kind: "multi",
    options: [
      { value: "none",       label: "None reported" },
      { value: "dm",         label: "Diabetes" },
      { value: "htn",        label: "Hypertension" },
      { value: "immuno",     label: "Immunosuppression" },
      { value: "malignancy", label: "Active malignancy" },
      { value: "smoker",     label: "Current/former smoker" },
    ] },
  { id: "prior",  prompt: "Has the patient had prior imaging of this region?", kind: "yesno" },
  { id: "acute",  prompt: "Are there any red-flag features (acute chest pain, focal deficit, trauma)?",
    kind: "yesno", required: true },
];

const tierCExtras: Question[] = [
  { id: "consent",
    prompt: "Has explicit consent for AI-assisted research review been obtained?",
    helper: "Tier C uses research-assisted analysis and requires informed consent.",
    kind: "yesno", required: true },
  { id: "context",
    prompt: "Any additional clinical context that may guide interpretation?",
    helper: "Optional but improves analysis quality.",
    kind: "text" },
];

export function buildQuestionnaire(tier: Tier): Question[] {
  if (tier === "C") return [...baseClinical, ...tierCExtras];
  return baseClinical.slice(0, 5);
}
