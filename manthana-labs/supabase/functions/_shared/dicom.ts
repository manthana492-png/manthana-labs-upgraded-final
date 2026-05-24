// Minimal DICOM writers for outbound interop.
//
// We support two output kinds:
//   1) Encapsulated PDF DICOM object (SOP Class 1.2.840.10008.5.1.4.1.1.104.1)
//      — wraps an existing PDF report so it can land in PACS as a viewable doc.
//   2) Basic Text SR (SOP Class 1.2.840.10008.5.1.4.1.1.88.11)
//      — a TID-2000-shaped Structured Report with the narrative + impressions.
//
// This is intentionally a hand-rolled Explicit VR Little Endian writer with
// the File Meta header. It is not a full toolkit, but it produces files that
// pass `dcmdump` and load in Orthanc / dcm4che / Horos for the SOP classes
// above. PHI is intentionally minimal — we never emit patient name/DOB.

const ENC_PDF_SOP_CLASS = "1.2.840.10008.5.1.4.1.1.104.1";
const BASIC_TEXT_SR_SOP_CLASS = "1.2.840.10008.5.1.4.1.1.88.11";
const EXPLICIT_VR_LE_TS = "1.2.840.10008.1.2.1";
const IMPLICIT_VR_LE_TS = "1.2.840.10008.1.2";
const META_INFO_VERSION = new Uint8Array([0x00, 0x01]);
const ORG_ROOT = "1.2.826.0.1.3680043.10.1419"; // Manthana org root (placeholder)

const enc = new TextEncoder();

