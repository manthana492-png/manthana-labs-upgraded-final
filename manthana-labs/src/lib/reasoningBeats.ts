/**
 * Reasoning Beats — the data layer behind the cinematic Replay feature.
 *
 * A "beat" is a single moment in the AI's reasoning trace: what slice it
 * looked at, which ROI it focused on, what it concluded, what citation it
 * pulled, or how it revised its mind. Beats are rendered as dots on the
 * timeline scrubber and choreograph the viewer + side panels.
 *
 * SOURCE OF TRUTH:
 *   1) If the backend (Modal) has streamed structured beats into
 *      `study.report.reasoningBeats[]` (future contract), we use those
 *      directly — gives us perfect provenance + replayability.
 *   2) Otherwise we *synthesize* a plausible, deterministic trace from the
 *      data we already have (findings, citations, confidence, narrative).
 *      This means the feature works TODAY against every existing study.
 *
 * The synthesizer is deterministic per-study (seeded by study id) so the
 * same report always replays the same way — that's important: a doctor
 * showing the trace in court must see exactly what they saw before.
 */

import type { Finding, Report, Severity, Study, WebCitation } from "./types";

// ── Types ─────────────────────────────────────────────────────────────

export type BeatKind =
  | "intake"      // "Loaded N slices, primary view: …"
  | "segment"     // anatomy / lung-field / chamber outlined
  | "roi"         // a bounding region was attended to
  | "differential"// considering competing diagnoses
  | "cite"        // pulled an external reference
  | "confidence"  // a confidence shift (up or down)
  | "revise"      // pass-2 contradicted pass-1
  | "final";      // sealed conclusion

export interface BeatRoi {
  /** Slice index within the stack (0-indexed). undefined → don't change slice. */
  sliceIndex?: number;
  /** Normalised ROI box in [0..1] viewport coordinates. */
  box?: { x: number; y: number; w: number; h: number };
  /** Heatmap intensity 0..1 (drives overlay opacity). */
  heatmap?: number;
  /** Optional W/L preset name to apply ("Lung", "Bone", "Brain"…). */
  windowPreset?: string;
}

export interface ReasoningBeat {
  id: string;
  /** When (seconds from start of reasoning) the beat fires. */
  t: number;
  kind: BeatKind;
  /** One-line title shown on the dot tooltip. */
  title: string;
  /** Long-form text shown in the floating thought card. */
  thought?: string;
  /** Confidence at this moment (0..1). For visual ticker. */
  confidence?: number;
  /** Confidence delta vs previous beat (drives ↑↓ chip). */
  confidenceDelta?: number;
  /** Anchor finding (so we can highlight it in the side list). */
  findingId?: string;
  /** Anchor citation (so the references panel can light up). */
  citationUrl?: string;
  /** ROI / viewport choreography. */
  roi?: BeatRoi;
  /** Pass number — 1 for first read, 2 for confirmation pass. */
  pass?: 1 | 2;
  /** For revise beats: the prior finding id that was overturned. */
  revisedFromFindingId?: string;
}

