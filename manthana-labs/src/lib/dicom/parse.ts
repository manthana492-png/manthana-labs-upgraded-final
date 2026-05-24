/**
 * Lightweight client-side DICOM tag inspector.
 *
 * We deliberately avoid pulling in the full ~1.5MB cornerstone-wado/dicom-parser
 * stack. Instead we hand-roll a tiny "header-only" reader that walks the
 * Explicit-VR Little Endian preamble (every modern DICOM file starts this way)
 * and extracts the ~12 tags we need to:
 *   - identify the modality / body part
 *   - group instances into series
 *   - show patient ID hash + study UID for trust
 *   - render a thumbnail preview when feasible
 *
 * This runs entirely in the browser before upload — purely for UI feedback.
 * The authoritative parse + de-identification happens server-side in
 * `dicom-ingest`.
 */

export interface DicomTagPreview {
  fileName: string;
  size: number;
  studyInstanceUID?: string;
  seriesInstanceUID?: string;
  sopInstanceUID?: string;
  sopClassUID?: string;
  modality?: string;
  bodyPartExamined?: string;
  patientIdHash?: string;
  rows?: number;
  cols?: number;
  numberOfFrames?: number;
  /** Did we recognise the file as DICOM at all? */
  isDicom: boolean;
  /** Parse error if not DICOM. */
  error?: string;
}

const TAGS = {
  SOPClassUID: "00080016",
  SOPInstanceUID: "00080018",
  Modality: "00080060",
  StudyInstanceUID: "0020000D",
  SeriesInstanceUID: "0020000E",
  PatientID: "00100020",
  BodyPartExamined: "00180015",
  Rows: "00280010",
  Columns: "00280011",
  NumberOfFrames: "00280008",
} as const;

const WANTED: Set<string> = new Set(Object.values(TAGS));

export async function previewDicomFile(file: File): Promise<DicomTagPreview> {
  const out: DicomTagPreview = {
    fileName: file.name,
    size: file.size,
    isDicom: false,
  };
  try {
    // Read just enough to cover the meta header + first ~64KB of dataset —
    // every tag we care about lives well before that.
    const slice = await file.slice(0, Math.min(file.size, 256 * 1024)).arrayBuffer();
    const buf = new DataView(slice);

    // DICOM preamble: 128 bytes + "DICM" magic
    if (buf.byteLength < 132) {
      out.error = "File too small to be DICOM";
      return out;
    }
    const magic =
      String.fromCharCode(buf.getUint8(128)) +
      String.fromCharCode(buf.getUint8(129)) +
      String.fromCharCode(buf.getUint8(130)) +
      String.fromCharCode(buf.getUint8(131));
    if (magic !== "DICM") {
      out.error = "Not a DICOM file (missing DICM magic)";
      return out;
    }
    out.isDicom = true;

    let offset = 132;
    while (offset + 8 <= buf.byteLength) {
      const group = buf.getUint16(offset, true);
      const elem = buf.getUint16(offset + 2, true);
      const tag =
        group.toString(16).padStart(4, "0").toUpperCase() +
        elem.toString(16).padStart(4, "0").toUpperCase();

      // Read VR + length (Explicit VR Little Endian)
      const vr =
        String.fromCharCode(buf.getUint8(offset + 4)) +
        String.fromCharCode(buf.getUint8(offset + 5));
      let length = 0;
      let dataStart = 0;
      const longVR = ["OB", "OW", "OF", "SQ", "UT", "UN"];
      if (longVR.includes(vr)) {
        // 2 reserved bytes, then 4-byte length
        if (offset + 12 > buf.byteLength) break;
        length = buf.getUint32(offset + 8, true);
        dataStart = offset + 12;
      } else {
        length = buf.getUint16(offset + 6, true);
        dataStart = offset + 8;
      }

      // SQ (sequences) and pixel data — skip without descending; we don't
      // need anything inside them for the preview.
      if (vr === "SQ" || tag === "7FE00010") break;
      if (length === 0xffffffff) break;
      if (dataStart + length > buf.byteLength) break;

      if (WANTED.has(tag)) {
        const slice2 = new Uint8Array(buf.buffer, dataStart, length);
        const value = decodeValue(vr, slice2);
        applyTag(out, tag, value);
      }

      offset = dataStart + length;
    }

    // Hash the patient ID (so we never echo a real ID back to the UI).
    if (out.patientIdHash) {
      out.patientIdHash = await sha256Hex(out.patientIdHash).then((h) =>
        h.slice(0, 12),
      );
    }

    return out;
  } catch (err) {
    out.error = (err as Error)?.message ?? "Parse failed";
    return out;
  }
}

function decodeValue(vr: string, bytes: Uint8Array): string | number {
  if (vr === "US") {
    if (bytes.length >= 2) return new DataView(bytes.buffer, bytes.byteOffset).getUint16(0, true);
    return 0;
  }
  if (vr === "UL") {
    if (bytes.length >= 4) return new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true);
    return 0;
  }
  // String VRs (UI/CS/LO/SH/IS/DS/PN…)
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}

function applyTag(out: DicomTagPreview, tag: string, v: string | number): void {
  switch (tag) {
    case TAGS.SOPClassUID:
      out.sopClassUID = String(v);
      break;
    case TAGS.SOPInstanceUID:
      out.sopInstanceUID = String(v);
      break;
    case TAGS.Modality:
      out.modality = String(v).toUpperCase();
      break;
    case TAGS.StudyInstanceUID:
      out.studyInstanceUID = String(v);
      break;
    case TAGS.SeriesInstanceUID:
      out.seriesInstanceUID = String(v);
      break;
    case TAGS.PatientID:
      // Stored verbatim here, hashed by caller before display.
      out.patientIdHash = String(v);
      break;
    case TAGS.BodyPartExamined:
      out.bodyPartExamined = String(v);
      break;
    case TAGS.Rows:
      out.rows = Number(v) || undefined;
      break;
    case TAGS.Columns:
      out.cols = Number(v) || undefined;
      break;
    case TAGS.NumberOfFrames:
      out.numberOfFrames = Number(v) || 1;
      break;
  }
}

async function sha256Hex(s: string): Promise<string> {
  const enc = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Group an array of file previews by SeriesInstanceUID for friendly display.
 */
export function groupBySeries(previews: DicomTagPreview[]): Array<{
  seriesUID: string;
  modality?: string;
  bodyPart?: string;
  files: DicomTagPreview[];
}> {
  const map = new Map<string, ReturnType<typeof groupBySeries>[number]>();
  for (const p of previews) {
    const key = p.seriesInstanceUID ?? `__no_series_${p.fileName}`;
    let g = map.get(key);
    if (!g) {
      g = {
        seriesUID: key,
        modality: p.modality,
        bodyPart: p.bodyPartExamined,
        files: [],
      };
      map.set(key, g);
    }
    g.files.push(p);
  }
  return Array.from(map.values());
}
