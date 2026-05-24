import { useEffect } from "react";
import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { ModalityViewer } from "@/components/viewers/ModalityViewer";
import { useReasoningPlayer } from "@/hooks/use-reasoning-player";
import { buildReasoningTrace, type ReasoningBeat } from "@/lib/reasoningBeats";
import type { Study } from "@/lib/types";
import { AttentionOverlay } from "./AttentionOverlay";
import { ReasoningTimeline } from "./ReasoningTimeline";
import { ThoughtCard } from "./ThoughtCard";
import { cn } from "@/lib/utils";

/**
 * ReasoningReplay — the cinematic "watch the AI think" experience.
 *
 * Composes: ModalityViewer (untouched) + AttentionOverlay (ROI / heatmap) +
 * ReasoningTimeline (scrubber) + ThoughtCard (floating commentary).
 *
 * Replaces a bare <ModalityViewer /> in the report view. Doctors get the
 * same viewer they're used to, plus a malpractice-defensible replayable
 * record of every reasoning step.
 */
export function ReasoningReplay({
  study,
  onActiveBeatChange,
  className,
}: {
  study: Study;
  /** Callback so parent panels (citations, finding list) can react. */
  onActiveBeatChange?: (b: ReasoningBeat | undefined) => void;
  className?: string;
}) {
  const trace = buildReasoningTrace(study);
  const player = useReasoningPlayer(trace);

  useEffect(() => {
    onActiveBeatChange?.(player.activeBeat);
  }, [player.activeBeat, onActiveBeatChange]);

  return (
    <div className={cn("space-y-3", className)}>
      {/* Viewer + overlay */}
      <div className="relative">
        <ModalityViewer
          modality={study.modality}
          assets={study.previewAssets ?? []}
        />
        <AttentionOverlay beat={player.activeBeat} />
      </div>

      {/* Timeline scrubber */}
      <ReasoningTimeline
        trace={trace}
        t={player.t}
        playing={player.playing}
        speed={player.speed}
        activeBeat={player.activeBeat}
        onPlay={player.play}
        onPause={player.pause}
        onSeek={player.seek}
        onJump={player.jumpTo}
        onPrev={player.prev}
        onNext={player.next}
        onRestart={player.restart}
        onSpeedChange={player.setSpeed}
        authoritative={trace.authoritative}
      />

      {/* Floating thought card */}
      <ThoughtCard beat={player.activeBeat} />

      {/* Provenance footer (the trust line) */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="flex items-center gap-1.5 text-[0.65rem] text-muted-foreground italic"
      >
        <ShieldCheck className="h-3 w-3 text-primary" />
        Every Manthana‑Labs report comes with a receipt — this trace is{" "}
        {trace.authoritative ? "live from the model" : "reconstructed deterministically"} and travels with the signed report.
      </motion.div>
    </div>
  );
}
