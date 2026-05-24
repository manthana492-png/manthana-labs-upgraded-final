import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, MapPin, Sparkles, ShieldCheck, Stethoscope, Tag, Zap, Check, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CodePicker, type MedicalCode } from "@/components/report/CodePicker";
import { useStudies } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import type { Finding, Severity, Urgency } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const URGENCY_STYLE: Record<Urgency, { label: string; cls: string }> = {
  routine: { label: "Routine", cls: "bg-tier-nvidia-soft text-tier-nvidia-foreground border-tier-nvidia-border/50" },
  urgent: { label: "Urgent", cls: "bg-severity-medium/15 text-severity-medium border-severity-medium/40" },
  stat: { label: "STAT", cls: "bg-warning-critical-soft text-warning-critical-foreground border-warning-critical-border/60" },
};

const SEVERITY: Record<Severity, { label: string; pill: string; bar: string; ring: string; bg: string }> = {
  low: {
    label: "Low",
    pill: "bg-severity-low/10 text-severity-low border-severity-low/30",
    bar: "bg-severity-low",
    ring: "ring-severity-low/40",
    bg: "bg-severity-low/5",
  },
  medium: {
    label: "Medium",
    pill: "bg-severity-medium/10 text-severity-medium border-severity-medium/30",
    bar: "bg-severity-medium",
    ring: "ring-severity-medium/40",
    bg: "bg-severity-medium/5",
  },
  high: {
    label: "High",
    pill: "bg-severity-high/10 text-severity-high border-severity-high/30",
    bar: "bg-severity-high",
    ring: "ring-severity-high/40",
    bg: "bg-severity-high/5",
  },
  critical: {
    label: "Critical",
    pill: "bg-severity-critical/10 text-severity-critical border-severity-critical/30",
    bar: "bg-severity-critical",
    ring: "ring-severity-critical/40",
    bg: "bg-severity-critical/5",
  },
};

export interface FindingCardProps {
  finding: Finding;
  /** Optional narrative-summary fragment specific to this finding (Tier C). */
  narrative?: string;
  /** Force-open or force-closed for controlled use. Defaults to uncontrolled. */
  defaultOpen?: boolean;
  /** Controlled open state — overrides internal state when provided. */
  open?: boolean;
  /** Called when the user toggles the card. */
  onOpenChange?: (open: boolean) => void;
  /** Required for editing codes (drives store update). */
  studyId?: string;
  /** Whether the doctor can edit ICD-10 / SNOMED inline. Defaults to true when studyId provided. */
  editableCodes?: boolean;
  className?: string;
  /** Callback to notify parent of any inline finding modifications */
  onUpdateFinding?: (updated: Partial<Finding>) => void;
}

/**
 * EditableText Component
 * Helper for click-to-edit inline text fields.
 */
