// Multi-Modality Patient Study wizard — 2-to-4 different investigations
// for the same patient → unified AI report.
//
// Steps: setup → upload (per leg) → combined Q/A → submit
// Files supported: PNG / JPEG / WebP / GIF / HEIC / PDF / DOC / DOCX (≤20 MB).
// Camera snap = same image input. Max 4 files per leg.
//
// Tier gate: Pro & Pro+ only (enforced both here + in the edge function).
// Quota: consumes 2 scan units flat regardless of leg count.

import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Camera, FileText, ImagePlus, Loader2, Plus, Trash2, Upload, X,
  CheckCircle2, ChevronRight, ChevronLeft, Layers, Sparkles, Wand2,
} from "lucide-react";
import { MODALITIES, findModality } from "@/lib/modalities";
import { isLocked } from "@/lib/catalog";
import type { Modality } from "@/lib/types";
import {
  createAndUploadMultiStudy,
  startMultiAnalysis,
  consumeMultiModalityQuota,
  validateLegFile,
  detectMultiModalities,
  MAX_FILES_PER_LEG,
  MAX_LEGS,
  MIN_LEGS,
} from "@/lib/multiModalityApi";

type Step = "setup" | "autoUpload" | "review" | "upload" | "qa" | "submitting";
type Mode = "auto" | "manual";

interface LegState {
  modality: Modality | null;
  files: File[];
}

const ACCEPT_ATTR =
  "image/png,image/jpeg,image/jpg,image/webp,image/gif,image/heic,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const COMBINED_QA = [
  { id: "indication", label: "Primary clinical indication", helper: "Suspected condition or symptom prompting the investigations.", required: true, kind: "text" as const },
  { id: "age", label: "Patient age (years)", required: true, kind: "number" as const },
  { id: "sex", label: "Patient sex", required: true, kind: "select" as const, options: ["female", "male", "other / prefer not to say"] },
  { id: "duration", label: "Symptom duration", required: true, kind: "select" as const, options: ["<24 hours", "1–7 days", "1–4 weeks", ">1 month", ">3 months"] },
  { id: "comorbid", label: "Significant comorbidities", helper: "Diabetes, immunosuppression, malignancy, etc. — leave blank if none.", required: false, kind: "text" as const },
  { id: "meds", label: "Current relevant medications", required: false, kind: "text" as const },
  { id: "prior_workup", label: "Prior workup / labs / imaging", required: false, kind: "text" as const },
  { id: "timeline", label: "Order of investigations & timeline", helper: "e.g. CXR first → CT 2 days later → ECG today.", required: false, kind: "text" as const },
  { id: "cross_concern", label: "Why are multiple modalities being correlated?", helper: "What clinical question are you trying to answer across them?", required: true, kind: "text" as const },
];

const AUTO_MAX_FILES = 16;

