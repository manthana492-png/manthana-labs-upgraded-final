import { cn } from "@/lib/utils";
import { Radio, FileImage, Lock } from "lucide-react";
import type { Modality } from "@/lib/types";
import { laneForModality, isLocked } from "@/lib/catalog";

interface WorkflowBadgeProps {
  modality?: Pick<Modality, "slug" | "category" | "tier">;
  variant?: "soft" | "solid" | "outline";
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Force a specific look without inferring from modality. */
  kind?: "standard" | "live" | "locked";
}

/**
 * WorkflowBadge — the single, neutral trust marker shown across the product.
 *  - "Standard" = uploaded study (calm clinical teal/slate)
 *  - "Live"     = real-time bedside capture (vivid violet)
 *  - "Locked"   = 3D volumetric · Coming Soon
 *
 * No vendor or model names. Trust comes from confidence + clinician sign-off.
 */
export function WorkflowBadge({
  modality,
  variant = "soft",
  size = "md",
  className,
  kind,
}: WorkflowBadgeProps) {
  const resolved: "standard" | "live" | "locked" =
    kind ??
    (modality
      ? isLocked(modality)
        ? "locked"
        : laneForModality(modality) === "live"
        ? "live"
        : "standard"
      : "standard");

  const Icon = resolved === "live" ? Radio : resolved === "locked" ? Lock : FileImage;
  const label =
    resolved === "live"
      ? "Live"
      : resolved === "locked"
      ? "Coming Soon"
      : "Standard";

  const sizeCls = {
    sm: "text-[0.625rem] px-2 py-0.5 gap-1",
    md: "text-[0.7rem] px-2.5 py-1 gap-1.5",
    lg: "text-xs px-3 py-1.5 gap-1.5",
  }[size];
  const iconSize = { sm: 10, md: 12, lg: 14 }[size];

  const palette =
    resolved === "live"
      ? variant === "solid"
        ? "bg-tier-hybrid text-white"
        : variant === "outline"
        ? "border border-tier-hybrid-border text-tier-hybrid-foreground bg-transparent"
        : "bg-tier-hybrid-soft text-tier-hybrid-foreground border border-tier-hybrid-border/60"
      : resolved === "locked"
      ? variant === "solid"
        ? "bg-muted-foreground text-background"
        : "bg-muted text-muted-foreground border border-border"
      : variant === "solid"
      ? "bg-primary text-primary-foreground"
      : variant === "outline"
      ? "border border-border text-foreground bg-transparent"
      : "bg-accent text-accent-foreground border border-border";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium tracking-tight whitespace-nowrap",
        sizeCls,
        palette,
        className,
      )}
    >
      <Icon size={iconSize} strokeWidth={2.4} />
      {label}
    </span>
  );
}
