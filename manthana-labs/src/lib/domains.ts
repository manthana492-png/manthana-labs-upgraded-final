// Catalog of medical domains supported in the post-report AI chat.
// Each one drives the system prompt of the `domain-report-chat` edge function.

import type { MedicalSystem } from "@/lib/types";

export interface MedicalDomain {
  id: Extract<MedicalSystem, "allopathy" | "ayurveda" | "homeopathy" | "siddha" | "unani">;
  label: string;
  blurb: string;
  emoji: string;
}

export const DOMAINS: MedicalDomain[] = [
  {
    id: "allopathy",
    label: "Allopathy",
    blurb: "Modern evidence-based medicine with ACR / RSNA / NICE guidance.",
    emoji: "🩺",
  },
  {
    id: "ayurveda",
    label: "Ayurveda",
    blurb: "Tridosha view with shlokas from Charaka, Sushruta, Ashtanga Hridaya.",
    emoji: "🌿",
  },
  {
    id: "homeopathy",
    label: "Homeopathy",
    blurb: "Miasms + Materia Medica (Hahnemann, Kent, Boericke, Allen).",
    emoji: "💊",
  },
  {
    id: "siddha",
    label: "Siddha",
    blurb: "Mukkutram & Naadi via Agathiyar, Theraiyar, Yugi Vaithiya Chinthamani.",
    emoji: "🪷",
  },
  {
    id: "unani",
    label: "Unani",
    blurb: "Akhlat & Mizaj — Al-Qanun (Ibn Sina), Kitab al-Hawi (Razi).",
    emoji: "☪️",
  },
];
