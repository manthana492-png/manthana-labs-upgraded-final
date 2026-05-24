import { cn } from "@/lib/utils";

/** Animated radial confidence gauge — used in report headers. */
export function ConfidenceGauge({
  value,
  size = 72,
  strokeWidth = 6,
  className,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, value));
  const r = size / 2 - strokeWidth;
  const c = 2 * Math.PI * r;
  const offset = c - pct * c;
  const color =
    pct >= 0.85 ? "hsl(var(--tier-nvidia))" :
    pct >= 0.7  ? "hsl(var(--severity-medium))" :
                  "hsl(var(--tier-research))";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={cn("-rotate-90 shrink-0", className)}>
      <circle cx={size/2} cy={size/2} r={r} stroke="hsl(var(--muted))" strokeWidth={strokeWidth} fill="none" />
      <circle
        cx={size/2}
        cy={size/2}
        r={r}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 600ms cubic-bezier(0.16,1,0.3,1)" }}
      />
    </svg>
  );
}
