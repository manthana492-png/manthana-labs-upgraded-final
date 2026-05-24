/**
 * Indian medical council registry — covers Allopathy + AYUSH + Dental.
 *
 * Sources of truth (registers we soft-validate against):
 *  - NMC / IMR (Indian Medical Register)            — Allopathy
 *  - State Medical Councils (28 states + 8 UTs)     — Allopathy delegation
 *  - NCISM (National Commission for Indian System of Medicine)
 *      → Ayurveda, Unani, Siddha, Sowa-Rigpa
 *  - NCH  (National Commission for Homoeopathy)     — Homeopathy
 *  - DCI  (Dental Council of India)                 — Dental (BDS/MDS)
 *
 * For each `system`, we know the format the registration number commonly
 * follows so we can run a checksum / format check before queuing the
 * record for live verification (or admin manual review).
 */

import type { MedicalSystem } from "./types";

export interface CouncilBody {
  /** Stable id used in DB. */
  id: string;
  /** UI label. */
  name: string;
  /** Medical system this council governs. */
  system: MedicalSystem;
  /** Verification authority website (shown to user). */
  registryUrl?: string;
  /** Acceptable registration-number format examples. */
  formatHint: string;
  /** Regex used for client-side format check (pre-flight). */
  pattern: RegExp;
  /** State (if state-specific council). */
  state?: string;
}

export const COUNCIL_BODIES: CouncilBody[] = [
  // ── Allopathy: NMC + State councils (representative subset) ──
  {
    id: "nmc",
    name: "National Medical Commission (NMC) — Indian Medical Register",
    system: "allopathy",
    registryUrl: "https://www.nmc.org.in/information-desk/indian-medical-register/",
    formatHint: "e.g. 12345-2018  ·  IMR/2018/12345",
    pattern: /^[A-Z]{0,4}[\/-]?\d{4,7}[\/-]?\d{4}$/i,
  },
  {
    id: "smc-mh",
    name: "Maharashtra Medical Council",
    system: "allopathy",
    registryUrl: "https://www.maharashtramedicalcouncil.in/",
    formatHint: "e.g. 2018091234",
    pattern: /^\d{6,12}$/,
    state: "Maharashtra",
  },
  {
    id: "smc-tn",
    name: "Tamil Nadu Medical Council",
    system: "allopathy",
    registryUrl: "https://www.tnmedicalcouncil.org/",
    formatHint: "e.g. 123456",
    pattern: /^\d{4,8}$/,
    state: "Tamil Nadu",
  },
  {
    id: "smc-ka",
    name: "Karnataka Medical Council",
    system: "allopathy",
    registryUrl: "https://www.karnatakamedicalcouncil.com/",
    formatHint: "e.g. KMC-12345",
    pattern: /^(KMC[\/-]?)?\d{4,8}$/i,
    state: "Karnataka",
  },
  {
    id: "smc-dl",
    name: "Delhi Medical Council",
    system: "allopathy",
    registryUrl: "https://www.delhimedicalcouncil.org/",
    formatHint: "e.g. DMC/R/12345",
    pattern: /^(DMC[\/-]?R?[\/-]?)?\d{4,8}$/i,
    state: "Delhi",
  },
  {
    id: "smc-other",
    name: "Other State Medical Council (Allopathy)",
    system: "allopathy",
    formatHint: "Format varies — enter as printed on registration certificate",
    pattern: /^[A-Z0-9-/]{4,30}$/i,
  },

  // ── Ayurveda (NCISM Board of Ayurveda) ──
  {
    id: "ncism-ayurveda",
    name: "NCISM — Board of Ayurveda (Central Register)",
    system: "ayurveda",
    registryUrl: "https://ncismindia.org/",
    formatHint: "e.g. AYU/MH/2019/12345",
    pattern: /^AYU?[\/-]?[A-Z]{2,3}[\/-]?\d{4}[\/-]?\d{3,7}$/i,
  },
  {
    id: "state-ayurveda",
    name: "State Board of Ayurveda / BAMS",
    system: "ayurveda",
    formatHint: "e.g. A-12345  ·  BAMS/12345",
    pattern: /^(BAMS|A)[\/-]?\d{3,8}$/i,
  },

  // ── Homeopathy (NCH) ──
  {
    id: "nch",
    name: "National Commission for Homoeopathy (NCH)",
    system: "homeopathy",
    registryUrl: "https://nch.org.in/",
    formatHint: "e.g. HOM/MH/2019/12345  ·  BHMS-12345",
    pattern: /^(HOM|H|BHMS)[\/-]?[A-Z]{0,3}[\/-]?\d{0,4}[\/-]?\d{3,7}$/i,
  },

  // ── Siddha (NCISM Board of Siddha) ──
  {
    id: "ncism-siddha",
    name: "NCISM — Board of Siddha",
    system: "siddha",
    registryUrl: "https://ncismindia.org/",
    formatHint: "e.g. SID/TN/2018/1234  ·  BSMS-12345",
    pattern: /^(SID|S|BSMS)[\/-]?[A-Z]{0,3}[\/-]?\d{0,4}[\/-]?\d{3,7}$/i,
  },

  // ── Unani (NCISM Board of Unani) ──
  {
    id: "ncism-unani",
    name: "NCISM — Board of Unani",
    system: "unani",
    registryUrl: "https://ncismindia.org/",
    formatHint: "e.g. UNA/UP/2019/12345  ·  BUMS-12345",
    pattern: /^(UNA|U|BUMS)[\/-]?[A-Z]{0,3}[\/-]?\d{0,4}[\/-]?\d{3,7}$/i,
  },

  // ── Dental (DCI) ──
  {
    id: "dci",
    name: "Dental Council of India (DCI)",
    system: "dental",
    registryUrl: "https://dciindia.gov.in/",
    formatHint: "e.g. A-12345  ·  DCI/12345",
    pattern: /^(DCI[\/-]?)?[A-Z]?[\/-]?\d{3,8}$/i,
  },
];

