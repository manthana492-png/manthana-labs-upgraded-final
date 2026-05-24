import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Zap, CheckCircle2, X, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useStudies, useAuth } from "@/lib/store";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Finding } from "@/lib/types";

const TARGETS = [
  { value: "referrer", label: "Referring physician" },
  { value: "patient", label: "Patient (direct)" },
  { value: "opd", label: "OPD / on-call team" },
  { value: "emergency", label: "Emergency department" },
] as const;

type TargetValue = (typeof TARGETS)[number]["value"];

/**
 * Pre-filled, audit-grade communication note templates.
 * `{time}` is replaced with the current IST timestamp at confirmation,
 * `{finding}` with the finding title — so the note is always a complete,
 * specific sentence without manual typing.
 */
const NOTE_TEMPLATES: Record<"stat" | "urgent", Record<TargetValue, string[]>> = {
  stat: {
    referrer: [
      "Spoke to referring physician at {time} IST about {finding}. Acknowledged; patient being recalled urgently.",
      "Direct call to referring physician at {time} IST regarding {finding}. Verbal handover completed.",
    ],
    patient: [
      "Spoke to patient at {time} IST and advised immediate ED visit for {finding}. Patient confirmed compliance.",
      "Patient counselled at {time} IST about {finding} and instructed to proceed to nearest emergency facility now.",
    ],
    opd: [
      "Notified on-call OPD team at {time} IST about {finding}. Team aware and arranging review.",
      "Handover to on-call team at {time} IST for {finding}; patient flagged for priority assessment.",
    ],
    emergency: [
      "Spoke to ED registrar at {time} IST about {finding}. Patient transferred / directed to resus.",
      "Direct call to ED at {time} IST regarding {finding}. Receiving team accepted handover.",
    ],
  },
  urgent: {
    referrer: [
      "Called referring physician at {time} IST about {finding}. Plan: timely follow-up imaging / review.",
      "Informed referring physician at {time} IST regarding {finding}; reviewed next-step recommendation.",
    ],
    patient: [
      "Counselled patient at {time} IST about {finding} and advised follow-up within 24–48 hours.",
      "Patient informed at {time} IST regarding {finding}; understands urgency and next steps.",
    ],
    opd: [
      "Notified OPD team at {time} IST about {finding} for follow-up scheduling.",
      "Handover to OPD at {time} IST for {finding}; review appointment to be arranged.",
    ],
    emergency: [
      "Called ED at {time} IST about {finding}. Advised low-threshold review if symptoms progress.",
      "Briefed ED team at {time} IST regarding {finding} for awareness and contingency.",
    ],
  },
};

/**
 * UrgencyEscalationGate
 * Required for every finding flagged urgent / stat. Doctor must:
 *   1. Acknowledge
 *   2. Pick a callback target
 *   3. Enter a brief communication note
 * before PDF / FHIR export of the report.
 *
 * Once all gates are cleared the export buttons unlock.
 */
export function UrgencyEscalationGate({
  studyId,
  findings,
  className,
}: {
  studyId: string;
  findings: Finding[];
  className?: string;
}) {
  const acknowledgeEscalation = useStudies((s) => s.acknowledgeEscalation);
  const doctor = useAuth((s) => s.doctor);

  const queue = findings.filter(
    (f) =>
      (f.urgency === "urgent" || f.urgency === "stat") &&
      f.severity !== "critical" /* critical handled by separate ACR banner */ &&
      !f.escalationAcknowledged,
  );
  const completed = findings.filter(
    (f) => (f.urgency === "urgent" || f.urgency === "stat") && f.escalationAcknowledged,
  );

  if (queue.length === 0 && completed.length === 0) return null;

  return (
    <section
      className={cn(
        "rounded-xl border-2 overflow-hidden",
        queue.length > 0
          ? "border-severity-high/60 bg-severity-high/5"
          : "border-tier-nvidia-border/60 bg-tier-nvidia-soft",
        className,
      )}
      data-pdf-skip="true"
    >
      <header className="flex items-start gap-3 p-4">
        <div
          className={cn(
            "h-10 w-10 rounded-full flex items-center justify-center shrink-0 text-white",
            queue.length > 0 ? "bg-severity-high" : "bg-tier-nvidia",
          )}
        >
          {queue.length > 0 ? <Zap className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "font-display text-base tracking-tight font-semibold",
              queue.length > 0 ? "text-severity-high" : "text-tier-nvidia-foreground",
            )}
          >
            {queue.length > 0
              ? `${queue.length} urgent finding${queue.length > 1 ? "s need" : " needs"} escalation`
              : `All urgent findings acknowledged (${completed.length})`}
          </div>
          <p className="text-xs mt-0.5 text-muted-foreground leading-relaxed">
            Urgent and STAT findings require a documented escalation step before the report can
            be exported to PDF or FHIR. Acknowledge each below.
          </p>
        </div>
      </header>

      <div className="border-t border-border/60 divide-y divide-border/40">
        {[...queue, ...completed].map((f) => (
          <EscalationRow
            key={f.id}
            finding={f}
            studyId={studyId}
            doctorName={doctor?.fullName ?? "Reviewing clinician"}
            onSubmit={(callbackTarget, communicationNote) =>
              acknowledgeEscalation(studyId, f.id, {
                callbackTarget,
                communicationNote,
                doctorName: doctor?.fullName ?? "Reviewing clinician",
              })
            }
          />
        ))}
      </div>
    </section>
  );
}

