// Compatibility shim — old call sites import { TierBadge } from this path.
// All tier semantics are now collapsed into the neutral WorkflowBadge.
import { WorkflowBadge } from "./WorkflowBadge";
import type { Tier } from "@/lib/types";

interface TierBadgeProps {
  tier: Tier;
  size?: "sm" | "md" | "lg";
  variant?: "soft" | "solid" | "outline";
  showIcon?: boolean;
  className?: string;
}

/**
 * @deprecated Use <WorkflowBadge modality={...} /> directly. Kept so old call
 * sites compile during the catalog refactor. Tier "H" → Live, all others → Standard.
 */
export function TierBadge({ tier, size, variant, className }: TierBadgeProps) {
  const kind = tier === "H" ? "live" : "standard";
  return <WorkflowBadge kind={kind} size={size} variant={variant} className={className} />;
}
