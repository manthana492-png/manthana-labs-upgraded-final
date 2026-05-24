import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface AiAssistedBannerProps {
  className?: string;
  compact?: boolean;
}

/**
 * Neutral, calm trust banner shown on every AI-assisted report surface.
 * Replaces the old red Research-Assisted alarm — same legal protection,
 * better tone for doctors who must read these every day.
 */
export function AiAssistedBanner({ className, compact }: AiAssistedBannerProps) {
  return (
    <div
      role="note"
      aria-live="polite"
      className={cn(
        "relative overflow-hidden rounded-xl border border-border",
        "bg-muted/40 text-foreground",
        compact ? "p-3" : "p-4 sm:p-5",
        className,
      )}
    >
      <div className="absolute inset-y-0 left-0 w-1 bg-primary/60" />
      <div className="flex items-start gap-3 pl-2">
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary",
            compact ? "h-7 w-7" : "h-9 w-9",
          )}
        >
          <Info className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} strokeWidth={2.4} />
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn("font-semibold tracking-tight", compact ? "text-sm" : "text-[0.95rem]")}>
            AI-assisted analysis
          </div>
          <p
            className={cn(
              "text-muted-foreground mt-0.5",
              compact ? "text-xs" : "text-[0.825rem] leading-relaxed",
            )}
          >
            A licensed clinician must review and sign every report before download or share.
            Confidence and findings are decision support — not a final diagnosis.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * @deprecated Old name — kept so existing imports keep working. Prefer
 * <AiAssistedBanner /> in new code.
 */
export const ResearchAssistedBanner = AiAssistedBanner;