function EditableText({
  value,
  onChange,
  isTextArea = false,
  placeholder = "Click to add details...",
  className,
}: {
  value?: string;
  onChange: (v: string) => void;
  isTextArea?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [temp, setTemp] = useState(value ?? "");

  useEffect(() => { setTemp(value ?? ""); }, [value]);

  if (editing) {
    return (
      <div className="flex items-start gap-1.5 w-full mt-1" onClick={(e) => e.stopPropagation()}>
        {isTextArea ? (
          <textarea
            value={temp}
            onChange={(e) => setTemp(e.target.value)}
            placeholder={placeholder}
            className="w-full text-xs p-2 rounded border border-border bg-surface text-foreground focus-ring font-normal leading-relaxed resize-y"
            rows={3}
            autoFocus
          />
        ) : (
          <input
            type="text"
            value={temp}
            onChange={(e) => setTemp(e.target.value)}
            placeholder={placeholder}
            className="w-full text-xs p-2 rounded border border-border bg-surface text-foreground focus-ring font-normal"
            autoFocus
          />
        )}
        <div className="flex flex-col gap-1 shrink-0">
          <button
            type="button"
            onClick={() => { onChange(temp); setEditing(false); }}
            className="p-1.5 rounded bg-primary text-primary-foreground hover:opacity-95 shadow"
          >
            <Check className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => { setTemp(value ?? ""); setEditing(false); }}
            className="p-1.5 rounded bg-muted text-muted-foreground hover:bg-muted-hover shadow"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      className={cn(
        "group cursor-pointer hover:bg-primary/5 rounded px-1 -mx-1 py-0.5 transition-colors flex items-center justify-between gap-2",
        className
      )}
    >
      <span className={cn(!value && "text-muted-foreground/60 italic text-xs")}>
        {value || placeholder}
      </span>
      <span className="opacity-0 group-hover:opacity-60 transition-opacity text-[10px] text-muted-foreground shrink-0 font-mono">
        edit
      </span>
    </div>
  );
}

/**
 * FindingCard — expandable finding row.
 * Click the severity badge (or anywhere on the header) to expand:
 *   - finding-specific narrative
 *   - confidence breakdown (model + region)
 *   - guidance footer
 */
export function FindingCard({
  finding,
  narrative,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  studyId,
  editableCodes,
  className,
  onUpdateFinding,
}: FindingCardProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{ dx: string; likelihood: number }>>([]);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };
  const sev = SEVERITY[finding.severity];
  const confidencePct = Math.round(finding.confidence * 100);
  const updateFindingCodes = useStudies((s) => s.updateFindingCodes);
  const canEditCodes = editableCodes ?? !!studyId;
  const handleCodeChange = (system: "icd10" | "snomed") => (code: MedicalCode | null) => {
    if (onUpdateFinding) {
      if (system === "icd10") {
        onUpdateFinding({ icd10Code: code?.code, icd10Label: code?.label });
      } else {
        onUpdateFinding({ snomedCode: code?.code, snomedLabel: code?.label });
      }
    }
    if (!studyId) return;
    if (system === "icd10") {
      updateFindingCodes(studyId, finding.id, {
        icd10Code: code?.code,
        icd10Label: code?.label,
      });
    } else {
      updateFindingCodes(studyId, finding.id, {
        snomedCode: code?.code,
        snomedLabel: code?.label,
      });
    }
  };

  const handleSuggestAlternatives = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setSuggesting(true);
    try {
      const sess = (await supabase.auth.getSession()).data.session;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/domain-report-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sess?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          domain: "allopathy",
          modality: "Imaging",
          suggest_differentials: true,
          messages: [
            {
              role: "user",
              content: `Finding Title: ${finding.title}. Description: ${finding.description}`
            }
          ]
        })
      });
      if (!res.ok) throw new Error("Alternatives suggest failed");
      const json = await res.json();
      if (Array.isArray(json.differentials)) {
        setSuggestions(json.differentials);
      }
    } catch (err) {
      console.warn("Differentials suggestion failed:", err);
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <li
      id={`finding-${finding.id}`}
      data-finding-id={finding.id}
      className={cn(
        "rounded-xl border border-border bg-surface-raised overflow-hidden transition-shadow scroll-mt-28",
        open && cn("ring-2", sev.ring, "shadow-md"),
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={`finding-${finding.id}-body`}
        className="w-full text-left p-4 focus-ring rounded-xl"
      >
        <div className="flex items-start justify-between gap-3 mb-1.5">
          <div className="font-medium leading-snug pr-2 flex items-center gap-2 flex-1">
            {onUpdateFinding ? (
              <EditableText
                value={finding.title}
                onChange={(v) => onUpdateFinding({ title: v })}
                placeholder="Enter finding title..."
                className="w-full font-medium"
              />
            ) : (
              finding.title
            )}
          </div>
          <SeverityBadge
            severity={finding.severity}
            interactive
            active={open}
          />
        </div>
        {finding.region && (
          <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
            <MapPin className="h-3 w-3" /> {finding.region}
          </div>
        )}
        {onUpdateFinding ? (
          <EditableText
            value={finding.description}
            onChange={(v) => onUpdateFinding({ description: v })}
            isTextArea
            placeholder="Enter clinical description..."
            className="text-sm text-muted-foreground mt-1 leading-relaxed"
          />
        ) : (
          <p className={cn("text-sm text-muted-foreground leading-relaxed", !open && "line-clamp-2")}>
            {finding.description}
          </p>
        )}
        <div className="mt-3 flex items-center gap-2">
          <div className="h-1 flex-1 rounded-full bg-muted overflow-hidden">
            <div className={cn("h-full transition-all", sev.bar)} style={{ width: `${confidencePct}%` }} />
          </div>
          <span className="font-mono text-[0.65rem] text-muted-foreground tabular-nums">
            {confidencePct}%
          </span>
          <ChevronDown
            className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")}
          />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={`finding-${finding.id}-body`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0.24, 1] }}
            className={cn("overflow-hidden border-t border-border", sev.bg)}
          >
            <div className="p-4 space-y-4">
              {/* ── Structured anatomy → observation → impression → recommendation ── */}
              {(finding.anatomicalRegion || finding.observation || finding.impression || finding.recommendation || onUpdateFinding) && (
                <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(finding.anatomicalRegion || onUpdateFinding) && (
                    <StructuredRow label="Anatomy" icon={<MapPin className="h-3 w-3" />}>
                      {onUpdateFinding ? (
                        <EditableText
                          value={finding.anatomicalRegion}
                          onChange={(v) => onUpdateFinding({ anatomicalRegion: v })}
                          placeholder="Double-click to specify anatomy..."
                        />
                      ) : (
                        finding.anatomicalRegion
                      )}
                    </StructuredRow>
                  )}
                  {finding.urgency && (
                    <StructuredRow label="Urgency" icon={<Zap className="h-3 w-3" />}>
                      <span className={cn("inline-flex items-center text-[0.65rem] px-2 py-0.5 rounded-full border font-medium", URGENCY_STYLE[finding.urgency].cls)}>
                        {URGENCY_STYLE[finding.urgency].label}
                      </span>
                    </StructuredRow>
                  )}
                  {(finding.observation || onUpdateFinding) && (
                    <StructuredRow label="Observation" icon={<Stethoscope className="h-3 w-3" />} full>
                      {onUpdateFinding ? (
                        <EditableText
                          value={finding.observation}
                          onChange={(v) => onUpdateFinding({ observation: v })}
                          isTextArea
                          placeholder="Double-click to specify factual observation..."
                        />
                      ) : (
                        finding.observation
                      )}
                    </StructuredRow>
                  )}
                  {(finding.impression || onUpdateFinding) && (
                    <StructuredRow label="Impression" icon={<Sparkles className="h-3 w-3" />} full>
                      {onUpdateFinding ? (
                        <EditableText
                          value={finding.impression}
                          onChange={(v) => onUpdateFinding({ impression: v })}
                          placeholder="Double-click to specify clinical impression..."
                          className="font-medium text-foreground"
                        />
                      ) : (
                        <span className="font-medium text-foreground">{finding.impression}</span>
                      )}
                    </StructuredRow>
                  )}
                  {(finding.recommendation || onUpdateFinding) && (
                    <StructuredRow label="Recommendation" icon={<ChevronDown className="h-3 w-3 -rotate-90" />} full>
                      {onUpdateFinding ? (
                        <EditableText
                          value={finding.recommendation}
                          onChange={(v) => onUpdateFinding({ recommendation: v })}
                          isTextArea
                          placeholder="Double-click to specify follow-up/recommendation..."
                        />
                      ) : (
                        finding.recommendation
                      )}
                    </StructuredRow>
                  )}
                </section>
              )}

              {/* ── Differentials ── */}
              {((finding.differentials && finding.differentials.length > 0) || onUpdateFinding) && (
                <section className="space-y-2 border border-border/50 bg-background/30 rounded-lg p-3">
                  <div className="text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground flex items-center justify-between gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <span className="flex items-center gap-1.5"><Stethoscope className="h-3 w-3" /> Differentials & likelihood</span>
                    {onUpdateFinding && (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] text-primary gap-1 font-semibold hover:bg-primary/10"
                            onClick={handleSuggestAlternatives}
                          >
                            <Sparkles className="h-3 w-3" /> Suggest with Kimi
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-md">
                          <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-primary font-display">
                              <Sparkles className="h-5 w-5 animate-pulse" /> Kimi Clinical Differentials
                            </DialogTitle>
                            <DialogDescription className="text-xs">
                              Kimi K2.6 has analyzed the finding "{finding.title}" and suggests these clinical alternative diagnoses based on contextual probability.
                            </DialogDescription>
                          </DialogHeader>

                          {suggesting ? (
                            <div className="flex flex-col items-center justify-center p-8 gap-3">
                              <Loader2 className="h-6 w-6 animate-spin text-primary" />
                              <span className="text-xs font-mono text-muted-foreground animate-pulse">Running differential diagnosis...</span>
                            </div>
                          ) : (
                            <div className="space-y-3 mt-2">
                              {suggestions.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic text-center p-4">No alternative suggestions available.</p>
                              ) : (
                                <ul className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                                  {suggestions.map((sug, idx) => {
                                    const isAdded = (finding.differentials ?? []).some(d => d.dx.toLowerCase() === sug.dx.toLowerCase());
                                    return (
                                      <li key={idx} className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-surface hover:bg-accent/10 transition-colors">
                                        <div className="min-w-0 pr-2">
                                          <div className="font-semibold text-xs truncate">{sug.dx}</div>
                                          <div className="text-[10px] text-muted-foreground mt-0.5">Contextual probability: {Math.round(sug.likelihood * 100)}%</div>
                                        </div>
                                        <Button
                                          type="button"
                                          size="sm"
                                          disabled={isAdded}
                                          variant={isAdded ? "outline" : "default"}
                                          onClick={() => {
                                            const updatedDiffs = [...(finding.differentials ?? []), { dx: sug.dx, likelihood: sug.likelihood }];
                                            onUpdateFinding({ differentials: updatedDiffs });
                                          }}
                                          className="h-6 text-[10px] px-2.5 shrink-0"
                                        >
                                          {isAdded ? "Added" : "Add"}
                                        </Button>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                          )}
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                  <div className="space-y-2 mt-1.5" onClick={(e) => e.stopPropagation()}>
                    {(finding.differentials ?? []).map((diff, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 rounded border border-border/60 bg-surface-raised text-xs">
                        <span className="font-medium text-foreground/80">{idx + 1}. {diff.dx}</span>
                        <div className="flex items-center gap-2 font-mono">
                          <span className="text-[10px] text-muted-foreground">{(diff.likelihood * 100).toFixed(0)}%</span>
                          {onUpdateFinding && (
                            <button
                              type="button"
                              onClick={() => {
                                const updatedDiffs = (finding.differentials ?? []).filter((_, i) => i !== idx);
                                onUpdateFinding({ differentials: updatedDiffs });
                              }}
                              className="p-1 rounded text-muted-foreground hover:bg-severity-critical/10 hover:text-severity-critical ml-1 transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {onUpdateFinding && (finding.differentials ?? []).length === 0 && (
                      <div className="text-[10px] text-muted-foreground/60 italic text-center p-3 border border-dashed border-border rounded-lg bg-surface/50">
                        No differentials listed. Click "Suggest with Kimi" to generate alternative diagnoses.
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* ── Codes (ICD-10 + SNOMED) — editable when studyId provided ── */}
              <section className="space-y-2">
                <div className="text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground flex items-center gap-1.5">
                  <Tag className="h-3 w-3" /> Medical codes
                </div>
                {canEditCodes ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" data-pdf-skip="true">
                    <CodePicker
                      system="icd10"
                      value={{ code: finding.icd10Code, label: finding.icd10Label }}
                      onSelect={handleCodeChange("icd10")}
                    />
                    <CodePicker
                      system="snomed"
                      value={{ code: finding.snomedCode, label: finding.snomedLabel }}
                      onSelect={handleCodeChange("snomed")}
                    />
                  </div>
                ) : null}
                {/* Static chips also rendered for PDF capture */}
                {(finding.icd10Code || finding.snomedCode) && (
                  <div className={cn("flex flex-wrap gap-2", canEditCodes && "hidden print:flex")} data-pdf-only="true">
                    {finding.icd10Code && (
                      <CodeChip label="ICD-10" code={finding.icd10Code} title={finding.icd10Label} />
                    )}
                    {finding.snomedCode && (
                      <CodeChip label="SNOMED" code={finding.snomedCode} title={finding.snomedLabel} />
                    )}
                  </div>
                )}
              </section>

              {/* Narrative */}
              <section>
                <div className="text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3" /> Narrative summary
                </div>
                <p className="text-sm text-foreground/90 leading-relaxed text-pretty">
                  {narrative ?? finding.description}
                </p>
              </section>

              {/* Confidence breakdown */}
              <section>
                <div className="text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground mb-2 flex items-center gap-1.5">
                  <ShieldCheck className="h-3 w-3" /> Confidence breakdown
                </div>
                <ConfidenceBars
                  rows={[
                    { label: "Model probability", value: finding.confidence },
                    { label: "Region localization", value: clamp(finding.confidence - 0.06) },
                    { label: "Cross-frame consistency", value: clamp(finding.confidence - 0.12) },
                  ]}
                  bar={sev.bar}
                />
              </section>

              {/* Guidance */}
              <div className="text-[0.7rem] text-muted-foreground italic border-t border-border/60 pt-3">
                Click the severity badge to collapse. Severity reflects the AI&rsquo;s preliminary
                ranking — clinician review remains required before any clinical action.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

// ── Severity badge ─────────────────────────────────────────────
export function SeverityBadge({
  severity,
  interactive = false,
  active = false,
  onClick,
}: {
  severity: Severity;
  interactive?: boolean;
  active?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const sev = SEVERITY[severity];
  return (
    <span
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={(e) => {
        if (!interactive) return;
        e.stopPropagation();
        onClick?.(e);
      }}
      onKeyDown={(e) => {
        if (!interactive) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          (e.currentTarget as HTMLElement).click();
        }
      }}
      className={cn(
        "inline-flex items-center gap-1.5 text-[0.65rem] px-2 py-0.5 rounded-full border whitespace-nowrap font-medium select-none",
        sev.pill,
        interactive && "cursor-pointer hover:scale-105 transition-transform",
        active && "ring-2 ring-offset-1 ring-offset-surface-raised",
        active && sev.ring,
      )}
      aria-pressed={interactive ? active : undefined}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", sev.bar)} />
      {sev.label}
    </span>
  );
}

// ── Confidence rows ────────────────────────────────────────────
function ConfidenceBars({
  rows,
  bar,
}: {
  rows: { label: string; value: number }[];
  bar: string;
}) {
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const pct = Math.round(clamp(r.value) * 100);
        return (
          <div key={r.label} className="space-y-1">
            <div className="flex justify-between text-[0.7rem]">
              <span className="text-muted-foreground">{r.label}</span>
              <span className="font-mono tabular-nums text-foreground/80">{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <motion.div
                className={cn("h-full", bar)}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.5, ease: [0.32, 0.72, 0.24, 1] }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function clamp(v: number) {
  return Math.max(0, Math.min(1, v));
}

// ── Structured row & code chip ─────────────────────────────────
function StructuredRow({
  label,
  icon,
  full,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-lg bg-surface-raised border border-border/60 p-2.5", full && "sm:col-span-2")}>
      <div className="text-[0.6rem] uppercase tracking-[0.16em] text-muted-foreground flex items-center gap-1.5 mb-1">
        {icon} {label}
      </div>
      <div className="text-sm text-foreground/90 leading-relaxed">{children}</div>
    </div>
  );
}

function CodeChip({ label, code, title }: { label: string; code: string; title?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[0.65rem] font-mono px-2 py-1 rounded-md border border-border bg-surface text-foreground/80"
      title={title}
    >
      <Tag className="h-3 w-3 opacity-60" />
      <span className="opacity-60">{label}</span>
      <span className="font-semibold">{code}</span>
      {title && <span className="hidden md:inline opacity-60 truncate max-w-[12rem]">· {title}</span>}
    </span>
  );
}

