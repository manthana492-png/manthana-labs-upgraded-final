import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tier } from "@/lib/types";
import { CONFIDENCE_FLOOR } from "@/lib/questionnaire";

/**
 * ConfidenceFloorBanner
 * Surfaced when a study's overall confidence is below the tier's
 * minimum safe threshold. Forces "clinical correlation strongly advised".
 */
export function ConfidenceFloorBanner({
  tier,
  confidence,
  className,
}: {
  tier: Tier;
  confidence: number;
  className?: string;
}) {
  const floor = CONFIDENCE_FLOOR[tier];
  if (confidence >= floor) return null;
  const pct = Math.round(confidence * 100);
  const floorPct = Math.round(floor * 100);
  return (
    <div
      className={cn(
        "rounded-xl border border-warning-critical-border/70 bg-warning-critical-soft text-warning-critical-foreground p-3.5 flex items-start gap-3",
        className,
      )}
      role="alert"
    >
      <ShieldAlert className="h-5 w-5 mt-0.5 shrink-0" />
      <div className="text-sm leading-relaxed">
        <div className="font-medium">
          Low-confidence analysis ({pct}% &lt; {floorPct}% Tier {tier} floor)
        </div>
        <div className="text-xs mt-0.5 opacity-90">
          Clinical correlation is <strong>strongly advised</strong>. Do not act on AI output alone —
          consider repeat imaging, additional sequences, or specialist consultation before any
          intervention.
        </div>
      </div>
    </div>
  );
}
