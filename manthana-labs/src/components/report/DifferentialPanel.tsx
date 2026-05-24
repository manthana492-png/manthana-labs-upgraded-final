import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Stethoscope, ThumbsUp, ThumbsDown, ChevronDown } from "lucide-react";
import { useState } from "react";
import type { Differential } from "@/lib/types";

/**
 * DifferentialPanel
 * ─────────────────────────────────────────────────────────────────────
 * Side panel that shows ranked differential diagnoses for a finding,
 * with likelihood bars and supporting / opposing features — the way
 * radiologists actually reason.
 */
export interface DifferentialPanelProps {
  findingTitle?: string;
  differentials?: Differential[];
  className?: string;
}

export function DifferentialPanel({ findingTitle, differentials, className }: DifferentialPanelProps) {
  if (!differentials || differentials.length === 0) {
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed border-border bg-surface p-5 text-sm text-muted-foreground",
          className,
        )}
      >
        No differential diagnoses generated for this finding.
      </div>
    );
  }

  // Sort high → low likelihood
  const sorted = [...differentials].sort((a, b) => b.likelihood - a.likelihood);

  return (
    <div className={cn("rounded-xl border border-border bg-surface-raised overflow-hidden", className)}>
      <div className="px-4 py-3 border-b border-border bg-surface flex items-center gap-2">
        <Stethoscope className="h-4 w-4 text-primary" />
        <div className="min-w-0">
          <div className="text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">
            Differential diagnosis
          </div>
          {findingTitle && (
            <div className="text-sm font-medium truncate" title={findingTitle}>
              {findingTitle}
            </div>
          )}
        </div>
      </div>
      <ul className="divide-y divide-border">
        {sorted.map((d, i) => (
          <DxRow key={`${d.dx}-${i}`} d={d} top={i === 0} />
        ))}
      </ul>
      <div className="px-4 py-2.5 text-[0.7rem] text-muted-foreground italic border-t border-border bg-surface">
        Likelihoods are model estimates — clinician judgment supersedes any AI ranking.
      </div>
    </div>
  );
}

function DxRow({ d, top }: { d: Differential; top: boolean }) {
  const [open, setOpen] = useState(top);
  const pct = Math.round(Math.max(0, Math.min(1, d.likelihood)) * 100);
  const hasFeatures =
    (d.supportingFeatures && d.supportingFeatures.length > 0) ||
    (d.opposingFeatures && d.opposingFeatures.length > 0);

  return (
    <li className="px-4 py-3">
      <button
        type="button"
        onClick={() => hasFeatures && setOpen((v) => !v)}
        className={cn(
          "w-full text-left focus-ring rounded-md",
          hasFeatures ? "cursor-pointer" : "cursor-default",
        )}
        aria-expanded={open}
      >
        <div className="flex items-center justify-between gap-3 mb-1.5">
          <div className="flex items-center gap-2 min-w-0">
            {top && (
              <span className="text-[0.6rem] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                Top
              </span>
            )}
            <span className="font-medium text-sm truncate">{d.dx}</span>
            {d.icd10Code && (
              <span className="text-[0.65rem] font-mono text-muted-foreground border border-border rounded px-1.5 py-0.5 hidden sm:inline">
                {d.icd10Code}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-mono tabular-nums text-xs text-foreground/80">{pct}%</span>
            {hasFeatures && (
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 text-muted-foreground transition-transform",
                  open && "rotate-180",
                )}
              />
            )}
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <motion.div
            className={cn(
              "h-full",
              pct >= 60 ? "bg-primary" : pct >= 30 ? "bg-severity-medium" : "bg-muted-foreground/40",
            )}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.45, ease: [0.32, 0.72, 0.24, 1] }}
          />
        </div>
      </button>

      {open && hasFeatures && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2"
        >
          {d.supportingFeatures && d.supportingFeatures.length > 0 && (
            <FeatureBlock
              kind="support"
              title="Supporting"
              icon={<ThumbsUp className="h-3 w-3" />}
              items={d.supportingFeatures}
            />
          )}
          {d.opposingFeatures && d.opposingFeatures.length > 0 && (
            <FeatureBlock
              kind="oppose"
              title="Opposing"
              icon={<ThumbsDown className="h-3 w-3" />}
              items={d.opposingFeatures}
            />
          )}
        </motion.div>
      )}
    </li>
  );
}

function FeatureBlock({
  kind,
  title,
  icon,
  items,
}: {
  kind: "support" | "oppose";
  title: string;
  icon: React.ReactNode;
  items: string[];
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-2.5 text-xs",
        kind === "support"
          ? "border-tier-nvidia-border/50 bg-tier-nvidia-soft/50 text-tier-nvidia-foreground"
          : "border-warning-critical-border/40 bg-warning-critical-soft/40 text-warning-critical-foreground",
      )}
    >
      <div className="flex items-center gap-1.5 font-medium mb-1.5">
        {icon}
        <span>{title}</span>
      </div>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="leading-snug pl-3 relative">
            <span className="absolute left-0 top-1.5 h-1 w-1 rounded-full bg-current opacity-70" />
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
