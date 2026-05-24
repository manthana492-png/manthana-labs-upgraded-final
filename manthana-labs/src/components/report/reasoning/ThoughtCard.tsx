import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import type { ReasoningBeat } from "@/lib/reasoningBeats";
import { BEAT_LABEL } from "@/lib/reasoningBeats";
import { cn } from "@/lib/utils";

/**
 * ThoughtCard — floating card that surfaces what the AI was thinking
 * at the active beat. Anchored under the viewer; uses semantic tokens.
 */
export function ThoughtCard({
  beat,
  className,
}: {
  beat: ReasoningBeat | undefined;
  className?: string;
}) {
  return (
    <AnimatePresence mode="wait">
      {beat && (
        <motion.div
          key={beat.id}
          initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
          transition={{ duration: 0.32, ease: [0.32, 0.72, 0.24, 1] }}
          className={cn(
            "rounded-xl border border-border/70 bg-surface-raised/95 backdrop-blur-xl shadow-lg p-3.5 max-w-md",
            beat.kind === "revise" && "border-severity-critical/50 bg-severity-critical/5",
            className,
          )}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <BeatKindChip kind={beat.kind} pass={beat.pass} />
            {typeof beat.confidenceDelta === "number" && Math.abs(beat.confidenceDelta) >= 0.02 && (
              <ConfidenceDeltaChip delta={beat.confidenceDelta} />
            )}
            {typeof beat.confidence === "number" && (
              <span className="ml-auto font-mono text-[0.7rem] tabular-nums text-muted-foreground">
                {Math.round(beat.confidence * 100)}%
              </span>
            )}
          </div>
          <div className="text-sm font-medium text-foreground leading-snug">
            {beat.title}
          </div>
          {beat.thought && (
            <p className="text-xs text-muted-foreground leading-relaxed mt-1.5">
              {beat.thought}
            </p>
          )}
          {beat.citationUrl && (
            <a
              href={beat.citationUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-[0.7rem] text-primary hover:underline"
            >
              Open source <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function BeatKindChip({ kind, pass }: { kind: ReasoningBeat["kind"]; pass?: 1 | 2 }) {
  const colorByKind: Record<ReasoningBeat["kind"], string> = {
    intake:       "bg-muted text-muted-foreground border-border/60",
    segment:      "bg-primary/10 text-primary border-primary/20",
    roi:          "bg-primary/15 text-primary border-primary/30",
    differential: "bg-severity-medium/10 text-severity-medium border-severity-medium/30",
    cite:         "bg-severity-low/10 text-severity-low border-severity-low/30",
    confidence:   "bg-severity-low/10 text-severity-low border-severity-low/30",
    revise:       "bg-severity-critical/10 text-severity-critical border-severity-critical/30",
    final:        "bg-primary-glow/15 text-primary border-primary/30",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[0.6rem] px-2 py-0.5 rounded-full border uppercase tracking-wider font-medium",
        colorByKind[kind],
      )}
    >
      {kind === "revise" && <RefreshCw className="h-2.5 w-2.5" />}
      {BEAT_LABEL[kind]}
      {pass === 2 && <span className="opacity-70">· P2</span>}
    </span>
  );
}

function ConfidenceDeltaChip({ delta }: { delta: number }) {
  const up = delta > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[0.6rem] px-1.5 py-0.5 rounded-full border font-mono tabular-nums",
        up
          ? "bg-severity-low/10 text-severity-low border-severity-low/30"
          : "bg-severity-critical/10 text-severity-critical border-severity-critical/30",
      )}
    >
      {up ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
      {up ? "+" : ""}
      {Math.round(delta * 100)}%
    </span>
  );
}
