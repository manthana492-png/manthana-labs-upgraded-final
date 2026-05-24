// Compare Mode wizard — longitudinal compare of 2-4 timepoints, SAME modality,
// SAME patient. Images only (PNG / JPEG / WebP / HEIC), max 4 per timepoint.
//
// Steps: setup → upload (per timepoint) → review & submit
// Tier: Pro & Pro+. Quota: flat 2 scans.

import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ImagePlus,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { MODALITIES } from "@/lib/modalities";
import { isLocked } from "@/lib/catalog";
import type { Modality } from "@/lib/types";
import {
  consumeCompareQuota,
  createAndUploadCompareStudy,
  MAX_FILES_PER_TIMEPOINT,
  MAX_TIMEPOINTS,
  MIN_TIMEPOINTS,
  startCompareAnalysis,
  validateCompareFile,
} from "@/lib/compareApi";
import {
  parseTimelineInput,
  type ParsedTimepoint,
} from "@/lib/timelineParser";

type Step = "setup" | "upload" | "review" | "submitting";

interface TimepointState {
  rawLabel: string;
  parsed: ParsedTimepoint | null;
  files: File[];
}

const ACCEPT_ATTR =
  "image/png,image/jpeg,image/jpg,image/webp,image/gif,image/heic";

const SUGGEST_LABELS = [
  "Today",
  "Yesterday",
  "1 week ago",
  "2 weeks ago",
  "1 month ago",
  "3 months ago",
  "6 months ago",
  "1 year ago",
];

type TimelineUnit = "h" | "d" | "w" | "mo" | "y";
const UNIT_OPTIONS: Array<{ value: TimelineUnit; label: string; plural: string }> = [
  { value: "h", label: "hour", plural: "hours" },
  { value: "d", label: "day", plural: "days" },
  { value: "w", label: "week", plural: "weeks" },
  { value: "mo", label: "month", plural: "months" },
  { value: "y", label: "year", plural: "years" },
];

/** Format structured input back into a parser-friendly string. */
function formatStructured(n: number, unit: TimelineUnit): string {
  if (n === 0) return "Today";
  const opt = UNIT_OPTIONS.find((u) => u.value === unit)!;
  const word = n === 1 ? opt.label : opt.plural;
  return `${n} ${word} ago`;
}

