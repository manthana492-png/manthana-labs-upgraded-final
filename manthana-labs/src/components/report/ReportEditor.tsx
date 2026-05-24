import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  Save,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  X,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { Finding, Report, Severity, Urgency } from "@/lib/types";
import { saveEditedReport } from "@/lib/reportEdit";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  studyId: string;
  report: Report;
  /** Called with the saved report so caller can refresh local cache. */
  onSaved: (next: Report) => void;
}

const SEVERITIES: Severity[] = ["low", "medium", "high", "critical"];
const URGENCIES: Urgency[] = ["routine", "urgent", "stat"];

function newFinding(): Finding {
  return {
    id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: "New finding",
    description: "",
    severity: "low",
    confidence: 0.5,
    urgency: "routine",
  };
}

/**
 * ReportEditor — full-screen, mobile-first manual edit surface.
 *
 * Doctors may optionally tweak the AI's report before signing.
 * Editing is **never compulsory**; closing without saves leaves the
 * AI version intact. The first save snapshots the AI version into
 * `original_report` for medico-legal audit.
 */
export function ReportEditor({ open, onOpenChange, studyId, report, onSaved }: Props) {
  const [draft, setDraft] = useState<Report>(report);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (open) {
      setDraft(report);
      // Auto-expand the first finding for fast access; collapse the rest.
      const first = report.findings[0]?.id;
      setExpanded(first ? { [first]: true } : {});
    }
  }, [open, report]);

  const updateFinding = (id: string, patch: Partial<Finding>) =>
    setDraft((d) => ({
      ...d,
      findings: d.findings.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }));

  const removeFinding = (id: string) =>
    setDraft((d) => ({ ...d, findings: d.findings.filter((f) => f.id !== id) }));

  const addFinding = () => {
    const f = newFinding();
    setDraft((d) => ({ ...d, findings: [...d.findings, f] }));
    setExpanded((e) => ({ ...e, [f.id]: true }));
  };

  const updateGap = (i: number, value: string) =>
    setDraft((d) => {
      const gaps = [...(d.informationGaps ?? [])];
      gaps[i] = value;
      return { ...d, informationGaps: gaps };
    });
  const removeGap = (i: number) =>
    setDraft((d) => ({
      ...d,
      informationGaps: (d.informationGaps ?? []).filter((_, idx) => idx !== i),
    }));
  const addGap = () =>
    setDraft((d) => ({ ...d, informationGaps: [...(d.informationGaps ?? []), ""] }));

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(report),
    [draft, report],
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const cleaned: Report = {
        ...draft,
        informationGaps: (draft.informationGaps ?? [])
          .map((g) => g.trim())
          .filter(Boolean),
      };
      await saveEditedReport(studyId, cleaned);
      onSaved(cleaned);
      toast({
        title: "Report saved",
        description: "Doctor edits stored. Original AI version is preserved.",
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Could not save",
        description: err instanceof Error ? err.message : "Try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setDraft(report);
    toast({ title: "Reverted to current report", description: "All in-progress edits discarded." });
  };

  const handleClose = () => {
    if (dirty) {
      const ok = window.confirm(
        "Discard your unsaved edits? The AI report will remain unchanged.",
      );
      if (!ok) return;
    }
    onOpenChange(false);
  };

  const toggle = (id: string) =>
    setExpanded((e) => ({ ...e, [id]: !e[id] }));

  const expandAll = () =>
    setExpanded(Object.fromEntries(draft.findings.map((f) => [f.id, true])));
  const collapseAll = () => setExpanded({});

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : handleClose())}>
      <DialogContent
        className={cn(
          // Mobile: full-screen sheet. Desktop: comfortable max-width.
          "p-0 gap-0 overflow-hidden flex flex-col",
          "w-screen h-[100dvh] max-w-none rounded-none",
          "sm:w-[min(100vw,52rem)] sm:max-w-[52rem] sm:h-[min(92vh,52rem)] sm:rounded-2xl",
        )}
        // Use our own close button so we can intercept dirty state.
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          handleClose();
        }}
        onPointerDownOutside={(e) => {
          e.preventDefault();
        }}
      >
        {/* ── Sticky header ── */}
        <DialogHeader className="px-4 sm:px-6 pt-4 pb-3 border-b border-border bg-background/95 backdrop-blur sticky top-0 z-10">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <DialogTitle className="font-display text-lg sm:text-2xl tracking-tight">
                Edit report
                <span className="ml-2 text-[0.65rem] font-normal uppercase tracking-[0.18em] text-muted-foreground align-middle">
                  Pre-sign · optional
                </span>
              </DialogTitle>
              <p className="text-[0.7rem] sm:text-xs text-muted-foreground mt-1 leading-relaxed">
                Tweak only what you need. Skip fields you agree with — the AI version stays untouched.
              </p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleClose}
              aria-label="Close editor"
              className="h-8 w-8 -mt-1 -mr-1 shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 space-y-5">
          {/* Audit notice */}
          <div className="rounded-lg border border-warning-critical-border/40 bg-warning-critical-soft/40 p-3 text-[0.7rem] sm:text-xs text-warning-critical-foreground/90 flex gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Your edits create a doctor-reviewed version. The AI's original report is snapshotted and
              remains retrievable for medico-legal audit. AI confidence and measurements cannot be changed.
            </span>
          </div>

          {/* ── Narrative ── */}
          <div className="space-y-1.5">
            <Label className="text-xs sm:text-sm">Narrative summary</Label>
            <Textarea
              rows={4}
              value={draft.narrative}
              onChange={(e) => setDraft((d) => ({ ...d, narrative: e.target.value }))}
              className="text-sm leading-relaxed"
            />
          </div>

          {/* ── Patient summary ── */}
          <div className="space-y-1.5">
            <Label className="text-xs sm:text-sm">Patient-facing summary (plain language)</Label>
            <Textarea
              rows={3}
              value={draft.patientSummary ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, patientSummary: e.target.value }))}
              className="text-sm leading-relaxed"
            />
          </div>

          {/* ── Information gaps ── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs sm:text-sm">Information gaps</Label>
              <Button size="sm" variant="outline" onClick={addGap} className="h-7 text-xs">
                <Plus className="h-3.5 w-3.5 mr-1" /> Add gap
              </Button>
            </div>
            {(draft.informationGaps ?? []).length === 0 ? (
              <div className="text-[0.7rem] text-muted-foreground italic">
                None recorded.
              </div>
            ) : (
              (draft.informationGaps ?? []).map((g, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={g}
                    onChange={(e) => updateGap(i, e.target.value)}
                    placeholder="e.g. Lateral view not available"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeGap(i)}
                    aria-label="Remove gap"
                  >
                    <Trash2 className="h-4 w-4 text-warning-critical" />
                  </Button>
                </div>
              ))
            )}
          </div>

          {/* ── Findings ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Label className="text-sm sm:text-base">
                Findings ({draft.findings.length})
              </Label>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={expandAll}
                  className="h-7 text-[0.7rem]"
                  disabled={draft.findings.length === 0}
                >
                  Expand all
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={collapseAll}
                  className="h-7 text-[0.7rem]"
                  disabled={draft.findings.length === 0}
                >
                  Collapse
                </Button>
                <Button size="sm" variant="outline" onClick={addFinding} className="h-7 text-xs">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add
                </Button>
              </div>
            </div>

            {draft.findings.map((f) => {
              const isOpen = !!expanded[f.id];
              return (
                <div
                  key={f.id}
                  className="rounded-xl border border-border bg-surface overflow-hidden"
                >
                  {/* Collapsible header */}
                  <button
                    type="button"
                    onClick={() => toggle(f.id)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-accent/40 transition-colors"
                    aria-expanded={isOpen}
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="font-medium text-sm flex-1 truncate">
                      {f.title || "Untitled finding"}
                    </span>
                    <span
                      className={cn(
                        "text-[0.6rem] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-full border shrink-0",
                        f.severity === "critical"
                          ? "bg-severity-critical/15 text-severity-critical border-severity-critical/40"
                          : f.severity === "high"
                          ? "bg-severity-high/15 text-severity-high border-severity-high/40"
                          : f.severity === "medium"
                          ? "bg-severity-medium/15 text-severity-medium border-severity-medium/40"
                          : "bg-severity-low/15 text-severity-low border-severity-low/40",
                      )}
                    >
                      {f.severity}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="border-t border-border/60 p-3 sm:p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Input
                          value={f.title}
                          onChange={(e) => updateFinding(f.id, { title: e.target.value })}
                          placeholder="Finding title"
                          className="font-medium"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            if (window.confirm(`Remove "${f.title}"?`)) removeFinding(f.id);
                          }}
                          aria-label="Remove finding"
                        >
                          <Trash2 className="h-4 w-4 text-warning-critical" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Severity</Label>
                          <Select
                            value={f.severity}
                            onValueChange={(v) =>
                              updateFinding(f.id, { severity: v as Severity })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SEVERITIES.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {s}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Urgency</Label>
                          <Select
                            value={f.urgency ?? "routine"}
                            onValueChange={(v) =>
                              updateFinding(f.id, { urgency: v as Urgency })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {URGENCIES.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {s}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Region / Anatomy</Label>
                          <Input
                            value={f.anatomicalRegion ?? f.region ?? ""}
                            onChange={(e) =>
                              updateFinding(f.id, { anatomicalRegion: e.target.value })
                            }
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Description</Label>
                        <Textarea
                          rows={2}
                          value={f.description}
                          onChange={(e) =>
                            updateFinding(f.id, { description: e.target.value })
                          }
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Observation</Label>
                          <Textarea
                            rows={2}
                            value={f.observation ?? ""}
                            onChange={(e) =>
                              updateFinding(f.id, { observation: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Impression</Label>
                          <Textarea
                            rows={2}
                            value={f.impression ?? ""}
                            onChange={(e) =>
                              updateFinding(f.id, { impression: e.target.value })
                            }
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Recommendation</Label>
                        <Textarea
                          rows={2}
                          value={f.recommendation ?? ""}
                          onChange={(e) =>
                            updateFinding(f.id, { recommendation: e.target.value })
                          }
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">ICD-10 code · label</Label>
                          <div className="flex gap-2">
                            <Input
                              value={f.icd10Code ?? ""}
                              onChange={(e) =>
                                updateFinding(f.id, { icd10Code: e.target.value })
                              }
                              placeholder="J18.1"
                              className="w-24 sm:w-28 font-mono"
                            />
                            <Input
                              value={f.icd10Label ?? ""}
                              onChange={(e) =>
                                updateFinding(f.id, { icd10Label: e.target.value })
                              }
                              placeholder="Label"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">SNOMED code · label</Label>
                          <div className="flex gap-2">
                            <Input
                              value={f.snomedCode ?? ""}
                              onChange={(e) =>
                                updateFinding(f.id, { snomedCode: e.target.value })
                              }
                              placeholder="385093006"
                              className="w-24 sm:w-28 font-mono"
                            />
                            <Input
                              value={f.snomedLabel ?? ""}
                              onChange={(e) =>
                                updateFinding(f.id, { snomedLabel: e.target.value })
                              }
                              placeholder="Label"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="text-[0.7rem] text-muted-foreground">
                        AI confidence:{" "}
                        <span className="font-mono">
                          {Math.round((f.confidence ?? 0) * 100)}%
                        </span>{" "}
                        · locked
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {draft.findings.length === 0 && (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No findings. Use “Add” to insert one.
              </div>
            )}
          </div>

          {/* Spacer so sticky footer doesn't overlap last field on mobile */}
          <div className="h-2" />
        </div>

        {/* ── Sticky footer ── */}
        <div className="border-t border-border bg-background/95 backdrop-blur px-4 sm:px-6 py-3 flex items-center justify-between gap-2 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={saving || !dirty}
            className="text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Revert
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClose}
              disabled={saving}
            >
              {dirty ? "Discard" : "Close"}
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !dirty}
              className="bg-primary hover:bg-primary/90"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-1.5" /> Save edits
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