export function MultiModalityWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("setup");
  const [mode, setMode] = useState<Mode>("auto");
  const [patientRef, setPatientRef] = useState("");
  const [legCount, setLegCount] = useState<2 | 3 | 4>(2);
  const [legs, setLegs] = useState<LegState[]>([
    { modality: null, files: [] },
    { modality: null, files: [] },
  ]);
  const [activeLeg, setActiveLeg] = useState(0);
  const [autoFiles, setAutoFiles] = useState<File[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [qa, setQa] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const availableModalities = useMemo(
    () => MODALITIES.filter((m) => !isLocked(m)),
    [],
  );

  const setLegCountSafe = (n: 2 | 3 | 4) => {
    setLegCount(n);
    setLegs((prev) => {
      if (n === prev.length) return prev;
      if (n > prev.length) {
        return [
          ...prev,
          ...Array.from({ length: n - prev.length }, () => ({
            modality: null as Modality | null,
            files: [] as File[],
          })),
        ];
      }
      return prev.slice(0, n);
    });
    if (activeLeg >= n) setActiveLeg(n - 1);
  };

  const updateLeg = (idx: number, patch: Partial<LegState>) => {
    setLegs((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const setupValid =
    legs.length >= MIN_LEGS &&
    legs.length <= MAX_LEGS &&
    legs.every((l) => !!l.modality) &&
    new Set(legs.map((l) => l.modality?.slug)).size === legs.length;

  const uploadValid = legs.every((l) => l.files.length > 0);

  const qaValid = COMBINED_QA.every(
    (q) => !q.required || (qa[q.id] && qa[q.id].trim().length > 0),
  );

  const handleSubmit = async () => {
    if (!setupValid || !uploadValid || !qaValid) return;
    setSubmitting(true);
    setStep("submitting");
    try {
      // 1. Quota gate — consume 2 scan units up front.
      const quota = await consumeMultiModalityQuota();
      if (!quota.allowed) {
        toast.error(
          quota.reason === "scan_quota_exceeded"
            ? "Monthly scan quota exhausted — upgrade to add capacity."
            : `Quota check failed: ${quota.reason ?? "unknown"}`,
        );
        setSubmitting(false);
        setStep("qa");
        return;
      }

      // 2. Upload all legs + persist combined QA.
      const result = await createAndUploadMultiStudy({
        patientRefShort: patientRef.trim() || undefined,
        legs: legs.map((l) => ({ modality: l.modality!, files: l.files })),
        combinedQA: qa,
      });

      // 3. Trigger analysis.
      await startMultiAnalysis(result.studyId);

      toast.success("Multi-modality analysis started", {
        description: "You'll be redirected to the live progress view.",
      });
      navigate(`/app/study/${result.studyId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Could not start multi-modality study", { description: msg });
      setSubmitting(false);
      setStep("qa");
    }
  };

  const runDetection = async (filesToDetect: File[]) => {
    if (filesToDetect.length < 2) {
      toast.error("Add at least 2 files for auto-detect.");
      return;
    }
    setDetecting(true);
    try {
      const { groups, requiresManual } = await detectMultiModalities(filesToDetect);
      if (!groups || groups.length === 0) {
        toast.warning("Couldn't auto-detect modalities — switching to manual.");
        setMode("manual");
        // Seed manual legs with the bulk files in leg 1, user reorganises.
        setLegs([
          { modality: null, files: filesToDetect.slice(0, MAX_FILES_PER_LEG) },
          { modality: null, files: [] },
        ]);
        setLegCount(2);
        setStep("setup");
        return;
      }

      const proposed: LegState[] = groups.slice(0, MAX_LEGS).map((g) => {
        const m = findModality(g.modalitySlug) ?? null;
        const legFiles = g.fileIndexes
          .map((i) => filesToDetect[i])
          .filter((f): f is File => !!f)
          .slice(0, MAX_FILES_PER_LEG);
        return { modality: m, files: legFiles };
      }).filter((l) => l.files.length > 0);

      // Ensure ≥ MIN_LEGS by splitting the largest if needed (rare).
      while (proposed.length < MIN_LEGS) {
        proposed.push({ modality: null, files: [] });
      }

      setLegs(proposed);
      setLegCount(Math.min(MAX_LEGS, Math.max(MIN_LEGS, proposed.length)) as 2 | 3 | 4);
      setStep("review");
      if (requiresManual) {
        toast.warning("Low confidence — please review each leg before continuing.");
      } else {
        toast.success(`Detected ${proposed.length} modalities — review and confirm.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Auto-detect failed";
      toast.error("Auto-detect unavailable", { description: msg });
      // Fall back to manual with the dropped files preserved.
      setMode("manual");
      setLegs([
        { modality: null, files: filesToDetect.slice(0, MAX_FILES_PER_LEG) },
        { modality: null, files: [] },
      ]);
      setLegCount(2);
      setStep("setup");
    } finally {
      setDetecting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Stepper step={step} mode={mode} />

      {step === "setup" && (
        <SetupStep
          mode={mode}
          setMode={setMode}
          patientRef={patientRef}
          setPatientRef={setPatientRef}
          legCount={legCount}
          setLegCount={setLegCountSafe}
          legs={legs}
          updateLeg={updateLeg}
          availableModalities={availableModalities}
          onNext={() => {
            if (mode === "auto") {
              setStep("autoUpload");
              return;
            }
            if (!setupValid) {
              toast.error("Pick a unique modality for each leg before continuing.");
              return;
            }
            setStep("upload");
            setActiveLeg(0);
          }}
        />
      )}

      {step === "autoUpload" && (
        <AutoUploadStep
          files={autoFiles}
          setFiles={setAutoFiles}
          detecting={detecting}
          onBack={() => setStep("setup")}
          onDetect={() => runDetection(autoFiles)}
        />
      )}

      {step === "review" && (
        <ReviewStep
          legs={legs}
          updateLeg={updateLeg}
          setLegs={setLegs}
          availableModalities={availableModalities}
          onBack={() => setStep("autoUpload")}
          onNext={() => {
            if (!setupValid) {
              toast.error("Each leg needs a unique modality.");
              return;
            }
            if (!uploadValid) {
              toast.error("Each leg needs at least one file.");
              return;
            }
            setStep("qa");
          }}
          onRedetect={() => runDetection(autoFiles)}
          detecting={detecting}
        />
      )}

      {step === "upload" && (
        <UploadStep
          legs={legs}
          activeLeg={activeLeg}
          setActiveLeg={setActiveLeg}
          updateLeg={updateLeg}
          onBack={() => setStep("setup")}
          onNext={() => {
            if (!uploadValid) {
              toast.error("Each leg needs at least one file.");
              return;
            }
            setStep("qa");
          }}
        />
      )}

      {step === "qa" && (
        <CombinedQAStep
          qa={qa}
          setQa={setQa}
          onBack={() => setStep(mode === "auto" ? "review" : "upload")}
          onSubmit={handleSubmit}
          canSubmit={qaValid && !submitting}
          submitting={submitting}
        />
      )}

      {step === "submitting" && <SubmittingState />}
    </div>
  );
}

// ─────────────────────────── Stepper ───────────────────────────

function Stepper({ step, mode }: { step: Step; mode: Mode }) {
  const items: { key: Step; label: string }[] = mode === "auto"
    ? [
      { key: "setup", label: "Patient" },
      { key: "autoUpload", label: "Bulk upload" },
      { key: "review", label: "Review legs" },
      { key: "qa", label: "Combined Q/A" },
      { key: "submitting", label: "Submit" },
    ]
    : [
      { key: "setup", label: "Patient & legs" },
      { key: "upload", label: "Per-modality upload" },
      { key: "qa", label: "Combined Q/A" },
      { key: "submitting", label: "Submit" },
    ];
  const activeIdx = items.findIndex((i) => i.key === step);
  return (
    <ol className="flex items-center gap-1 text-xs">
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
            {idx < items.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          </li>
        );
      })}
    </ol>
  );
}

// ─────────────────────────── Step 1: Setup ───────────────────────────

function SetupStep({
  mode, setMode,
  patientRef, setPatientRef,
  legCount, setLegCount,
  legs, updateLeg, availableModalities,
  onNext,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  patientRef: string;
  setPatientRef: (v: string) => void;
  legCount: 2 | 3 | 4;
  setLegCount: (n: 2 | 3 | 4) => void;
  legs: LegState[];
  updateLeg: (idx: number, patch: Partial<LegState>) => void;
  availableModalities: Modality[];
  onNext: () => void;
}) {
  return (
    <div className="surface-clinical p-5 md:p-6 space-y-5">
      <div>
        <h2 className="font-display text-xl tracking-tight">Patient & investigations</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {mode === "auto"
            ? "Drop all files in one go — the AI will detect each modality and group them."
            : `Pick ${MIN_LEGS}–${MAX_LEGS} different investigations for the same patient.`}
        </p>
      </div>

      {/* Mode toggle */}
      <div className="grid sm:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode("auto")}
          className={
            "rounded-xl border p-4 text-left transition focus-ring " +
            (mode === "auto"
              ? "border-primary bg-primary/5"
              : "border-border bg-surface-raised hover:border-primary/40")
          }
        >
          <div className="flex items-center gap-2 mb-1">
            <Wand2 className="h-4 w-4 text-primary" />
            <span className="font-medium">Auto-detect (recommended)</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Drop up to {AUTO_MAX_FILES} files — AI clusters them into legs.
          </p>
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={
            "rounded-xl border p-4 text-left transition focus-ring " +
            (mode === "manual"
              ? "border-primary bg-primary/5"
              : "border-border bg-surface-raised hover:border-primary/40")
          }
        >
          <div className="flex items-center gap-2 mb-1">
            <Layers className="h-4 w-4 text-primary" />
            <span className="font-medium">Manual</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Choose each modality and upload its files separately.
          </p>
        </button>
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
            Optional. Stored exactly as entered — keep it PHI-free.
          </p>
        </div>
        {mode === "manual" && (
          <div>
            <Label>How many modalities?</Label>
            <div className="mt-1.5 flex gap-2">
              {([2, 3, 4] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setLegCount(n)}
                  className={
                    "flex-1 h-10 rounded-md border text-sm font-medium transition focus-ring " +
                    (legCount === n
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-surface-raised border-border hover:border-primary/40")
                  }
                >
                  {n} legs
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {mode === "manual" && (
        <div className="space-y-3">
          {legs.map((leg, i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-surface p-4 flex flex-col sm:flex-row sm:items-center gap-3"
            >
              <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <span className="font-display text-sm">L{i + 1}</span>
              </div>
              <div className="flex-1 min-w-0">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Leg {i + 1} modality
                </Label>
                <Select
                  value={leg.modality?.slug ?? ""}
                  onValueChange={(slug) => {
                    const m = availableModalities.find((mm) => mm.slug === slug) ?? null;
                    updateLeg(i, { modality: m });
                  }}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Choose a modality…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {availableModalities.map((m) => (
                      <SelectItem
                        key={m.slug}
                        value={m.slug}
                        disabled={legs.some((other, idx) => idx !== i && other.modality?.slug === m.slug)}
                      >
                        <span className="font-medium">{m.label}</span>
                        <span className="ml-2 text-[0.7rem] text-muted-foreground">{m.category}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end pt-2">
        <Button onClick={onNext}>
          {mode === "auto"
            ? <>Continue to bulk upload <ChevronRight className="h-4 w-4 ml-1" /></>
            : <>Continue to uploads <ChevronRight className="h-4 w-4 ml-1" /></>}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────── Step 2: Upload per leg ───────────────────────────

function UploadStep({
  legs, activeLeg, setActiveLeg, updateLeg, onBack, onNext,
}: {
  legs: LegState[];
  activeLeg: number;
  setActiveLeg: (n: number) => void;
  updateLeg: (idx: number, patch: Partial<LegState>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const leg = legs[activeLeg];

  const addFiles = (newFiles: FileList | File[]) => {
    const incoming = Array.from(newFiles);
    const accepted: File[] = [];
    for (const f of incoming) {
      const err = validateLegFile(f);
      if (err) {
        toast.error(err);
        continue;
      }
      accepted.push(f);
    }
    const combined = [...leg.files, ...accepted].slice(0, MAX_FILES_PER_LEG);
    if (leg.files.length + accepted.length > MAX_FILES_PER_LEG) {
      toast.warning(`Only ${MAX_FILES_PER_LEG} files per leg — extras dropped.`);
    }
    updateLeg(activeLeg, { files: combined });
  };

  const removeFile = (idx: number) => {
    updateLeg(activeLeg, { files: leg.files.filter((_, i) => i !== idx) });
  };

  const allLegsHaveFiles = legs.every((l) => l.files.length > 0);

  return (
    <div className="surface-clinical p-5 md:p-6 space-y-5">
      <div>
        <h2 className="font-display text-xl tracking-tight">Upload files per modality</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Up to {MAX_FILES_PER_LEG} files per leg · images, PDF, DOC, or camera snap · max 20 MB each.
        </p>
      </div>

      {/* Leg tabs */}
      <div className="flex gap-2 flex-wrap">
        {legs.map((l, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActiveLeg(i)}
            className={
              "px-3 py-2 rounded-lg text-sm border transition focus-ring " +
              (i === activeLeg
                ? "bg-primary text-primary-foreground border-primary"
                : l.files.length > 0
                ? "bg-tier-nvidia-soft text-tier-nvidia-foreground border-tier-nvidia-border/60"
                : "bg-surface-raised text-foreground border-border hover:border-primary/40")
            }
          >
            <span className="font-mono text-[0.7rem] mr-1.5">L{i + 1}</span>
            {l.modality?.label ?? "—"}
            <span className="ml-2 text-[0.7rem] opacity-80">{l.files.length}/{MAX_FILES_PER_LEG}</span>
          </button>
        ))}
      </div>

      {/* Active leg drop zone */}
      <div className="rounded-xl border-2 border-dashed border-border bg-surface-raised/40 p-6 text-center">
        <ImagePlus className="h-8 w-8 mx-auto text-primary mb-2" strokeWidth={2} />
        <div className="font-medium">{leg.modality?.label ?? "Pick a modality first"}</div>
        <p className="text-xs text-muted-foreground mt-1 mb-4">
          PNG · JPEG · WebP · HEIC · PDF · DOC / DOCX · max 20 MB · {MAX_FILES_PER_LEG} files
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1.5" /> Choose files
          </Button>
          <Button variant="outline" size="sm" onClick={() => cameraInputRef.current?.click()}>
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

      {/* File list for active leg */}
      {leg.files.length > 0 && (
        <ul className="grid sm:grid-cols-2 gap-2">
          {leg.files.map((f, i) => (
            <li
              key={i}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2"
            >
              {f.type.startsWith("image/") ? (
                <ImagePlus className="h-4 w-4 text-primary shrink-0" />
              ) : (
                <FileText className="h-4 w-4 text-primary shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate">{f.name}</div>
                <div className="text-[0.7rem] text-muted-foreground">
                  {(f.size / 1024 / 1024).toFixed(2)} MB · {f.type || "unknown"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="text-muted-foreground hover:text-destructive p-1 focus-ring rounded"
                aria-label={`Remove ${f.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="ghost" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Button onClick={onNext} disabled={!allLegsHaveFiles}>
          Continue to combined Q/A <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────── Step 3: Combined Q/A ───────────────────────────

function CombinedQAStep({
  qa, setQa, onBack, onSubmit, canSubmit, submitting,
}: {
  qa: Record<string, string>;
  setQa: (v: Record<string, string>) => void;
  onBack: () => void;
  onSubmit: () => void;
  canSubmit: boolean;
  submitting: boolean;
}) {
  return (
    <div className="surface-clinical p-5 md:p-6 space-y-5">
      <div>
        <h2 className="font-display text-xl tracking-tight">Combined patient questionnaire</h2>
        <p className="text-sm text-muted-foreground mt-1">
          One questionnaire across all modalities. Stays PHI-scrubbed before any AI call.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {COMBINED_QA.map((q) => (
          <div key={q.id} className={q.kind === "text" && (q.id === "indication" || q.id === "cross_concern") ? "sm:col-span-2" : ""}>
            <Label htmlFor={`qa-${q.id}`}>
              {q.label}
              {q.required && <span className="text-destructive ml-0.5">*</span>}
            </Label>
            {q.helper && (
              <p className="text-[0.7rem] text-muted-foreground mt-0.5">{q.helper}</p>
            )}
            {q.kind === "text" && (q.id === "indication" || q.id === "cross_concern") ? (
              <Textarea
                id={`qa-${q.id}`}
                value={qa[q.id] ?? ""}
                onChange={(e) => setQa({ ...qa, [q.id]: e.target.value })}
                rows={2}
                className="mt-1.5"
                maxLength={500}
              />
            ) : q.kind === "select" ? (
              <Select
                value={qa[q.id] ?? ""}
                onValueChange={(v) => setQa({ ...qa, [q.id]: v })}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {q.options?.map((o) => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id={`qa-${q.id}`}
                type={q.kind === "number" ? "number" : "text"}
                value={qa[q.id] ?? ""}
                onChange={(e) => setQa({ ...qa, [q.id]: e.target.value })}
                className="mt-1.5"
                maxLength={300}
              />
            )}
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground flex items-start gap-2">
        <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
        <span>
          Multi-modality study consumes <strong>2 scan units</strong> (flat) regardless of leg
          count. After AI analysis you can edit the unified report before signing.
        </span>
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="ghost" onClick={onBack} disabled={submitting}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Button onClick={onSubmit} disabled={!canSubmit}>
          {submitting ? (
            <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Submitting…</>
          ) : (
            <>Run unified analysis <ChevronRight className="h-4 w-4 ml-1" /></>
          )}
        </Button>
      </div>
    </div>
  );
}

function SubmittingState() {
  return (
    <div className="surface-clinical p-10 text-center">
      <Loader2 className="h-8 w-8 mx-auto text-primary animate-spin mb-3" />
      <div className="font-display text-lg">Uploading legs &amp; starting analysis…</div>
      <p className="text-sm text-muted-foreground mt-1">
        You'll be redirected to the live progress view in a moment.
      </p>
    </div>
  );
}

// ─────────────────────────── Auto: Bulk Upload ───────────────────────────

function AutoUploadStep({
  files, setFiles, detecting, onBack, onDetect,
}: {
  files: File[];
  setFiles: (f: File[]) => void;
  detecting: boolean;
  onBack: () => void;
  onDetect: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const addFiles = (incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    const accepted: File[] = [];
    for (const f of arr) {
      const err = validateLegFile(f);
      if (err) { toast.error(err); continue; }
      accepted.push(f);
    }
    const combined = [...files, ...accepted].slice(0, AUTO_MAX_FILES);
    if (files.length + accepted.length > AUTO_MAX_FILES) {
      toast.warning(`Maximum ${AUTO_MAX_FILES} files — extras dropped.`);
    }
    setFiles(combined);
  };

  const removeFile = (idx: number) => {
    setFiles(files.filter((_, i) => i !== idx));
  };

  return (
    <div className="surface-clinical p-5 md:p-6 space-y-5">
      <div>
        <h2 className="font-display text-xl tracking-tight">Bulk upload — auto detect</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Drop every file for this patient (max {AUTO_MAX_FILES}). The AI will group them
          into 2–4 modality legs you can review next.
        </p>
      </div>

      <div className="rounded-xl border-2 border-dashed border-border bg-surface-raised/40 p-6 text-center">
        <Wand2 className="h-8 w-8 mx-auto text-primary mb-2" strokeWidth={2} />
        <div className="font-medium">Drop or choose files</div>
        <p className="text-xs text-muted-foreground mt-1 mb-4">
          PNG · JPEG · WebP · HEIC · PDF · DOC / DOCX · max 20 MB each · up to {AUTO_MAX_FILES} files
        </p>
        <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          <Upload className="h-4 w-4 mr-1.5" /> Choose files
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
      </div>

      {files.length > 0 && (
        <ul className="grid sm:grid-cols-2 gap-2">
          {files.map((f, i) => (
            <li
              key={i}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2"
            >
              {f.type.startsWith("image/")
                ? <ImagePlus className="h-4 w-4 text-primary shrink-0" />
                : <FileText className="h-4 w-4 text-primary shrink-0" />}
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate">{f.name}</div>
                <div className="text-[0.7rem] text-muted-foreground">
                  {(f.size / 1024 / 1024).toFixed(2)} MB · {f.type || "unknown"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="text-muted-foreground hover:text-destructive p-1 focus-ring rounded"
                aria-label={`Remove ${f.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="ghost" onClick={onBack} disabled={detecting}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Button onClick={onDetect} disabled={files.length < 2 || detecting}>
          {detecting
            ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Detecting…</>
            : <>Auto-detect modalities <Sparkles className="h-4 w-4 ml-1.5" /></>}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────── Auto: Review legs ───────────────────────────

function ReviewStep({
  legs, updateLeg, setLegs, availableModalities,
  onBack, onNext, onRedetect, detecting,
}: {
  legs: LegState[];
  updateLeg: (idx: number, patch: Partial<LegState>) => void;
  setLegs: React.Dispatch<React.SetStateAction<LegState[]>>;
  availableModalities: Modality[];
  onBack: () => void;
  onNext: () => void;
  onRedetect: () => void;
  detecting: boolean;
}) {
  const removeFileFromLeg = (legIdx: number, fileIdx: number) => {
    updateLeg(legIdx, { files: legs[legIdx].files.filter((_, i) => i !== fileIdx) });
  };

  const moveFile = (fromLeg: number, fileIdx: number, toLeg: number) => {
    if (toLeg === fromLeg) return;
    const f = legs[fromLeg].files[fileIdx];
    if (!f) return;
    if (legs[toLeg].files.length >= MAX_FILES_PER_LEG) {
      toast.warning(`Leg ${toLeg + 1} is already full (${MAX_FILES_PER_LEG} files).`);
      return;
    }
    setLegs((prev) => prev.map((l, i) => {
      if (i === fromLeg) return { ...l, files: l.files.filter((_, j) => j !== fileIdx) };
      if (i === toLeg) return { ...l, files: [...l.files, f] };
      return l;
    }));
  };

  const addLeg = () => {
    if (legs.length >= MAX_LEGS) return;
    setLegs((prev) => [...prev, { modality: null, files: [] }]);
  };

  const removeLeg = (idx: number) => {
    if (legs.length <= MIN_LEGS) {
      toast.warning(`Need at least ${MIN_LEGS} legs.`);
      return;
    }
    setLegs((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="surface-clinical p-5 md:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl tracking-tight">Review detected legs</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Confirm the modality for each leg or re-assign files before continuing.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRedetect} disabled={detecting}>
          {detecting
            ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Re-detecting…</>
            : <><Wand2 className="h-3.5 w-3.5 mr-1.5" /> Re-detect</>}
        </Button>
      </div>

      <div className="space-y-3">
        {legs.map((leg, i) => (
          <div key={i} className="rounded-xl border border-border bg-surface p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <span className="font-display text-sm">L{i + 1}</span>
              </div>
              <div className="flex-1 min-w-0">
                <Select
                  value={leg.modality?.slug ?? ""}
                  onValueChange={(slug) => {
                    const m = availableModalities.find((mm) => mm.slug === slug) ?? null;
                    updateLeg(i, { modality: m });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a modality…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {availableModalities.map((m) => (
                      <SelectItem
                        key={m.slug}
                        value={m.slug}
                        disabled={legs.some((other, idx) => idx !== i && other.modality?.slug === m.slug)}
                      >
                        <span className="font-medium">{m.label}</span>
                        <span className="ml-2 text-[0.7rem] text-muted-foreground">{m.category}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <button
                type="button"
                onClick={() => removeLeg(i)}
                disabled={legs.length <= MIN_LEGS}
                className="text-muted-foreground hover:text-destructive p-1 focus-ring rounded disabled:opacity-30"
                aria-label={`Remove leg ${i + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            {leg.files.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No files — move some from another leg.</p>
            ) : (
              <ul className="space-y-1.5">
                {leg.files.map((f, fi) => (
                  <li
                    key={fi}
                    className="flex items-center gap-2 rounded-md border border-border bg-surface-raised/60 px-2.5 py-1.5 text-sm"
                  >
                    {f.type.startsWith("image/")
                      ? <ImagePlus className="h-3.5 w-3.5 text-primary shrink-0" />
                      : <FileText className="h-3.5 w-3.5 text-primary shrink-0" />}
                    <span className="truncate flex-1">{f.name}</span>
                    {legs.length > 1 && (
                      <Select onValueChange={(v) => moveFile(i, fi, Number(v))}>
                        <SelectTrigger className="h-7 w-[110px] text-[0.7rem]">
                          <SelectValue placeholder="Move to…" />
                        </SelectTrigger>
                        <SelectContent>
                          {legs.map((_, ti) => ti !== i ? (
                            <SelectItem key={ti} value={String(ti)}>Leg {ti + 1}</SelectItem>
                          ) : null)}
                        </SelectContent>
                      </Select>
                    )}
                    <button
                      type="button"
                      onClick={() => removeFileFromLeg(i, fi)}
                      className="text-muted-foreground hover:text-destructive p-0.5 focus-ring rounded"
                      aria-label={`Remove ${f.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {legs.length < MAX_LEGS && (
          <Button variant="outline" size="sm" onClick={addLeg}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add another leg
          </Button>
        )}
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="ghost" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Button onClick={onNext}>
          Continue to combined Q/A <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
