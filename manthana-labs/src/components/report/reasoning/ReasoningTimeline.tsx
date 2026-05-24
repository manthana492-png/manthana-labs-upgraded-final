import { useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BEAT_DOT_CLASS, BEAT_LABEL, type ReasoningBeat, type ReasoningTrace } from "@/lib/reasoningBeats";
import { cn } from "@/lib/utils";

const SPEEDS = [0.5, 1, 1.5, 2];

/**
 * ReasoningTimeline — the cinematic scrubber rail.
 *
 * Beats are rendered as colour-coded dots positioned on a timeline rail
 * proportional to their `t`. The active beat has a halo. The playhead
 * (a thin vertical bar) tracks `t`. Click the rail to seek; click a dot
 * to jump.
 */
export function ReasoningTimeline({
  trace,
  t,
  playing,
  speed,
  activeBeat,
  onPlay,
  onPause,
  onSeek,
  onJump,
  onPrev,
  onNext,
  onRestart,
  onSpeedChange,
  authoritative,
}: {
  trace: ReasoningTrace;
  t: number;
  playing: boolean;
  speed: number;
  activeBeat: ReasoningBeat | undefined;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (t: number) => void;
  onJump: (b: ReasoningBeat) => void;
  onPrev: () => void;
  onNext: () => void;
  onRestart: () => void;
  onSpeedChange: (s: number) => void;
  authoritative: boolean;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const total = trace.totalSeconds;
  const playheadPct = Math.min(100, (t / total) * 100);

  const handleRailClick = (e: React.MouseEvent) => {
    if (!railRef.current) return;
    const rect = railRef.current.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    onSeek(pct * total);
  };

  const fmt = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="rounded-2xl border border-border/70 bg-surface-raised/95 backdrop-blur-md shadow-sm p-3">
      {/* Header strip */}
      <div className="flex items-center gap-2 mb-2.5">
        <div className="inline-flex items-center gap-1.5 text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">
          <Sparkles className="h-3 w-3 text-primary" /> Reasoning replay
        </div>
        <span
          className={cn(
            "text-[0.6rem] px-1.5 py-0.5 rounded-full border font-mono",
            authoritative
              ? "bg-severity-low/10 text-severity-low border-severity-low/30"
              : "bg-muted text-muted-foreground border-border/60",
          )}
          title={
            authoritative
              ? "Beats streamed from the model — perfect provenance."
              : "Reconstructed from the saved report — deterministic per-study."
          }
        >
          {authoritative ? "Live trace" : "Reconstructed"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <span className="font-mono text-[0.7rem] tabular-nums text-muted-foreground">
            {fmt(t)} / {fmt(total)}
          </span>
          <div className="ml-2 inline-flex rounded-full bg-muted p-0.5">
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => onSpeedChange(s)}
                className={cn(
                  "text-[0.6rem] font-mono px-1.5 py-0.5 rounded-full transition-colors",
                  speed === s
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Transport */}
      <div className="flex items-center gap-1.5 mb-3">
        <Button
          size="icon"
          variant="outline"
          className="h-8 w-8"
          onClick={onPrev}
          aria-label="Previous beat"
          title="Previous beat"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          onClick={playing ? onPause : onPlay}
          className="h-9 w-9 bg-primary hover:bg-primary/90"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
        </Button>
        <Button
          size="icon"
          variant="outline"
          className="h-8 w-8"
          onClick={onNext}
          aria-label="Next beat"
          title="Next beat"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground"
          onClick={onRestart}
          aria-label="Restart"
          title="Restart from start"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>

        {/* Active beat title (transport-row chip) */}
        <div className="ml-2 flex-1 min-w-0">
          <AnimatePresence mode="wait">
            {activeBeat && (
              <motion.div
                key={activeBeat.id}
                initial={{ opacity: 0, x: 4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -4 }}
                transition={{ duration: 0.18 }}
                className="text-xs text-foreground/90 truncate"
              >
                <span className="font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground mr-1.5">
                  {BEAT_LABEL[activeBeat.kind]}
                </span>
                {activeBeat.title}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Rail */}
      <TooltipProvider delayDuration={120}>
        <div
          ref={railRef}
          onClick={handleRailClick}
          className="relative h-9 cursor-pointer group"
        >
          {/* Track line */}
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-muted overflow-hidden">
            {/* Filled progress */}
            <motion.div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-primary-glow"
              animate={{ width: `${playheadPct}%` }}
              transition={{ type: "tween", ease: "linear", duration: 0.05 }}
            />
          </div>

          {/* Beat dots */}
          {trace.beats.map((b) => {
            const left = (b.t / total) * 100;
            const isActive = activeBeat?.id === b.id;
            const isPast = b.t <= t;
            return (
              <Tooltip key={b.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onJump(b);
                    }}
                    aria-label={`Jump to beat: ${b.title}`}
                    className={cn(
                      "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full border-2 border-background transition-all focus:outline-none focus:ring-2 focus:ring-primary",
                      BEAT_DOT_CLASS[b.kind],
                      isPast ? "opacity-100" : "opacity-65",
                      isActive && "h-4 w-4 ring-2 ring-primary/50 shadow-[0_0_0_4px_hsl(var(--primary)/0.18)]",
                    )}
                    style={{ left: `${left}%` }}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs max-w-xs">
                  <div className="font-mono text-[0.6rem] uppercase tracking-wider text-muted-foreground mb-0.5">
                    {BEAT_LABEL[b.kind]} · {Math.round(b.t * 10) / 10}s
                    {b.pass === 2 && " · Pass 2"}
                  </div>
                  <div className="font-medium">{b.title}</div>
                </TooltipContent>
              </Tooltip>
            );
          })}

          {/* Playhead indicator */}
          <motion.div
            className="absolute top-1 bottom-1 w-px bg-primary shadow-[0_0_8px_hsl(var(--primary))]"
            animate={{ left: `${playheadPct}%` }}
            transition={{ type: "tween", ease: "linear", duration: 0.05 }}
          />
        </div>
      </TooltipProvider>

      {/* Legend (compact, semantic) */}
      <div className="mt-3 flex items-center gap-3 flex-wrap text-[0.6rem] text-muted-foreground">
        {(["intake", "segment", "roi", "differential", "cite", "confidence", "revise", "final"] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className={cn("h-2 w-2 rounded-full", BEAT_DOT_CLASS[k])} />
            {BEAT_LABEL[k]}
          </span>
        ))}
      </div>
    </div>
  );
}
