import { cn } from "@/lib/utils";
import iconUrl from "@/assets/mm-labs-icon.png";

interface LogoProps {
  className?: string;
  showWordmark?: boolean;
}

/**
 * Manthana-Labs wordmark
 * A product of Quaasx 108 Private Limited
 */
export function Logo({ className, showWordmark = true }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <img
        src={iconUrl}
        alt="Manthana-Labs"
        className="h-9 w-9 rounded-lg object-contain"
        loading="eager"
        decoding="async"
      />
      {showWordmark && (
        <div className="leading-none">
          <div className="font-display text-[1.1rem] font-semibold tracking-tight text-foreground flex items-baseline gap-0.5">
            <span>Manthana</span>
            <span className="text-primary">‑</span>
            <span className="bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">LABS</span>
          </div>
          <div className="text-[0.6rem] uppercase tracking-[0.22em] text-muted-foreground mt-0.5">
            by Quaasx 108
          </div>
        </div>
      )}
    </div>
  );
}