export function CompareWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("setup");
  const [patientRef, setPatientRef] = useState("");
  const [modality, setModality] = useState<Modality | null>(null);
  const [tpCount, setTpCount] = useState<2 | 3 | 4>(2);
  const [tps, setTps] = useState<TimepointState[]>([
    { rawLabel: "Today", parsed: parseTimelineInput("Today"), files: [] },
    { rawLabel: "3 months ago", parsed: parseTimelineInput("3 months ago"), files: [] },
  ]);
  const [activeTp, setActiveTp] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const availableModalities = useMemo(
    () => MODALITIES.filter((m) => !isLocked(m)),
    [],
  );

  const setTpCountSafe = (n: 2 | 3 | 4) => {
    setTpCount(n);
    setTps((prev) => {
      if (n === prev.length) return prev;
      if (n > prev.length) {
        const defaults = ["Today", "3 months ago", "6 months ago", "1 year ago"];
        return [
          ...prev,
          ...Array.from({ length: n - prev.length }, (_, i) => {
            const lbl = defaults[prev.length + i] ?? "";
            return {
              rawLabel: lbl,
              parsed: lbl ? parseTimelineInput(lbl) : null,
              files: [] as File[],
            };
          }),
        ];
      }
      return prev.slice(0, n);
    });
    if (activeTp >= n) setActiveTp(n - 1);
  };

  const updateTp = (idx: number, patch: Partial<TimepointState>) => {
    setTps((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  };

  const updateLabel = (idx: number, raw: string) => {
    updateTp(idx, { rawLabel: raw, parsed: parseTimelineInput(raw) });
  };

  // ── Client-side validation (matches server-side enforcement) ──
  const labelsAllParsed = tps.every((t) => !!t.parsed);
  const ageHoursList = tps.map((t) => t.parsed?.ageHours ?? -1);
  const labelsUnique = new Set(ageHoursList).size === ageHoursList.length;
  const labelsValid = labelsAllParsed && labelsUnique;
  const setupValid = !!modality && labelsValid;
  // Per-timepoint cap: 1–4 images, all valid type/size.
  const filesPerTpValid = tps.every(
    (t) => t.files.length >= 1 && t.files.length <= MAX_FILES_PER_TIMEPOINT,
  );
  const allFilesAccepted = tps.every((t) =>
    t.files.every((f) => validateCompareFile(f) === null),
  );
  const uploadValid = filesPerTpValid && allFilesAccepted;
  const tpCountValid =
    tps.length >= MIN_TIMEPOINTS && tps.length <= MAX_TIMEPOINTS;

  const handleSubmit = async () => {
    if (!setupValid || !uploadValid || !modality) return;
    setSubmitting(true);
    setStep("submitting");
    try {
      const quota = await consumeCompareQuota();
      if (!quota.allowed) {
        toast.error(
          quota.reason === "scan_quota_exceeded"
            ? "Monthly scan quota exhausted — upgrade to add capacity."
            : `Quota check failed: ${quota.reason ?? "unknown"}`,
        );
        setSubmitting(false);
        setStep("review");
        return;
      }

      const result = await createAndUploadCompareStudy({
        patientRefShort: patientRef.trim() || undefined,
        modality,
        timepoints: tps.map((t) => ({ parsed: t.parsed!, files: t.files })),
      });

      await startCompareAnalysis(result.studyId);

      toast.success("Compare analysis started", {
        description:
          "Modality lock + per-timepoint analysis + interval change synthesis. Redirecting…",
      });
      navigate(`/app/study/${result.studyId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Could not start compare study", { description: msg });
      setSubmitting(false);
      setStep("review");
    }
  };

  return (
    <div className="space-y-6">
      <Stepper step={step} />

      {step === "setup" && (
        <SetupStep
          patientRef={patientRef}
          setPatientRef={setPatientRef}
          modality={modality}
          setModality={setModality}
          availableModalities={availableModalities}
          tpCount={tpCount}
          setTpCount={setTpCountSafe}
          tps={tps}
          updateLabel={updateLabel}
          onNext={() => {
            if (!modality) {
              toast.error("Pick a modality first — every timepoint must use the same modality.");
              return;
            }
            if (!tpCountValid) {
              toast.error(`Compare Mode needs ${MIN_TIMEPOINTS}–${MAX_TIMEPOINTS} timepoints.`);
              return;
            }
            if (!labelsAllParsed) {
              toast.error(
                "Each timepoint needs a parseable timeline (e.g. '3 months ago', '14 days', '2024-03-15').",
              );
              return;
            }
            if (!labelsUnique) {
              toast.error(
                "Two timepoints resolve to the same age — make each one a distinct interval.",
              );
              return;
            }
            setStep("upload");
            setActiveTp(0);
          }}
        />
      )}

      {step === "upload" && (
        <UploadStep
          modality={modality!}
          tps={tps}
          activeTp={activeTp}
          setActiveTp={setActiveTp}
          updateTp={updateTp}
          onBack={() => setStep("setup")}
          onNext={() => {
            const empty = tps.findIndex((t) => t.files.length === 0);
            if (empty !== -1) {
              toast.error(`Timepoint T${empty + 1} has no images. Add at least one.`);
              return;
            }
            const overflow = tps.findIndex((t) => t.files.length > MAX_FILES_PER_TIMEPOINT);
            if (overflow !== -1) {
              toast.error(
                `Timepoint T${overflow + 1} exceeds ${MAX_FILES_PER_TIMEPOINT} images. Remove extras.`,
              );
              return;
            }
            if (!allFilesAccepted) {
              toast.error(
                "One or more files are not valid images — check the upload list and remove rejects.",
              );
              return;
            }
            setStep("review");
          }}
        />
      )}

      {step === "review" && (
        <ReviewStep
          modality={modality!}
          patientRef={patientRef}
          tps={tps}
          onBack={() => setStep("upload")}
          onSubmit={handleSubmit}
          submitting={submitting}
        />
      )}

      {step === "submitting" && <SubmittingState />}
    </div>
  );
}

// ─────────────────────────── Stepper ───────────────────────────

function Stepper({ step }: { step: Step }) {
  const items: { key: Step; label: string }[] = [
    { key: "setup", label: "Modality & timepoints" },
    { key: "upload", label: "Per-timepoint upload" },
    { key: "review", label: "Review & submit" },
    { key: "submitting", label: "Submit" },
  ];
  const activeIdx = items.findIndex((i) => i.key === step);
  return (
    <ol className="flex items-center gap-1 text-xs flex-wrap">
      {items.map((it, idx) => {
        const isActive = idx === activeIdx;
        const isDone = idx < activeIdx;
        return (
          <li key={it.key} className="flex items-center gap-1">
            <span
              className={
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border " +
                (isActive
                  ? "bg-primary text-primary-foreground border-primary"
                  : isDone
                  ? "bg-tier-nvidia-soft text-tier-nvidia-foreground border-tier-nvidia-border/60"
                  : "bg-muted text-muted-foreground border-border")
              }
            >
              <span className="font-mono text-[0.65rem]">{idx + 1}</span>
              {it.label}
              {isDone && <CheckCircle2 className="h-3 w-3" />}
            </span>
            {idx < items.length - 1 && (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ─────────────────────────── Step 1: Setup ───────────────────────────

function SetupStep({
  patientRef,
  setPatientRef,
  modality,
  setModality,
  availableModalities,
  tpCount,
  setTpCount,
  tps,
  updateLabel,
  onNext,
}: {
  patientRef: string;
  setPatientRef: (v: string) => void;
  modality: Modality | null;
  setModality: (m: Modality | null) => void;
  availableModalities: Modality[];
  tpCount: 2 | 3 | 4;
  setTpCount: (n: 2 | 3 | 4) => void;
  tps: TimepointState[];
  updateLabel: (idx: number, raw: string) => void;
  onNext: () => void;
}) {
  return (
    <div className="surface-clinical p-5 md:p-6 space-y-5">
      <div>
        <h2 className="font-display text-xl tracking-tight">
          Patient, modality &amp; timepoints
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Pick ONE modality and {MIN_TIMEPOINTS}–{MAX_TIMEPOINTS} timepoints for the SAME
          patient. Manthana‑Labs verifies every upload matches the locked modality and
          rejects mismatches automatically.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="patient-ref">Patient reference (short)</Label>
          <Input
            id="patient-ref"
            value={patientRef}
            onChange={(e) => setPatientRef(e.target.value)}
            placeholder="e.g. MRN-1234 (no PHI)"
            maxLength={64}
            className="mt-1.5"
          />
          <p className="text-[0.7rem] text-muted-foreground mt-1">
            Optional. Stored as entered — keep it PHI-free.
          </p>
        </div>
        <div>
          <Label>How many timepoints?</Label>
          <div className="mt-1.5 flex gap-2">
            {([2, 3, 4] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setTpCount(n)}
                className={
                  "flex-1 h-10 rounded-md border text-sm font-medium transition focus-ring " +
                  (tpCount === n
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-surface-raised border-border hover:border-primary/40")
                }
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <Label>Modality (locked across all timepoints)</Label>
        <Select
          value={modality?.slug ?? ""}
          onValueChange={(slug) => {
            const m = availableModalities.find((mm) => mm.slug === slug) ?? null;
            setModality(m);
          }}
        >
          <SelectTrigger className="mt-1.5">
            <SelectValue placeholder="Choose the modality every timepoint will use…" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {availableModalities.map((m) => (
              <SelectItem key={m.slug} value={m.slug}>
                <span className="font-medium">{m.label}</span>
                <span className="ml-2 text-[0.7rem] text-muted-foreground">
                  {m.category}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[0.7rem] text-muted-foreground mt-1">
          Auto-detect runs on every uploaded image. Mismatches are rejected with a reason.
        </p>
      </div>

      <div className="space-y-3">
        <Label>Timepoint timeline labels</Label>
        <p className="text-[0.7rem] text-muted-foreground">
          Type free-text like <span className="font-mono">"Today"</span>,{" "}
          <span className="font-mono">"3 months ago"</span>,{" "}
          <span className="font-mono">"14 days"</span>,{" "}
          <span className="font-mono">"6h"</span>, or an absolute date{" "}
          <span className="font-mono">"2024-03-15"</span>.
        </p>
        {tps.map((t, i) => (
          <TimepointLabelRow
            key={i}
            index={i}
            value={t.rawLabel}
            parsed={t.parsed}
            onChange={(v) => updateLabel(i, v)}
          />
        ))}
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={onNext}>
          Continue to uploads <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

function TimepointLabelRow({
  index,
  value,
  parsed,
  onChange,
}: {
  index: number;
  value: string;
  parsed: ParsedTimepoint | null;
  onChange: (v: string) => void;
}) {
  // Local state for the structured (number + unit) picker. Free-text remains source of truth.
  const [structN, setStructN] = useState<string>("");
  const [structU, setStructU] = useState<TimelineUnit>("mo");

  const applyStructured = () => {
    const n = Number(structN);
    if (!Number.isFinite(n) || n < 0) {
      return;
    }
    onChange(formatStructured(n, structU));
  };

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <span className="font-display text-sm">T{index + 1}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <Input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder='e.g. "Today", "3 months ago", "2024-03-15"'
              className="h-9"
            />
          </div>

          {/* Structured number + unit picker (days / hours / months / years). */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              Or pick:
            </span>
            <Input
              type="number"
              min={0}
              max={9999}
              value={structN}
              onChange={(e) => setStructN(e.target.value)}
              onBlur={applyStructured}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyStructured();
                }
              }}
              placeholder="3"
              className="h-8 w-20"
            />
            <Select
              value={structU}
              onValueChange={(v) => {
                setStructU(v as TimelineUnit);
                if (structN) onChange(formatStructured(Number(structN), v as TimelineUnit));
              }}
            >
              <SelectTrigger className="h-8 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIT_OPTIONS.map((u) => (
                  <SelectItem key={u.value} value={u.value}>
                    {u.plural}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-[0.65rem] text-muted-foreground">ago</span>
            <button
              type="button"
              onClick={applyStructured}
              className="text-[0.7rem] px-2 py-1 rounded-md border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition"
            >
              Apply
            </button>
          </div>

          {parsed ? (
            <div className="mt-1.5 text-[0.7rem] text-muted-foreground flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-raised px-2 py-0.5">
                Normalised: <span className="font-medium text-foreground">{parsed.label}</span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-raised px-2 py-0.5 font-mono">
                ~{parsed.ageHours}h old
              </span>
              {parsed.absoluteDate && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-raised px-2 py-0.5">
                  Date: <span className="font-mono">{parsed.absoluteDate}</span>
                </span>
              )}
              {!parsed.confident && (
                <span className="inline-flex items-center gap-1 rounded-full border border-warning-critical-border/60 bg-warning-critical-soft text-warning-critical-foreground px-2 py-0.5">
                  Low-confidence parse
                </span>
              )}
            </div>
          ) : value.trim() ? (
            <div className="mt-1.5 text-[0.7rem] text-warning-critical">
              Couldn't parse this — try "3 months ago", "14d", or a date "2024-03-15".
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {SUGGEST_LABELS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className="text-[0.7rem] px-2 py-0.5 rounded-full border border-border bg-surface-raised hover:border-primary/40 transition"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────── Step 2: Upload per timepoint ───────────────────────────

function UploadStep({
  modality,
  tps,
  activeTp,
  setActiveTp,
  updateTp,
  onBack,
  onNext,
}: {
  modality: Modality;
  tps: TimepointState[];
  activeTp: number;
  setActiveTp: (n: number) => void;
  updateTp: (idx: number, patch: Partial<TimepointState>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const tp = tps[activeTp];

  const addFiles = (newFiles: FileList | File[]) => {
    const incoming = Array.from(newFiles);
    const accepted: File[] = [];
    for (const f of incoming) {
      const err = validateCompareFile(f);
      if (err) {
        toast.error(err);
        continue;
      }
      accepted.push(f);
    }
    const combined = [...tp.files, ...accepted].slice(0, MAX_FILES_PER_TIMEPOINT);
    if (tp.files.length + accepted.length > MAX_FILES_PER_TIMEPOINT) {
      toast.warning(
        `Only ${MAX_FILES_PER_TIMEPOINT} images per timepoint — extras dropped.`,
      );
    }
    updateTp(activeTp, { files: combined });
  };

  const removeFile = (idx: number) => {
    updateTp(activeTp, { files: tp.files.filter((_, i) => i !== idx) });
  };

  return (
    <div className="surface-clinical p-5 md:p-6 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-xl tracking-tight">
            Upload images per timepoint
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Locked modality:{" "}
            <span className="font-medium text-foreground">{modality.label}</span>{" "}
            · up to {MAX_FILES_PER_TIMEPOINT} images per timepoint · max 20&nbsp;MB each.
          </p>
        </div>
        <span className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">
          Mismatches will be auto-rejected with a reason
        </span>
      </div>

      {/* Timeline pill row */}
      <div className="flex gap-2 flex-wrap">
        {tps.map((t, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActiveTp(i)}
            className={
              "px-3 py-2 rounded-lg text-sm border transition focus-ring text-left " +
              (i === activeTp
                ? "bg-primary text-primary-foreground border-primary"
                : t.files.length > 0
                ? "bg-tier-nvidia-soft text-tier-nvidia-foreground border-tier-nvidia-border/60"
                : "bg-surface-raised text-foreground border-border hover:border-primary/40")
            }
          >
            <span className="font-mono text-[0.7rem] mr-1.5">T{i + 1}</span>
            {t.parsed?.label ?? t.rawLabel}
            <span className="ml-2 text-[0.7rem] opacity-80">
              {t.files.length}/{MAX_FILES_PER_TIMEPOINT}
            </span>
          </button>
        ))}
      </div>

      {/* Drop zone for active timepoint */}
      <div className="rounded-xl border-2 border-dashed border-border bg-surface-raised/40 p-6 text-center">
        <ImagePlus className="h-8 w-8 mx-auto text-primary mb-2" strokeWidth={2} />
        <div className="font-medium">
          {modality.label} · {tp.parsed?.label ?? tp.rawLabel}
        </div>
        <p className="text-xs text-muted-foreground mt-1 mb-4">
          PNG · JPEG · WebP · HEIC · max 20 MB · up to{" "}
          {MAX_FILES_PER_TIMEPOINT} images
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4 mr-1.5" /> Choose images
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => cameraInputRef.current?.click()}
          >
            <Camera className="h-4 w-4 mr-1.5" /> Camera snap
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_ATTR}
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              if (cameraInputRef.current) cameraInputRef.current.value = "";
            }}
          />
        </div>
      </div>

      {/* Thumbnails */}
      {tp.files.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {tp.files.map((f, i) => {
            const url = URL.createObjectURL(f);
            return (
              <div
                key={i}
                className="relative rounded-lg overflow-hidden border border-border bg-black"
              >
                <img
                  src={url}
                  alt={f.name}
                  className="block w-full h-28 object-cover"
                  onLoad={() => URL.revokeObjectURL(url)}
                />
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="absolute top-1 right-1 h-6 w-6 rounded-full bg-background/80 border border-border text-foreground hover:bg-warning-critical hover:text-white transition flex items-center justify-center"
                  title="Remove"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
                <div className="absolute bottom-0 inset-x-0 bg-background/80 px-2 py-0.5 text-[0.65rem] truncate">
                  {f.name}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Button onClick={onNext}>
          Review &amp; submit <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────── Step 3: Review ───────────────────────────

function ReviewStep({
  modality,
  patientRef,
  tps,
  onBack,
  onSubmit,
  submitting,
}: {
  modality: Modality;
  patientRef: string;
  tps: TimepointState[];
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  // Sort oldest → newest for display
  const ordered = [...tps]
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (b.t.parsed?.ageHours ?? 0) - (a.t.parsed?.ageHours ?? 0));

  return (
    <div className="surface-clinical p-5 md:p-6 space-y-5">
      <div>
        <h2 className="font-display text-xl tracking-tight">Review &amp; submit</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Confirms 2 scan units will be consumed (flat rate). Modality is auto-verified
          and mismatches will be rejected.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
            Modality
          </div>
          <div className="font-medium mt-0.5">{modality.label}</div>
          <div className="text-[0.7rem] text-muted-foreground">{modality.category}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
            Patient ref
          </div>
          <div className="font-medium mt-0.5">{patientRef || "—"}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
            Quota
          </div>
          <div className="font-medium mt-0.5">2 scan units (flat)</div>
        </div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
          Timeline (oldest → newest)
        </div>
        <ol className="space-y-2">
          {ordered.map(({ t, i }, k) => (
            <li
              key={i}
              className="rounded-lg border border-border bg-surface p-3 flex items-center gap-3"
            >
              <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <span className="font-display text-xs">{k + 1}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{t.parsed?.label ?? t.rawLabel}</div>
                <div className="text-[0.7rem] text-muted-foreground">
                  {t.files.length} image{t.files.length === 1 ? "" : "s"}
                  {t.parsed?.absoluteDate && (
                    <span className="ml-2 font-mono">{t.parsed.absoluteDate}</span>
                  )}
                </div>
              </div>
              <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                T{i + 1}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack} disabled={submitting}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Button onClick={onSubmit} disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Submitting…
            </>
          ) : (
            <>Run compare analysis</>
          )}
        </Button>
      </div>
    </div>
  );
}

function SubmittingState() {
  return (
    <div className="surface-clinical p-10 text-center space-y-3">
      <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
      <div className="font-display text-lg tracking-tight">
        Uploading timepoints &amp; starting compare analysis…
      </div>
      <p className="text-sm text-muted-foreground">
        You'll be redirected to the live progress view in a moment.
      </p>
    </div>
  );
}