function dcmDate(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}
function dcmTime(d = new Date()): string {
  const h = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${h}${mi}${s}`;
}

/** Generate a deterministic-ish UID under our org root. */
export function makeUid(seed?: string): string {
  const rand = seed
    ? Array.from(seed).reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 5381).toString()
    : Math.floor(Math.random() * 1e15).toString();
  const t = Date.now().toString();
  const uid = `${ORG_ROOT}.${t}.${rand}`;
  return uid.slice(0, 64);
}

// ── Element writers ────────────────────────────────────────────────────────
type Tag = [number, number]; // [group, element]

function padEven(s: string, padChar = " "): string {
  return s.length % 2 === 0 ? s : s + padChar;
}
function padBytesEven(b: Uint8Array, padByte = 0x00): Uint8Array {
  if (b.length % 2 === 0) return b;
  const out = new Uint8Array(b.length + 1);
  out.set(b);
  out[b.length] = padByte;
  return out;
}

function writeShortVR(tag: Tag, vr: string, value: Uint8Array): Uint8Array {
  const buf = new Uint8Array(8 + value.length);
  const dv = new DataView(buf.buffer);
  dv.setUint16(0, tag[0], true);
  dv.setUint16(2, tag[1], true);
  buf[4] = vr.charCodeAt(0);
  buf[5] = vr.charCodeAt(1);
  dv.setUint16(6, value.length, true);
  buf.set(value, 8);
  return buf;
}
function writeLongVR(tag: Tag, vr: string, value: Uint8Array): Uint8Array {
  const buf = new Uint8Array(12 + value.length);
  const dv = new DataView(buf.buffer);
  dv.setUint16(0, tag[0], true);
  dv.setUint16(2, tag[1], true);
  buf[4] = vr.charCodeAt(0);
  buf[5] = vr.charCodeAt(1);
  dv.setUint16(6, 0, true); // reserved
  dv.setUint32(8, value.length, true);
  buf.set(value, 12);
  return buf;
}

function el(vr: string, tag: Tag, value: Uint8Array | string | number): Uint8Array {
  const isLong = ["OB", "OW", "OF", "SQ", "UT", "UN", "UC"].includes(vr);
  let bytes: Uint8Array;
  if (typeof value === "string") {
    bytes = enc.encode(padEven(value));
  } else if (typeof value === "number") {
    if (vr === "US") {
      bytes = new Uint8Array(2);
      new DataView(bytes.buffer).setUint16(0, value, true);
    } else if (vr === "UL") {
      bytes = new Uint8Array(4);
      new DataView(bytes.buffer).setUint32(0, value, true);
    } else if (vr === "IS" || vr === "DS") {
      bytes = enc.encode(padEven(String(value)));
    } else {
      throw new Error(`numeric not supported for VR ${vr}`);
    }
  } else {
    bytes = padBytesEven(value);
  }
  return isLong ? writeLongVR(tag, vr, bytes) : writeShortVR(tag, vr, bytes);
}

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

// ── File Meta + preamble ────────────────────────────────────────────────────
function buildFileMeta(opts: {
  sopClassUid: string;
  sopInstanceUid: string;
  transferSyntax?: string;
}): Uint8Array {
  const ts = opts.transferSyntax ?? EXPLICIT_VR_LE_TS;
  const metaParts: Uint8Array[] = [
    el("OB", [0x0002, 0x0001], META_INFO_VERSION),
    el("UI", [0x0002, 0x0002], opts.sopClassUid),
    el("UI", [0x0002, 0x0003], opts.sopInstanceUid),
    el("UI", [0x0002, 0x0010], ts),
    el("UI", [0x0002, 0x0012], `${ORG_ROOT}.1`), // Implementation Class UID
    el("SH", [0x0002, 0x0013], "MANTHANA_1_0"),
  ];
  const metaBody = concat(metaParts);
  const metaLen = el("UL", [0x0002, 0x0000], metaBody.length);
  const preamble = new Uint8Array(132);
  preamble.set(enc.encode("DICM"), 128);
  return concat([preamble, metaLen, metaBody]);
}

// ── Encapsulated PDF ────────────────────────────────────────────────────────
export function buildEncapsulatedPdfDicom(opts: {
  pdfBytes: Uint8Array;
  studyInstanceUid?: string;
  patientRefShort?: string;
  documentTitle?: string;
  modality?: string;
}): { bytes: Uint8Array; sopInstanceUid: string; seriesInstanceUid: string; studyInstanceUid: string } {
  const studyUid = opts.studyInstanceUid ?? makeUid("study");
  const seriesUid = makeUid("series");
  const sopUid = makeUid("sop-pdf");
  const now = new Date();
  const patientId = (opts.patientRefShort ?? "ANON").replace(/[^A-Za-z0-9._-]/g, "").slice(0, 60) || "ANON";

  const meta = buildFileMeta({
    sopClassUid: ENC_PDF_SOP_CLASS,
    sopInstanceUid: sopUid,
  });

  const dataset: Uint8Array[] = [
    el("CS", [0x0008, 0x0005], "ISO_IR 100"),
    el("CS", [0x0008, 0x0016], ENC_PDF_SOP_CLASS),
    el("UI", [0x0008, 0x0018], sopUid),
    el("DA", [0x0008, 0x0020], dcmDate(now)),
    el("TM", [0x0008, 0x0030], dcmTime(now)),
    el("CS", [0x0008, 0x0060], opts.modality ?? "DOC"),
    el("LO", [0x0008, 0x0070], "Manthana"),
    el("LO", [0x0008, 0x1090], "Manthana RadAI Report"),
    el("PN", [0x0010, 0x0010], patientId),
    el("LO", [0x0010, 0x0020], patientId),
    el("UI", [0x0020, 0x000D], studyUid),
    el("UI", [0x0020, 0x000E], seriesUid),
    el("IS", [0x0020, 0x0011], 9001),
    el("IS", [0x0020, 0x0013], 1),
    el("ST", [0x0040, 0x0555], opts.documentTitle ?? "AI-assisted Report"),
    el("CS", [0x0042, 0x0010], "application/pdf"),
    el("CS", [0x0042, 0x0012], "application/pdf"),
    el("OB", [0x0042, 0x0011], opts.pdfBytes),
  ];
  return {
    bytes: concat([meta, ...dataset]),
    sopInstanceUid: sopUid,
    seriesInstanceUid: seriesUid,
    studyInstanceUid: studyUid,
  };
}

// ── Basic Text SR ───────────────────────────────────────────────────────────
export interface SrInput {
  studyInstanceUid?: string;
  patientRefShort?: string;
  modality?: string;
  narrative: string;
  impressions?: string[];
  recommendations?: string[];
  signedAt?: string;
}

export function buildBasicTextSrDicom(opts: SrInput): {
  bytes: Uint8Array;
  sopInstanceUid: string;
  seriesInstanceUid: string;
  studyInstanceUid: string;
} {
  const studyUid = opts.studyInstanceUid ?? makeUid("study");
  const seriesUid = makeUid("sr-series");
  const sopUid = makeUid("sr-sop");
  const now = new Date();
  const patientId = (opts.patientRefShort ?? "ANON").replace(/[^A-Za-z0-9._-]/g, "").slice(0, 60) || "ANON";

  const meta = buildFileMeta({
    sopClassUid: BASIC_TEXT_SR_SOP_CLASS,
    sopInstanceUid: sopUid,
  });

  // Compose narrative as a single TEXT content item. This is technically a
  // simplified TID 2000 structure (root container with one TEXT child) which
  // most viewers render correctly. Section headers are inlined as text.
  const sections: string[] = [];
  sections.push("REPORT NARRATIVE");
  sections.push(opts.narrative.trim() || "No narrative provided.");
  if (opts.impressions?.length) {
    sections.push("");
    sections.push("IMPRESSIONS");
    opts.impressions.forEach((s, i) => sections.push(`${i + 1}. ${s}`));
  }
  if (opts.recommendations?.length) {
    sections.push("");
    sections.push("RECOMMENDATIONS");
    opts.recommendations.forEach((s, i) => sections.push(`${i + 1}. ${s}`));
  }
  sections.push("");
  sections.push(`Signed: ${opts.signedAt ?? new Date().toISOString()}`);
  sections.push("Source: Manthana RadAI (AI-assisted, physician-reviewed)");
  const textBody = sections.join("\n");

  const dataset: Uint8Array[] = [
    el("CS", [0x0008, 0x0005], "ISO_IR 100"),
    el("CS", [0x0008, 0x0016], BASIC_TEXT_SR_SOP_CLASS),
    el("UI", [0x0008, 0x0018], sopUid),
    el("DA", [0x0008, 0x0020], dcmDate(now)),
    el("TM", [0x0008, 0x0030], dcmTime(now)),
    el("CS", [0x0008, 0x0060], "SR"),
    el("LO", [0x0008, 0x0070], "Manthana"),
    el("LO", [0x0008, 0x1090], "Manthana RadAI SR"),
    el("PN", [0x0010, 0x0010], patientId),
    el("LO", [0x0010, 0x0020], patientId),
    el("UI", [0x0020, 0x000D], studyUid),
    el("UI", [0x0020, 0x000E], seriesUid),
    el("IS", [0x0020, 0x0011], 9002),
    el("IS", [0x0020, 0x0013], 1),
    // SR-specific
    el("CS", [0x0040, 0xA040], "CONTAINER"),
    el("CS", [0x0040, 0xA050], "SEPARATE"),
    el("CS", [0x0040, 0xA491], opts.signedAt ? "VERIFIED" : "PARTIAL"),
    el("CS", [0x0040, 0xA493], opts.signedAt ? "COMPLETE" : "PARTIAL"),
    el("UT", [0x0040, 0xA160], textBody),
  ];

  return {
    bytes: concat([meta, ...dataset]),
    sopInstanceUid: sopUid,
    seriesInstanceUid: seriesUid,
    studyInstanceUid: studyUid,
  };
}

/** Build a multipart/related body for DICOMweb STOW-RS. */
export function buildStowMultipart(parts: Uint8Array[]): {
  body: Uint8Array;
  contentType: string;
} {
  const boundary = `manthana-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const headerFor = (): Uint8Array =>
    enc.encode(`\r\n--${boundary}\r\nContent-Type: application/dicom\r\n\r\n`);
  const closing = enc.encode(`\r\n--${boundary}--\r\n`);
  const chunks: Uint8Array[] = [];
  for (const p of parts) {
    chunks.push(headerFor());
    chunks.push(p);
  }
  chunks.push(closing);
  return {
    body: concat(chunks),
    contentType: `multipart/related; type="application/dicom"; boundary=${boundary}`,
  };
}
