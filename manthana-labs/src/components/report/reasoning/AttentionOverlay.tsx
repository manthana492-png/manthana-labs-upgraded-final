import { motion, AnimatePresence } from "framer-motion";
import type { ReasoningBeat } from "@/lib/reasoningBeats";
import { cn } from "@/lib/utils";

/**
 * AttentionOverlay — pulsing ROI box + radial heatmap painted ON TOP of
 * the modality viewer. Viewer-agnostic: works over Cornerstone, Pathology,
 * Video, etc. Uses normalised [0..1] coordinates.
 */
export function AttentionOverlay({
  beat,
  className,
}: {
  beat: ReasoningBeat | undefined;
  className?: string;
}) {
  const roi = beat?.roi;
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden rounded-xl",
        className,
      )}
      aria-hidden
    >
      {/* Radial heatmap glow centred on ROI */}
      <AnimatePresence>
        {roi?.heatmap && roi.heatmap > 0 && roi.box && (
          <motion.div
            key={beat?.id + "-heat"}
            initial={{ opacity: 0 }}
            animate={{ opacity: Math.min(1, roi.heatmap) * 0.55 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0"
            style={{
              background: `radial-gradient(circle at ${(roi.box.x + roi.box.w / 2) * 100}% ${
                (roi.box.y + roi.box.h / 2) * 100
              }%, hsl(var(--primary) / 0.55) 0%, hsl(var(--primary) / 0.18) 22%, transparent 45%)`,
              mixBlendMode: "screen",
            }}
          />
        )}
      </AnimatePresence>

      {/* ROI box with pulse */}
      <AnimatePresence>
        {roi?.box && (
          <motion.div
            key={beat?.id + "-box"}
            initial={{ opacity: 0, scale: 1.18 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ duration: 0.45, ease: [0.32, 0.72, 0.24, 1] }}
            className={cn(
              "absolute border-2 rounded-md",
              beat?.kind === "revise"
                ? "border-severity-critical shadow-[0_0_0_3px_hsl(var(--severity-critical)/0.18)]"
                : "border-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.22)]",
            )}
            style={{
              left: `${roi.box.x * 100}%`,
              top: `${roi.box.y * 100}%`,
              width: `${roi.box.w * 100}%`,
              height: `${roi.box.h * 100}%`,
            }}
          >
            {/* Animated pulse ring */}
            <motion.div
              className={cn(
                "absolute inset-0 rounded-md border-2",
                beat?.kind === "revise" ? "border-severity-critical/60" : "border-primary/60",
              )}
              animate={{ scale: [1, 1.18, 1], opacity: [0.7, 0, 0.7] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
            />
            {/* Beat label tag */}
            {beat?.title && (
              <div
                className={cn(
                  "absolute -top-7 left-0 text-[0.6rem] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-md whitespace-nowrap backdrop-blur-md",
                  beat.kind === "revise"
                    ? "bg-severity-critical text-white"
                    : "bg-primary/90 text-primary-foreground",
                )}
              >
                {beat.title.length > 38 ? beat.title.slice(0, 36) + "…" : beat.title}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
