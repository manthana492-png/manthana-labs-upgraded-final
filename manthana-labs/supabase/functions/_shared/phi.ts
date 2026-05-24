// PHI sanitisation. Two surfaces:
//  1) sanitizeFile() — strips DICOM PHI tags from binary uploads.
//  2) scrubFreeTextPHI() — regex-strips identifiers from questionnaire
//     answers / narrative strings before they enter any cloud-AI prompt.
//
// All outbound traffic to OpenRouter / Lovable AI / any third-party model
// MUST pass through both surfaces.

import dicomParser from "npm:dicom-parser@1.8.21";

const PHI_TAGS = [
  "x00100010", // PatientName
  "x00100020", // PatientID
  "x00100030", // PatientBirthDate
  "x00100040", // PatientSex
  "x00101010", // PatientAge
  "x00101040", // PatientAddress
  "x00102160", // EthnicGroup
  "x00102180", // Occupation
  "x00080050", // AccessionNumber
  "x00080080", // InstitutionName
  "x00080081", // InstitutionAddress
  "x00080090", // ReferringPhysicianName
  "x00080092", // ReferringPhysicianAddress
  "x00081010", // StationName
  "x00081040", // InstitutionalDepartmentName
  "x00081070", // OperatorsName
  "x00181000", // DeviceSerialNumber
];

export interface PhiResult {
  bytes: Uint8Array;
  isDicom: boolean;
  scrubbed: string[];
}

export function sanitizeFile(bytes: Uint8Array, contentType?: string | null): PhiResult {
  const isDicomByMime = !!contentType && /dicom/i.test(contentType);
  const isDicomByMagic = bytes.length > 132 &&
    bytes[128] === 0x44 && bytes[129] === 0x49 && bytes[130] === 0x43 && bytes[131] === 0x4d;
  if (!isDicomByMime && !isDicomByMagic) {
    return { bytes, isDicom: false, scrubbed: [] };
  }

  try {
    const dataset = dicomParser.parseDicom(bytes);
    const scrubbed: string[] = [];
    for (const tag of PHI_TAGS) {
      const el = dataset.elements[tag];
      if (!el) continue;
      const start = el.dataOffset;
      const len = el.length;
      if (typeof start === "number" && typeof len === "number" && len > 0) {
        for (let i = start; i < start + len; i++) bytes[i] = 0x00;
        scrubbed.push(tag);
      }
    }
    return { bytes, isDicom: true, scrubbed };
  } catch (err) {
    console.warn("dicom-parser failed; passing file through unscrubbed", err);
    return { bytes, isDicom: false, scrubbed: [] };
  }
}

// ───────────────── Free-text PHI scrubbing ─────────────────
// Best-effort regex strip for common Indian PII in questionnaire free-text
// fields. Replaces matches with "[REDACTED]". Conservative — false positives
// are preferred over leaking PHI.

const PII_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "email", re: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g },
  // Indian mobile: +91 / 0 / bare 10-digit starting 6-9
  { name: "phone_in", re: /\b(?:\+?91[-\s]?|0)?[6-9]\d{9}\b/g },
  // Aadhaar 12-digit (with optional spaces / dashes)
  { name: "aadhaar", re: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g },
  // PAN AAAAA9999A
  { name: "pan", re: /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g },
  // ISO date / DOB-ish
  { name: "dob_iso", re: /\b(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g },
  { name: "dob_dmy", re: /\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])[\/\-](19|20)\d{2}\b/g },
  // Explicit "patient name: X" / "name: X" prefixed lines
  { name: "name_kv", re: /\b(patient\s+name|pt\s+name|name)\s*[:=]\s*[A-Za-z][A-Za-z .'-]{1,60}/gi },
  // MRN / UHID-style numeric identifiers (>=6 digits) preceded by mrn/uhid/id
  { name: "mrn", re: /\b(mrn|uhid|hospital\s*id|patient\s*id)\s*[:#=]?\s*[A-Za-z0-9-]{4,}/gi },
];

export function scrubFreeTextPHI(input: string): string {
  if (!input) return input;
  let out = input;
  for (const { re } of PII_PATTERNS) out = out.replace(re, "[REDACTED]");
  return out;
}

/** Recursively scrub all string values in a JSON-shaped object. */
export function scrubAnswersPHI<T>(value: T): T {
  if (value == null) return value;
  if (typeof value === "string") return scrubFreeTextPHI(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => scrubAnswersPHI(v)) as unknown as T;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = scrubAnswersPHI(v);
    }
    return out as unknown as T;
  }
  return value;
}
