// Smart free-text timeline parser for Compare Mode.
//
// Accepts inputs like:
//   "3 months ago", "2y", "14 days", "6h", "2 weeks back",
//   "today", "yesterday", "now", "baseline",
//   absolute dates: "2024-03-15", "15/03/2024", "March 15 2024".
//
// Returns a normalized {label, ageHours, absoluteDate?} so we can sort
// timepoints chronologically (oldest → newest = baseline → current).

export interface ParsedTimepoint {
  /** Original raw user input — preserved verbatim for display. */
  raw: string;
  /** Normalized human label (e.g. "3 months ago", "Baseline"). */
  label: string;
  /** Hours before now. 0 = today/now. Negative not allowed. */
  ageHours: number;
  /** Absolute ISO date if parsed from one, else undefined. */
  absoluteDate?: string;
  /** True if the parser was confident; false → still usable but warn user. */
  confident: boolean;
}

const UNIT_HOURS: Record<string, number> = {
  h: 1, hr: 1, hrs: 1, hour: 1, hours: 1,
  d: 24, day: 24, days: 24,
  w: 24 * 7, wk: 24 * 7, wks: 24 * 7, week: 24 * 7, weeks: 24 * 7,
  mo: 24 * 30, mon: 24 * 30, mos: 24 * 30, month: 24 * 30, months: 24 * 30,
  y: 24 * 365, yr: 24 * 365, yrs: 24 * 365, year: 24 * 365, years: 24 * 365,
};

const KEYWORDS: Array<{ re: RegExp; ageHours: number; label: string }> = [
  { re: /^\s*(now|today|current)\s*$/i, ageHours: 0, label: "Today" },
  { re: /^\s*baseline\s*$/i, ageHours: Number.POSITIVE_INFINITY, label: "Baseline" },
  { re: /^\s*yesterday\s*$/i, ageHours: 24, label: "Yesterday" },
  { re: /^\s*last\s+week\s*$/i, ageHours: 24 * 7, label: "Last week" },
  { re: /^\s*last\s+month\s*$/i, ageHours: 24 * 30, label: "Last month" },
  { re: /^\s*last\s+year\s*$/i, ageHours: 24 * 365, label: "Last year" },
];

export function parseTimelineInput(input: string): ParsedTimepoint | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;

  // 1. Keyword shortcuts
  for (const kw of KEYWORDS) {
    if (kw.re.test(raw)) {
      return {
        raw,
        label: kw.label,
        ageHours: kw.ageHours === Number.POSITIVE_INFINITY ? 24 * 365 * 100 : kw.ageHours,
        confident: true,
      };
    }
  }

  // 2. "<n><unit>" or "<n> <unit>" or "<n> <unit> ago/back"
  //    1y / 2 weeks ago / 14d / 3 months back
  const compact = raw.match(
    /^\s*(\d+(?:\.\d+)?)\s*([a-z]+)(?:\s+(?:ago|back|prior|previously))?\s*$/i,
  );
  if (compact) {
    const n = Number(compact[1]);
    const unit = compact[2].toLowerCase();
    const factor = UNIT_HOURS[unit];
    if (factor && n >= 0 && Number.isFinite(n)) {
      const ageHours = Math.round(n * factor);
      return {
        raw,
        label: prettyRelative(n, unit),
        ageHours,
        confident: true,
      };
    }
  }

  // 3. Absolute date attempts (ISO, dd/mm/yyyy, dd-mm-yyyy, "March 15 2024", etc.)
  const iso = raw.match(/^\s*(\d{4})-(\d{2})-(\d{2})\s*$/);
  if (iso) {
    return absoluteDateResult(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00`, raw);
  }
  const dmy = raw.match(/^\s*(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\s*$/);
  if (dmy) {
    const d = dmy[1].padStart(2, "0");
    const m = dmy[2].padStart(2, "0");
    return absoluteDateResult(`${dmy[3]}-${m}-${d}T00:00:00`, raw);
  }
  // Fallback: let JS try (covers "March 15 2024", "15 Mar 2024", etc.)
  const t = Date.parse(raw);
  if (!Number.isNaN(t)) {
    return absoluteDateResult(new Date(t).toISOString(), raw, false);
  }

  return null;
}

function absoluteDateResult(iso: string, raw: string, confident = true): ParsedTimepoint | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const ageMs = Date.now() - t;
  if (ageMs < 0) {
    // Future date — reject confidently
    return {
      raw,
      label: `Future date (${raw})`,
      ageHours: 0,
      absoluteDate: new Date(t).toISOString().slice(0, 10),
      confident: false,
    };
  }
  const ageHours = Math.round(ageMs / 3_600_000);
  return {
    raw,
    label: humanRelativeFromHours(ageHours, raw),
    ageHours,
    absoluteDate: new Date(t).toISOString().slice(0, 10),
    confident,
  };
}

function prettyRelative(n: number, unit: string): string {
  const u = UNIT_HOURS[unit] ? unit.replace(/s$/, "") : unit;
  const plural = n === 1 ? u : (u.endsWith("s") ? u : u + "s");
  if (n === 0) return "Today";
  return `${n} ${plural} ago`;
}

function humanRelativeFromHours(h: number, fallback: string): string {
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  if (d < 14) return `${d} day${d === 1 ? "" : "s"} ago`;
  const w = Math.round(d / 7);
  if (w < 9) return `${w} week${w === 1 ? "" : "s"} ago`;
  const mo = Math.round(d / 30);
  if (mo < 24) return `${mo} month${mo === 1 ? "" : "s"} ago`;
  const y = Math.round(d / 365);
  return `${y} year${y === 1 ? "" : "s"} ago (${fallback})`;
}

/** Sort timepoints oldest → newest. */
export function sortTimepoints<T extends { ageHours: number }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => b.ageHours - a.ageHours);
}