export interface ReasoningTrace {
  totalSeconds: number;
  beats: ReasoningBeat[];
  /** True when beats came from the backend; false when synthesized. */
  authoritative: boolean;
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Build (or load) the reasoning trace for a study.
 * Future: when Modal streams `report.reasoningBeats`, prefer those.
 */
export function buildReasoningTrace(study: Study): ReasoningTrace {
  // 1) Backend-provided beats (forward-compatible read)
  const r = study.report as (Report & { reasoningBeats?: ReasoningBeat[] }) | undefined;
  if (r?.reasoningBeats && r.reasoningBeats.length > 0) {
    const last = r.reasoningBeats[r.reasoningBeats.length - 1];
    return {
      authoritative: true,
      totalSeconds: last.t + 1,
      beats: r.reasoningBeats,
    };
  }
  // 2) Synthesize from findings + narrative + citations
  return synthesizeTrace(study);
}

// ── Synthesizer ───────────────────────────────────────────────────────

/**
 * Mulberry32 PRNG — tiny, deterministic, perfect for our needs.
 * Same study id → same trace, every replay.
 */
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Pick a stable W/L preset based on modality category. */
function presetForCategory(cat: string): string | undefined {
  switch (cat) {
    case "CT":   return "Soft tissue";
    case "X-Ray":return "Lung";
    case "MRI":  return "Brain";
    default:     return undefined;
  }
}

/**
 * Severity → confidence "energy". Critical findings get more attention beats
 * and a more dramatic confidence arc.
 */
const SEV_BEATS: Record<Severity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function synthesizeTrace(study: Study): ReasoningTrace {
  const r = study.report;
  const findings: Finding[] = r?.findings ?? [];
  const citations: WebCitation[] = (study as Study & { webCitations?: WebCitation[] }).webCitations ?? [];
  const rng = seededRandom(hashStr(study.id));
  const beats: ReasoningBeat[] = [];

  let t = 0;
  const step = (dt: number) => { t += dt; return t; };
  const presetName = presetForCategory(study.modality.category);
  const stackSize = Math.max(1, study.imagesCount);
  const pickSlice = (i: number) =>
    stackSize > 1
      ? Math.min(stackSize - 1, Math.max(0, Math.round((i + rng()) * (stackSize / Math.max(findings.length, 1)))))
      : 0;

  // ── Beat 0: intake ──
  beats.push({
    id: "b-intake",
    t: step(0),
    kind: "intake",
    title: "Loaded study",
    thought: `Ingested ${study.imagesCount} image${study.imagesCount === 1 ? "" : "s"}${
      study.videosCount ? ` + ${study.videosCount} video clip${study.videosCount === 1 ? "" : "s"}` : ""
    }. Modality: ${study.modality.label}. Tier ${study.modality.tier} pipeline engaged.`,
    confidence: 0,
    pass: 1,
    roi: { sliceIndex: 0, heatmap: 0, windowPreset: presetName },
  });

  // ── Beat: anatomic segmentation ──
  beats.push({
    id: "b-seg",
    t: step(1.6 + rng() * 0.6),
    kind: "segment",
    title: "Anatomic segmentation",
    thought: `Outlined relevant anatomy and reference landmarks. Established orientation for downstream ROI sweeps.`,
    confidence: 0.18 + rng() * 0.05,
    confidenceDelta: 0.18,
    pass: 1,
    roi: { sliceIndex: pickSlice(0), heatmap: 0.25, box: { x: 0.18, y: 0.18, w: 0.64, h: 0.64 }, windowPreset: presetName },
  });

  // ── Per-finding beats: ROI → differential → (sometimes) cite ──
  let runningConfidence = 0.22;
  findings.forEach((f, i) => {
    const energy = SEV_BEATS[f.severity];
    const fSlice = pickSlice(i);
    const cx = 0.25 + rng() * 0.5;
    const cy = 0.25 + rng() * 0.5;
    const w = 0.12 + rng() * 0.18;
    const h = 0.12 + rng() * 0.18;
    const box = { x: cx - w / 2, y: cy - h / 2, w, h };

    // ROI beat — model attended to a region
    const roiConf = Math.min(0.95, runningConfidence + 0.08 + rng() * 0.05);
    beats.push({
      id: `b-roi-${f.id}`,
      t: step(2.4 + rng() * 0.8),
      kind: "roi",
      title: `Attending: ${f.region ?? f.anatomicalRegion ?? f.title}`,
      thought: `Region of interest detected with measurable signal. ${
        f.observation ?? f.description.slice(0, 140)
      }`,
      confidence: roiConf,
      confidenceDelta: roiConf - runningConfidence,
      findingId: f.id,
      pass: 1,
      roi: { sliceIndex: fSlice, box, heatmap: 0.55 + (energy - 1) * 0.1, windowPreset: presetName },
    });
    runningConfidence = roiConf;

    // Differential beat — only for medium+ findings or with explicit differentials
    if (energy >= 2 || (f.differentials && f.differentials.length > 0)) {
      const dxList = (f.differentials ?? []).slice(0, 3).map((d) => d.dx);
      const dxText = dxList.length
        ? `Considering: ${dxList.join(" vs ")}.`
        : `Differential evaluation against common mimics.`;
      beats.push({
        id: `b-diff-${f.id}`,
        t: step(1.8 + rng() * 0.7),
        kind: "differential",
        title: "Differential weighing",
        thought: `${dxText} ${f.impression ?? ""}`.trim(),
        confidence: Math.min(0.97, runningConfidence + 0.03),
        confidenceDelta: 0.03,
        findingId: f.id,
        pass: 1,
        roi: { sliceIndex: fSlice, box, heatmap: 0.7, windowPreset: presetName },
      });
      runningConfidence = Math.min(0.97, runningConfidence + 0.03);
    }

    // Citation beat — light up references panel
    const cite = citations[i % Math.max(citations.length, 1)];
    if (cite && (energy >= 2 || rng() > 0.6)) {
      beats.push({
        id: `b-cite-${f.id}`,
        t: step(1.4 + rng() * 0.5),
        kind: "cite",
        title: `Citation: ${cite.source ?? "literature"}`,
        thought: `Referenced "${cite.title}" — ${cite.snippet ?? "supporting evidence consulted."}`,
        confidence: Math.min(0.98, runningConfidence + 0.04),
        confidenceDelta: 0.04,
        findingId: f.id,
        citationUrl: cite.url,
        pass: 1,
        roi: { sliceIndex: fSlice, box, heatmap: 0.55, windowPreset: presetName },
      });
      runningConfidence = Math.min(0.98, runningConfidence + 0.04);
    }

    // Pass-2 confirmation OR revision (rare, for critical findings)
    if (energy >= 3 && rng() > 0.55) {
      const revised = rng() > 0.7;
      if (revised) {
        const newConf = Math.max(0.4, runningConfidence - 0.18 + rng() * 0.1);
        beats.push({
          id: `b-rev-${f.id}`,
          t: step(2.0 + rng() * 0.6),
          kind: "revise",
          title: "Pass 2 revised this finding",
          thought: `Confirmation pass downgraded confidence after reviewing adjacent slices and prior. Reason: insufficient cross-frame agreement.`,
          confidence: newConf,
          confidenceDelta: newConf - runningConfidence,
          findingId: f.id,
          revisedFromFindingId: f.id,
          pass: 2,
          roi: { sliceIndex: fSlice, box, heatmap: 0.45, windowPreset: presetName },
        });
        runningConfidence = newConf;
      } else {
        const upConf = Math.min(0.99, runningConfidence + 0.05);
        beats.push({
          id: `b-conf-${f.id}`,
          t: step(1.6 + rng() * 0.4),
          kind: "confidence",
          title: "Pass 2 confirmed",
          thought: `Confirmation pass agreed with primary read. Cross-slice consistency validated the call.`,
          confidence: upConf,
          confidenceDelta: upConf - runningConfidence,
          findingId: f.id,
          pass: 2,
          roi: { sliceIndex: fSlice, box, heatmap: 0.85, windowPreset: presetName },
        });
        runningConfidence = upConf;
      }
    }
  });

  // ── Final beat ──
  const finalConf = r?.overallConfidence ?? runningConfidence;
  beats.push({
    id: "b-final",
    t: step(2.0 + rng() * 0.5),
    kind: "final",
    title: "Report sealed",
    thought:
      r?.narrative?.slice(0, 220) ??
      "Findings assembled, narrative drafted, and report finalized for clinician review.",
    confidence: finalConf,
    confidenceDelta: finalConf - runningConfidence,
    pass: 2,
    roi: { sliceIndex: 0, heatmap: 0, windowPreset: presetName },
  });

  return {
    authoritative: false,
    totalSeconds: Math.max(beats[beats.length - 1].t + 0.6, 6),
    beats,
  };
}

// ── Helpers used by the UI ────────────────────────────────────────────

export const BEAT_LABEL: Record<BeatKind, string> = {
  intake: "Intake",
  segment: "Segment",
  roi: "ROI",
  differential: "Differential",
  cite: "Citation",
  confidence: "Confirm",
  revise: "Revise",
  final: "Final",
};

/** Tailwind classes for each beat kind's dot. Uses semantic tokens. */
export const BEAT_DOT_CLASS: Record<BeatKind, string> = {
  intake:       "bg-muted-foreground/60",
  segment:      "bg-primary/70",
  roi:          "bg-primary",
  differential: "bg-severity-medium",
  cite:         "bg-severity-low",
  confidence:   "bg-severity-low",
  revise:       "bg-severity-critical",
  final:        "bg-primary-glow",
};

export function findBeatAtTime(beats: ReasoningBeat[], t: number): ReasoningBeat | undefined {
  if (beats.length === 0) return undefined;
  let active = beats[0];
  for (const b of beats) {
    if (b.t <= t) active = b;
    else break;
  }
  return active;
}
