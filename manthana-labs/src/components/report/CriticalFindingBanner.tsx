import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertOctagon, PhoneCall, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useStudies, useAuth } from "@/lib/store";
import { toast } from "@/hooks/use-toast";

/**
 * CriticalFindingBanner
 * ─────────────────────────────────────────────────────────────────────
 * Mirrors ACR's actionable-findings guideline. When ANY finding has
 * severity = "critical", the doctor must record who they communicated
 * the result to (referrer / patient / OPD) before the report is
 * considered closed-loop.
 *
 * Once acknowledged it shrinks to a green confirmation strip.
 */
export interface CriticalFindingBannerProps {
  studyId: string;
  className?: string;
}

const TARGETS = [
  { value: "referrer", label: "Referring physician" },
  { value: "patient", label: "Patient (direct)" },
  { value: "opd", label: "OPD / on-call team" },
  { value: "emergency", label: "Emergency department" },
];

export function CriticalFindingBanner({ studyId, className }: CriticalFindingBannerProps) {
  const study = useStudies((s) => s.studies.find((x) => x.id === studyId));
  const acknowledgeCritical = useStudies((s) => s.acknowledgeCritical);
  const doctor = useAuth((s) => s.doctor);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string>("referrer");

  if (!study?.report) return null;
  const hasCritical = study.report.findings.some((f) => f.severity === "critical");
  if (!hasCritical) return null;

  const acknowledged = !!study.report.criticalAcknowledgedAt;
  const criticalCount = study.report.findings.filter((f) => f.severity === "critical").length;

  const onConfirm = () => {
    const label = TARGETS.find((t) => t.value === target)?.label ?? target;
    acknowledgeCritical(studyId, label, doctor?.fullName ?? "Reviewing clinician");
    toast({
      title: "Critical communication logged",
      description: `Recipient: ${label}`,
    });
    setOpen(false);
  };

  if (acknowledged) {
    return (
      <div
        className={cn(
          "rounded-xl border border-tier-nvidia-border/60 bg-tier-nvidia-soft text-tier-nvidia-foreground p-3 flex items-start gap-2.5",
          className,
        )}
      >
        <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="text-xs flex-1">
          <span className="font-medium">Critical findings communicated</span> to{" "}
          <span className="font-medium">{study.report.criticalCallbackTarget}</span> by{" "}
          {study.report.criticalAcknowledgedBy} on{" "}
          {new Date(study.report.criticalAcknowledgedAt!).toLocaleString("en-IN")}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-xl border-2 border-warning-critical bg-warning-critical-soft text-warning-critical-foreground overflow-hidden shadow-md",
        className,
      )}
    >
      <div className="p-4 flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-warning-critical text-white flex items-center justify-center shrink-0">
          <AlertOctagon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display text-base tracking-tight font-semibold">
            Actionable critical finding{criticalCount > 1 ? "s" : ""} ({criticalCount})
          </div>
          <p className="text-xs mt-0.5 leading-relaxed">
            ACR actionable-findings policy: this report cannot be closed until you have communicated
            the result to a responsible recipient and recorded it below.
          </p>
        </div>
        {!open && (
          <Button
            size="sm"
            onClick={() => setOpen(true)}
            className="bg-warning-critical hover:bg-warning-critical/90 text-white shrink-0"
          >
            <PhoneCall className="h-3.5 w-3.5 mr-1.5" /> Log communication
          </Button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-warning-critical/40 bg-warning-critical-soft/60 overflow-hidden"
          >
            <div className="p-4 space-y-3">
              <div className="text-xs uppercase tracking-[0.14em] font-medium opacity-80">
                Who did you communicate this to?
              </div>
              <div className="grid grid-cols-2 gap-2">
                {TARGETS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTarget(t.value)}
                    className={cn(
                      "text-left text-sm rounded-lg border px-3 py-2 transition-colors",
                      target === t.value
                        ? "border-warning-critical bg-warning-critical text-white font-medium"
                        : "border-warning-critical/40 bg-surface-raised hover:bg-warning-critical/10",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                  className="text-warning-critical-foreground hover:bg-warning-critical/10"
                >
                  <X className="h-3.5 w-3.5 mr-1" /> Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={onConfirm}
                  className="bg-warning-critical hover:bg-warning-critical/90 text-white"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Confirm acknowledgment
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
