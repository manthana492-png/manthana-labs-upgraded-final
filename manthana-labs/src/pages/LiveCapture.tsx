// /app/live — Live capture workflow
// Flow: pick specialty → camera & record (≤20s) → upload → pass 1
//       → follow-ups → pass 2 (with web search) → final report.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { TierBadge } from "@/components/tier/TierBadge";
import { CameraCapture, type CaptureResult } from "@/components/live/CameraCapture";
import { FollowUpQuestions } from "@/components/live/FollowUpQuestions";
import { ReferencesPanel } from "@/components/live/ReferencesPanel";
import {
  HYBRID_SPECIALTIES,
  HYBRID_DEFAULT_SLUG,
  findHybridSpecialty,
} from "@/lib/hybridSpecialties";
import {
  liveCaptureInit,
  liveCaptureUploadVideo,
  liveCaptureUploadPhotos,
  liveCapturePass1,
  liveCapturePass2,
  liveCaptureFetchStudy,
  subscribeLiveProgress,
  type LiveProgress,
  type Pass2Result,
} from "@/lib/liveCaptureApi";
import type { FollowUpQuestion, WebCitation } from "@/lib/types";
import { toast } from "@/components/ui/sonner";
import {
  ArrowLeft,
  Sparkles,
  Radio,
  Cpu,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Stage =
  | "pick_specialty"
  | "camera"
  | "uploading"
  | "pass1"
  | "follow_ups"
  | "pass2"
  | "done"
  | "error";

const LiveCapture = () => {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("pick_specialty");
  const [selectedSlug, setSelectedSlug] = useState<string>(HYBRID_DEFAULT_SLUG);
  const [studyId, setStudyId] = useState<string | null>(null);
  const [followUps, setFollowUps] = useState<FollowUpQuestion[]>([]);
  const [holoscanUsed, setHoloscanUsed] = useState(false);
  const [finalReport, setFinalReport] = useState<Pass2Result | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [liveProgress, setLiveProgress] = useState<LiveProgress | null>(null);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);

  const specialty = findHybridSpecialty(selectedSlug)!;

  // Subscribe to realtime progress as soon as we have a study id.
  useEffect(() => {
    if (!studyId) return;
    unsubRef.current?.();
    unsubRef.current = subscribeLiveProgress(studyId, (p) => setLiveProgress(p));
    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, [studyId]);

  useEffect(() => {
    if (!studyId || stage !== "pass2") return;
    let cancelled = false;
    const recoverIfReady = async () => {
      try {
        const ready = await liveCaptureFetchStudy(studyId);
        if (!ready || cancelled) return;
        setFinalReport(ready);
        setRecoveryReady(false);
        setStage("done");
        toast.success("Report ready", { description: "Live capture report is ready for review." });
      } catch {
        // Non-fatal: the main pass2 request may still complete normally.
      }
    };

    if (liveProgress?.stage === "ready_for_review" || (liveProgress?.pct ?? 0) >= 100) {
      void recoverIfReady();
    }
    const recoveryTimer = window.setTimeout(() => {
      if (!cancelled) setRecoveryReady(true);
      void recoverIfReady();
    }, 45000);
    const pollTimer = window.setInterval(() => { void recoverIfReady(); }, 12000);
    return () => {
      cancelled = true;
      window.clearTimeout(recoveryTimer);
      window.clearInterval(pollTimer);
    };
  }, [studyId, stage, liveProgress?.stage, liveProgress?.pct]);

  function reset() {
    setStage("pick_specialty");
    setStudyId(null);
    setFollowUps([]);
    setHoloscanUsed(false);
    setFinalReport(null);
    setErrorMsg(null);
    setLiveProgress(null);
    setRecoveryReady(false);
    unsubRef.current?.();
    unsubRef.current = null;
  }

  async function runFinalPass(id: string, answers: Record<string, string>) {
    setStage("pass2");
    setRecoveryReady(false);
    try {
      const p2 = await liveCapturePass2(id, answers);
      setFinalReport(p2);
      setStage("done");
    } catch (e) {
      const ready = await liveCaptureFetchStudy(id).catch(() => null);
      if (ready) {
        setFinalReport(ready);
        setStage("done");
        return;
      }
      throw e;
    }
  }

  async function handleCaptureComplete(result: CaptureResult) {
    setStage("uploading");
    try {
      const kind = result.kind;
      const frameCount = kind === "video" ? result.frameBlobs.length : 0;
      const photoCount = kind === "photos" ? result.photoBlobs.length : 0;
      const init = await liveCaptureInit({
        specialtySlug: selectedSlug,
        kind,
        frameCount,
        photoCount,
      });
      setStudyId(init.studyId);
      setHoloscanUsed(init.holoscanEnabled);

      if (kind === "video") {
        await liveCaptureUploadVideo(init, result.videoBlob, result.frameBlobs);
      } else {
        await liveCaptureUploadPhotos(init, result.photoBlobs);
      }

      setStage("pass1");
      const p1 = await liveCapturePass1(init.studyId);
      setFollowUps(p1.followUpQuestions);
      setHoloscanUsed(p1.holoscanUsed);
      if (p1.followUpQuestions.length === 0) {
        await runFinalPass(init.studyId, {});
      } else {
        setStage("follow_ups");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(msg);
      setStage("error");
      toast.error("Live capture failed", { description: msg });
    }
  }

  async function handleFollowUpsSubmit(answers: Record<string, string>) {
    if (!studyId) return;
    try {
      await runFinalPass(studyId, answers);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(msg);
      setStage("error");
      toast.error("Final analysis failed", { description: msg });
    }
  }

  return (
    <AppShell>
      {/* Hero */}
      <section className="relative overflow-hidden surface-clinical p-6 md:p-8 mb-6">
        <div className="absolute inset-0 bg-aurora opacity-70 pointer-events-none" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">
              <Radio className="h-3.5 w-3.5 text-tier-hybrid" /> Live capture
            </div>
            <h1 className="font-display text-3xl md:text-4xl tracking-tight text-balance">
              Live capture
            </h1>
            <p className="mt-2 text-muted-foreground text-pretty max-w-2xl">
              Real-time clinical exam from your phone or laptop camera. Record up
              to 20 seconds of video, or capture up to 4 high-resolution photos —
              AI vision analysis with web-search citations, clinician-reviewed
              before sign-off.
            </p>
          </div>
          <TierBadge tier="H" size="lg" />
        </div>
      </section>

      {/* Stage routing */}
      <AnimatePresence mode="wait">
        {stage === "pick_specialty" && (
          <motion.div
            key="pick"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <SpecialtyGrid
              selectedSlug={selectedSlug}
              onSelect={setSelectedSlug}
              onContinue={() => setStage("camera")}
            />
          </motion.div>
        )}

        {stage === "camera" && (
          <motion.div
            key="camera"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between gap-3">
              <Button variant="ghost" size="sm" onClick={() => setStage("pick_specialty")}>
                <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
              </Button>
              <div className="text-sm text-muted-foreground">
                {specialty.emoji} <span className="font-medium text-foreground">{specialty.label}</span>
              </div>
            </div>
            <CameraCapture
              initialFacing={specialty.cameraFacing}
              defaultMode={specialty.category === "Photo" ? "photo" : "video"}
              maxSeconds={specialty.recordSeconds}
              maxPhotos={4}
              onComplete={handleCaptureComplete}
              onError={(m) => toast.error("Camera error", { description: m })}
            />
            <p className="text-center text-xs text-muted-foreground max-w-md mx-auto">
              {specialty.shortPrompt}
            </p>
          </motion.div>
        )}

        {(stage === "uploading" || stage === "pass1" || stage === "pass2") && (
          <motion.div
            key="working"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="surface-clinical p-8 md:p-12 text-center max-w-2xl mx-auto"
          >
            <Loader2 className="h-10 w-10 mx-auto animate-spin text-tier-hybrid" />
            <h2 className="mt-4 font-display text-2xl tracking-tight">
              {stage === "uploading" && "Uploading clip…"}
              {stage === "pass1" && "AI vision is parsing the clip"}
              {stage === "pass2" && "Final pass · searching the web for citations"}
            </h2>
            <p
              className="mt-2 text-sm text-muted-foreground min-h-[2.5em] transition-opacity"
              aria-live="polite"
            >
              {liveProgress?.label ?? (
                <>
                  {stage === "uploading" && "Securely transferring to Lovable Cloud."}
                  {stage === "pass1" && (
                    <>Vision model is parsing the video.</>
                  )}
                  {stage === "pass2" && (
                    <>Combining your follow-up answers with authoritative references.</>
                  )}
                </>
              )}
            </p>

            {/* Realtime percent bar */}
            <div className="mt-6 max-w-md mx-auto">
              <div className="flex items-center justify-between text-[0.7rem] font-mono text-muted-foreground mb-1.5">
                <span className="uppercase tracking-[0.14em]">
                  {liveProgress?.stage?.replace(/_/g, " ") ?? stage}
                </span>
                <span>{liveProgress?.pct ?? (stage === "uploading" ? 10 : stage === "pass1" ? 35 : 70)}%</span>
              </div>
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="absolute inset-y-0 left-0 bg-tier-hybrid transition-[width] duration-500 ease-out"
                  style={{
                    width: `${liveProgress?.pct ?? (stage === "uploading" ? 10 : stage === "pass1" ? 35 : 70)}%`,
                  }}
                />
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2 max-w-md mx-auto text-[0.7rem]">
              <PipelineStep label="Capture" done />
              <PipelineStep label="Vision pass 1" done={stage !== "uploading" && stage !== "pass1"} active={stage === "pass1"} />
              <PipelineStep label="Final + cite" active={stage === "pass2"} />
            </div>

            {stage === "pass2" && recoveryReady && studyId && (
              <Button
                variant="outline"
                className="mt-5"
                onClick={async () => {
                  const ready = await liveCaptureFetchStudy(studyId);
                  if (ready) {
                    setFinalReport(ready);
                    setStage("done");
                  } else {
                    navigate(`/app/study/${studyId}`);
                  }
                }}
              >
                Open latest report status
              </Button>
            )}
          </motion.div>
        )}

        {stage === "follow_ups" && (
          <motion.div
            key="followups"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="surface-clinical p-6 md:p-8 max-w-2xl mx-auto"
          >
            <FollowUpQuestions questions={followUps} onSubmit={handleFollowUpsSubmit} />
          </motion.div>
        )}

        {stage === "done" && finalReport && (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="surface-clinical p-6 md:p-8">
              <div className="flex items-center gap-2 text-sm text-tier-nvidia-foreground">
                <CheckCircle2 className="h-4 w-4" /> Report ready · Awaiting your sign-off
              </div>
              <h2 className="font-display text-2xl md:text-3xl tracking-tight mt-2">
                {specialty.label} — Live capture report
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Overall confidence: <span className="font-mono font-semibold">
                  {(finalReport.overallConfidence * 100).toFixed(0)}%
                </span>
              </p>

              <div className="mt-5 prose prose-sm max-w-none text-foreground">
                <p className="whitespace-pre-wrap">{finalReport.narrative}</p>
              </div>

              {finalReport.informationGaps.length > 0 && (
                <div className="mt-5 rounded-lg border border-warning-critical-border/60 bg-warning-critical-soft p-3 text-sm">
                  <div className="font-medium text-warning-critical-foreground flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4" /> Information gaps
                  </div>
                  <ul className="mt-1.5 list-disc pl-5 text-warning-critical-foreground/90">
                    {finalReport.informationGaps.map((g, i) => <li key={i}>{g}</li>)}
                  </ul>
                </div>
              )}

              <ReferencesPanel citations={finalReport.webCitations} className="mt-6" />

              <div className="mt-6 flex flex-wrap gap-2">
                <Button onClick={() => studyId && navigate(`/app/study/${studyId}/report`)}>
                  Open in report viewer
                </Button>
                <Button variant="outline" onClick={reset}>
                  New live capture
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {stage === "error" && (
          <motion.div
            key="err"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="surface-clinical p-8 max-w-xl mx-auto text-center"
          >
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
            <h2 className="font-display text-xl tracking-tight mt-3">Something went wrong</h2>
            <p className="text-sm text-muted-foreground mt-2 break-words">{errorMsg}</p>
            <Button onClick={reset} className="mt-5">Try again</Button>
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  );
};

// ─────────────────── Specialty grid ───────────────────
function SpecialtyGrid({
  selectedSlug,
  onSelect,
  onContinue,
}: {
  selectedSlug: string;
  onSelect: (slug: string) => void;
  onContinue: () => void;
}) {
  const auto = HYBRID_SPECIALTIES.find((s) => s.slug === HYBRID_DEFAULT_SLUG)!;
  const rest = HYBRID_SPECIALTIES.filter((s) => s.slug !== HYBRID_DEFAULT_SLUG);

  return (
    <div className="space-y-6">
      {/* Default — Auto-detect */}
      <button
        onClick={() => onSelect(auto.slug)}
        className={cn(
          "relative w-full text-left overflow-hidden rounded-2xl p-5 md:p-6 border-2 transition focus-ring",
          selectedSlug === auto.slug
            ? "border-tier-hybrid bg-tier-hybrid-soft shadow-clinical"
            : "border-border bg-card hover:border-tier-hybrid/50"
        )}
      >
        <div className="absolute inset-0 bg-aurora opacity-50 pointer-events-none" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-tier-hybrid-foreground">
              <Sparkles className="h-3.5 w-3.5" /> Default · Recommended
            </div>
            <div className="font-display text-xl md:text-2xl tracking-tight mt-1">
              {auto.emoji} Auto-detect specialty
            </div>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
              Manthana‑Labs watches the first frames, identifies the body part, then runs the right exam protocol automatically. Best when you're not sure which preset fits.
            </p>
          </div>
          <Cpu className="h-6 w-6 text-tier-hybrid shrink-0" />
        </div>
      </button>

      {/* Advanced presets */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Advanced</div>
            <h2 className="font-display text-xl tracking-tight mt-0.5">Specialty presets</h2>
          </div>
          <span className="text-xs text-muted-foreground">{rest.length} protocols</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {rest.map((s) => (
            <button
              key={s.slug}
              onClick={() => onSelect(s.slug)}
              className={cn(
                "relative text-left rounded-xl p-4 border transition focus-ring h-full",
                selectedSlug === s.slug
                  ? "border-tier-hybrid bg-tier-hybrid-soft"
                  : "border-border bg-card hover:border-tier-hybrid/40 hover:bg-accent/30"
              )}
            >
              <div className="text-2xl mb-1.5">{s.emoji}</div>
              <div className="font-medium text-sm leading-snug">{s.label}</div>
              <p className="text-[0.7rem] text-muted-foreground mt-1 line-clamp-2">
                {s.blurb}
              </p>
              <div className="text-[0.6rem] text-muted-foreground mt-2 font-mono">
                {s.recordSeconds}s · {s.cameraFacing === "user" ? "front" : "rear"} cam
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Continue CTA */}
      <div className="sticky bottom-4 md:static z-10">
        <Button
          size="lg"
          onClick={onContinue}
          className="w-full md:w-auto bg-tier-hybrid hover:bg-tier-hybrid/90 text-white shadow-lg shadow-tier-hybrid/20"
        >
          <Radio className="h-4 w-4 mr-2" /> Open camera
        </Button>
      </div>
    </div>
  );
}

function PipelineStep({ label, active, done }: { label: string; active?: boolean; done?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-md border px-2 py-1.5 transition",
        done
          ? "bg-tier-nvidia-soft border-tier-nvidia-border/60 text-tier-nvidia-foreground"
          : active
          ? "bg-tier-hybrid-soft border-tier-hybrid-border/60 text-tier-hybrid-foreground animate-pulse-soft"
          : "bg-muted border-border text-muted-foreground"
      )}
    >
      {label}
    </div>
  );
}

export default LiveCapture;