function EscalationRow({
  finding,
  onSubmit,
}: {
  finding: Finding;
  studyId: string;
  doctorName: string;
  onSubmit: (callbackTarget: string, communicationNote: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [target, setTarget] = useState<TargetValue>("referrer");
  const [templateIdx, setTemplateIdx] = useState(0);

  const isStat = finding.urgency === "stat";
  const done = !!finding.escalationAcknowledged;

  const templates = useMemo(
    () => NOTE_TEMPLATES[isStat ? "stat" : "urgent"][target],
    [isStat, target],
  );

  const buildNote = () => {
    const time = new Date().toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return templates[templateIdx]
      .replace("{time}", time)
      .replace("{finding}", finding.title);
  };

  const submit = () => {
    if (!acknowledged) {
      toast({ title: "Please tick the acknowledgment checkbox first." });
      return;
    }
    const label = TARGETS.find((t) => t.value === target)?.label ?? target;
    const note = buildNote();
    onSubmit(label, note);
    toast({ title: "Escalation logged", description: `${finding.title} → ${label}` });
    setOpen(false);
  };

  return (
    <div className="p-4">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 inline-flex items-center gap-1 text-[0.6rem] uppercase tracking-[0.14em] font-semibold rounded-full px-2 py-0.5 shrink-0 border",
            isStat
              ? "bg-warning-critical text-white border-warning-critical"
              : "bg-severity-medium/15 text-severity-medium border-severity-medium/40",
          )}
        >
          {isStat ? <AlertTriangle className="h-2.5 w-2.5" /> : <Zap className="h-2.5 w-2.5" />}
          {finding.urgency}
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm leading-snug">{finding.title}</div>
          {finding.recommendation && (
            <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
              {finding.recommendation}
            </div>
          )}
          {done && (
            <div className="text-[0.7rem] text-tier-nvidia-foreground mt-1.5 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Escalated to{" "}
              <span className="font-medium">{finding.escalationCallbackTarget}</span>
              {finding.escalationAcknowledgedAt && (
                <span className="opacity-70">
                  · {new Date(finding.escalationAcknowledgedAt).toLocaleString("en-IN")}
                </span>
              )}
            </div>
          )}
          {done && finding.escalationCommunicationNote && (
            <div className="text-[0.7rem] text-foreground/75 mt-1 italic">
              "{finding.escalationCommunicationNote}"
            </div>
          )}
        </div>
        {!done && (
          <Button
            size="sm"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "shrink-0",
              isStat
                ? "bg-warning-critical hover:bg-warning-critical/90 text-white"
                : "bg-severity-high hover:bg-severity-high/90 text-white",
            )}
          >
            <Phone className="h-3.5 w-3.5 mr-1.5" /> {open ? "Cancel" : "Escalate"}
          </Button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && !done && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-3 rounded-lg bg-surface-raised border border-border p-3">
              {/* Step 1 — checkbox */}
              <label className="flex items-start gap-2.5 cursor-pointer">
                <Checkbox
                  checked={acknowledged}
                  onCheckedChange={(v) => setAcknowledged(Boolean(v))}
                  className="mt-0.5"
                />
                <span className="text-xs leading-relaxed">
                  I confirm I have personally communicated this {isStat ? "STAT" : "urgent"} finding
                  to a responsible clinical recipient and that this entry is binding and auditable.
                </span>
              </label>

              {/* Step 2 — target */}
              <div>
                <div className="text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground mb-1.5">
                  Callback target
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {TARGETS.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => {
                        setTarget(t.value);
                        setTemplateIdx(0);
                      }}
                      className={cn(
                        "text-left text-xs rounded-md border px-2.5 py-1.5 transition-colors",
                        target === t.value
                          ? "border-primary bg-primary text-primary-foreground font-medium"
                          : "border-border bg-surface hover:bg-accent/40",
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 3 — pick a prefilled communication template */}
              <div>
                <div className="text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground mb-1.5">
                  Communication template
                </div>
                <div className="space-y-1.5">
                  {templates.map((tmpl, i) => {
                    const preview = tmpl
                      .replace("{time}", "now")
                      .replace("{finding}", finding.title);
                    const selected = templateIdx === i;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setTemplateIdx(i)}
                        className={cn(
                          "w-full text-left text-xs rounded-md border px-3 py-2 transition-colors leading-relaxed",
                          selected
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border bg-surface hover:bg-accent/40 text-foreground/80",
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className={cn(
                              "mt-0.5 h-3.5 w-3.5 rounded-full border shrink-0",
                              selected ? "bg-primary border-primary" : "border-muted-foreground/40",
                            )}
                          />
                          <span>{preview}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[0.65rem] text-muted-foreground mt-1.5">
                  Timestamp will be auto-stamped on confirmation for audit.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                  <X className="h-3.5 w-3.5 mr-1" /> Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={submit}
                  disabled={!acknowledged}
                  className="bg-primary hover:bg-primary/90"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Confirm escalation
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Helper exported for ReportViewer: are all urgent/stat findings escalated? */
export function urgencyGateCleared(findings: Finding[]): boolean {
  return findings.every(
    (f) => !(f.urgency === "urgent" || f.urgency === "stat") || f.escalationAcknowledged === true,
  );
}