export const SYSTEM_LABEL: Record<MedicalSystem, string> = {
  allopathy: "Allopathy (MBBS / MD)",
  ayurveda: "Ayurveda (BAMS / MD-Ayur)",
  homeopathy: "Homeopathy (BHMS / MD-Hom)",
  siddha: "Siddha (BSMS / MD-Siddha)",
  unani: "Unani (BUMS / MD-Unani)",
  dental: "Dental (BDS / MDS)",
};

export const SYSTEM_BLURB: Record<MedicalSystem, string> = {
  allopathy: "Modern medicine. Verified against the Indian Medical Register and your State Medical Council.",
  ayurveda: "Verified against NCISM — Board of Ayurveda central register.",
  homeopathy: "Verified against the National Commission for Homoeopathy register.",
  siddha: "Verified against NCISM — Board of Siddha central register.",
  unani: "Verified against NCISM — Board of Unani central register.",
  dental: "Verified against the Dental Council of India register.",
};

export function councilsForSystem(system: MedicalSystem): CouncilBody[] {
  return COUNCIL_BODIES.filter((c) => c.system === system);
}

export function findCouncil(id: string): CouncilBody | undefined {
  return COUNCIL_BODIES.find((c) => c.id === id);
}

/**
 * Best-effort match of an OCR-extracted council name (e.g. "Maharashtra
 * Medical Council", "NMC", "NCISM Ayurveda") to one of our COUNCIL_BODIES
 * entries. Returns the best id, optionally constrained to a system.
 */
export function matchCouncilByName(
  rawName: string | null | undefined,
  system?: MedicalSystem,
): CouncilBody | undefined {
  if (!rawName) return undefined;
  const q = rawName.toLowerCase();
  const pool = system ? COUNCIL_BODIES.filter((c) => c.system === system) : COUNCIL_BODIES;

  // Direct keyword hits first.
  const keywords: Array<{ id: string; tokens: string[] }> = [
    { id: "nmc", tokens: ["nmc", "national medical commission", "indian medical register", "imr"] },
    { id: "smc-mh", tokens: ["maharashtra"] },
    { id: "smc-tn", tokens: ["tamil nadu", "tnmc"] },
    { id: "smc-ka", tokens: ["karnataka", "kmc"] },
    { id: "smc-dl", tokens: ["delhi", "dmc"] },
    { id: "ncism-ayurveda", tokens: ["ayurveda", "ncism", "bams"] },
    { id: "ncism-siddha", tokens: ["siddha", "bsms"] },
    { id: "ncism-unani", tokens: ["unani", "bums"] },
    { id: "nch", tokens: ["homoeopathy", "homeopathy", "bhms", "nch"] },
    { id: "dci", tokens: ["dental", "dci", "bds"] },
  ];

  for (const k of keywords) {
    if (k.tokens.some((t) => q.includes(t))) {
      const hit = pool.find((c) => c.id === k.id);
      if (hit) return hit;
    }
  }

  // Fall back to "other state" if it's an allopathy-ish state council.
  if ((!system || system === "allopathy") && /council|medical/.test(q)) {
    return pool.find((c) => c.id === "smc-other");
  }
  return undefined;
}

/** Cheap client-side format check before submitting to the verification endpoint. */
export function validateRegistrationFormat(councilId: string, registrationNumber: string): {
  ok: boolean;
  message?: string;
} {
  const c = findCouncil(councilId);
  if (!c) return { ok: false, message: "Select a council first." };
  const v = registrationNumber.trim();
  if (v.length < 3) return { ok: false, message: "Too short." };
  if (!c.pattern.test(v)) {
    return { ok: false, message: `Format looks wrong. ${c.formatHint}` };
  }
  return { ok: true };
}
