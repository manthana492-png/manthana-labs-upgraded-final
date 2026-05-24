import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { TierBadge } from "@/components/tier/TierBadge";
import { ResearchAssistedBanner } from "@/components/tier/ResearchAssistedBanner";
import { ModalityViewer } from "@/components/viewers/ModalityViewer";
import { ReasoningReplay } from "@/components/report/reasoning/ReasoningReplay";
import type { ReasoningBeat } from "@/lib/reasoningBeats";
import { FindingCard } from "@/components/report/FindingCard";
import { ConfidenceGauge } from "@/components/report/ConfidenceGauge";
import { useStudies, useAuth } from "@/lib/store";
import {
  confirmReviewRemote,
  fetchStudy,
  generatePdfUrl,
  subscribeStudyProgress,
} from "@/lib/studyApi";
import {
  ArrowLeft,
  Download,
  Share2,
  Lock,
  CheckCircle2,
  ShieldCheck,
  AlertTriangle,
  MessageCircle,
  Activity,
  FileText,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Severity, Finding } from "@/lib/types";
import { saveEditedReport } from "@/lib/reportEdit";

const severityCls: Record<Severity, { dot: string; label: string; pill: string; bar: string }> = {
  low:      { dot: "bg-severity-low",      label: "Low",      pill: "bg-severity-low/10 text-severity-low border-severity-low/30",          bar: "bg-severity-low" },
  medium:   { dot: "bg-severity-medium",   label: "Medium",   pill: "bg-severity-medium/10 text-severity-medium border-severity-medium/30", bar: "bg-severity-medium" },
  high:     { dot: "bg-severity-high",     label: "High",     pill: "bg-severity-high/10 text-severity-high border-severity-high/30",      bar: "bg-severity-high" },
  critical: { dot: "bg-severity-critical", label: "Critical", pill: "bg-severity-critical/10 text-severity-critical border-severity-critical/30", bar: "bg-severity-critical" },
};

const StudyView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const study = useStudies((s) => s.studies.find((x) => x.id === id));
  const confirmReview = useStudies((s) => s.confirmReview);
  const upsertStudy = useStudies((s) => s.upsertStudy);
  const patchStudyStatus = useStudies((s) => s.patchStudyStatus);
  const { doctor } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [activeBeat, setActiveBeat] = useState<ReasoningBeat | undefined>(undefined);
  const [localFindings, setLocalFindings] = useState<Finding[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [savingCustomizations, setSavingCustomizations] = useState(false);

  useEffect(() => {
    if (study?.report?.findings) {
      setLocalFindings([...study.report.findings]);
    }
  }, [study?.report?.findings]);

  const handleUpdateFinding = (findingId: string, updatedFields: Partial<Finding>) => {
    setLocalFindings((prev) =>
      prev.map((f) => {
        if (f.id === findingId) {
          return { ...f, ...updatedFields };
        }
        return f;
      })
    );
    setHasUnsavedChanges(true);
  };

  const handleSaveCustomizations = async () => {
    if (!study || !study.report) return;
    setSavingCustomizations(true);
    try {
      const editedReport = {
        ...study.report,
        findings: localFindings,
      };
      await saveEditedReport(study.id, editedReport);
      setHasUnsavedChanges(false);
      toast.success("Clinical report customizations saved securely!");
    } catch (err) {
      console.error("Save customizations failed:", err);
      toast.error(err instanceof Error ? err.message : "Save failed. Please retry.");
    } finally {
      setSavingCustomizations(false);
    }
  };
  const [impression, setImpression] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [missingId, setMissingId] = useState(false);

  // ── Hydrate from server when arriving via deep link, plus subscribe to
  //    Realtime so a still-analyzing study auto-refreshes when ready.
  //    Polling uses an AbortController to de-duplicate in-flight requests
  //    (prevents request pile-up + intermittent 4xx noise on the edge fn).
  useEffect(() => {
    // Safeguard: never call get-study without an id.
    if (!id || typeof id !== "string" || id.trim() === "") {
      setMissingId(true);
      return;
    }
    setMissingId(false);

    let cancelled = false;
    let activeController: AbortController | null = null;

    // Helper that always cancels the previous in-flight fetch before starting
    // a new one. Returns null if the request was cancelled.
    const fetchOnce = async () => {
      if (activeController) activeController.abort();
      activeController = new AbortController();
      const signal = activeController.signal;
      try {
        return await fetchStudy(id, { signal });
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return null;
        throw err;
      }
    };

    (async () => {
      try {
        const fetched = await fetchOnce();
        if (!cancelled && fetched?.study) {
          upsertStudy(fetched.study as never);
        }
      } catch (err) {
        // Offline / unauth — fall back to whatever's in the local cache.
        console.warn("StudyView hydrate failed", err);
      }
    })();

    const unsub = subscribeStudyProgress(id, async (row) => {
      patchStudyStatus(id, { status: row.status, errorMessage: row.error_message });
      if (row.status === "awaiting_review" || row.status === "delivered") {
        try {
          const fetched = await fetchOnce();
          if (!cancelled && fetched?.study) upsertStudy(fetched.study as never);
        } catch { /* ignore */ }
      }
    });

    return () => {
      cancelled = true;
      activeController?.abort();
      unsub();
    };
  }, [id, upsertStudy, patchStudyStatus]);

  const sortedFindings = useMemo(
    () => [...localFindings].sort((a, b) => severityRank(b.severity) - severityRank(a.severity)),
    [localFindings],
  );

  if (missingId) {
    return (
      <AppShell>
        <div className="text-center py-20 max-w-md mx-auto">
          <div className="mx-auto h-12 w-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mb-4">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="font-display text-2xl tracking-tight">Study ID is missing</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We couldn&rsquo;t open this study because the URL doesn&rsquo;t include a study identifier.
            Open it from your worklist instead.
          </p>
          <Button variant="outline" className="mt-5" onClick={() => navigate("/app/history")}>
            Back to worklist
          </Button>
        </div>
      </AppShell>
    );
  }

  if (!study) {
    return (
      <AppShell>
        <div className="text-center py-20">
          <h1 className="font-display text-2xl">Study not found</h1>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/app/history")}>
            Back to worklist
          </Button>
        </div>
      </AppShell>
    );
  }

  const isTierC = study.modality.tier === "C";
  const isReviewed = !!study.reviewConfirmedAt;
  const canConfirm = isTierC ? impression.trim().length >= 20 : agreed;

  const onConfirm = async () => {
    if (!canConfirm || confirming) return;
    setConfirming(true);
    const note = isTierC ? impression.trim() : undefined;
    try {
      await confirmReviewRemote(study.id, note);
      // Mirror locally so UI updates immediately even before Realtime event.
      confirmReview(study.id, note);
      toast.success("Review confirmed. Report unlocked.");
    } catch (err) {
      // Offline fallback — keep the UX flowing, but warn.
      confirmReview(study.id, note);
      toast.warning("Saved locally. Will sync when online.", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setConfirming(false);
    }
  };

  const onDownload = async () => {
    if (!isReviewed || downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      const url = await generatePdfUrl(study.id);
      // Trigger save dialog
      const a = document.createElement("a");
      a.href = url;
      a.download = `manthana-${study.id.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success("PDF downloaded.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "PDF generation failed.");
    } finally {
      setDownloadingPdf(false);
    }
  };
  const onShare = async () => {
    if (!isReviewed || !study) return;
    const r = study.report;
    const findingCount = r?.findings.length ?? 0;
    const lines: string[] = [];
    lines.push("🩺 *Manthana-Labs clinical report*");
    lines.push("");
    lines.push(`*Modality:* ${study.modality.label} (${study.modality.category})`);
    if (study.patientRefShort) lines.push(`*Patient ref:* ${study.patientRefShort}`);
    lines.push(`*Findings:* ${findingCount} identified`);
    if (r?.overallConfidence != null) {
      lines.push(`*Overall confidence:* ${Math.round(r.overallConfidence * 100)}%`);
    }
    if (doctor?.fullName) lines.push(`*Reviewed by:* Dr. ${doctor.fullName}`);
    lines.push("");
    lines.push("Generated by Manthana-Labs · AI-assisted, clinician-reviewed.");
    lines.push("⚠️ For clinical use only. Do not forward outside the care team.");
    const message = lines.join("\n");

    // Try to attach the PDF via the Web Share API on mobile.
    try {
      const url = await generatePdfUrl(study.id);
      const blob = await fetch(url).then((r) => r.blob());
      const file = new File([blob], `manthana-${study.id.slice(0, 8)}.pdf`, {
        type: "application/pdf",
      });
      const navAny = navigator as Navigator & {
        canShare?: (data: { files?: File[] }) => boolean;
        share?: (data: { files?: File[]; text?: string; title?: string }) => Promise<void>;
      };
      if (navAny.canShare?.({ files: [file] }) && navAny.share) {
        try {
          await navAny.share({
            files: [file],
            title: `${study.modality.label} report`,
            text: message,
          });
          toast.success("Shared via your chosen app.");
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
          return;
        } catch (err) {
          if ((err as Error)?.name === "AbortError") {
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
            return;
          }
          // fall through to wa.me fallback
        }
      }
      // Desktop / unsupported: download PDF, then open WhatsApp directly.
      const a = document.createElement("a");
      a.href = url;
      a.download = `manthana-${study.id.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      // PDF prep failed — still open WhatsApp with the text-only message.
      console.warn("PDF prep failed, opening WhatsApp text-only", err);
    }

    const waUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");
    toast.success("WhatsApp opened — attach the downloaded PDF.");
  };

  const onDiscussWithAi = () => {
    if (!isReviewed || !study) return;
    navigate(`/app/study/${study.id}/report#discuss-with-ai`);
  };

  const r = study.report;
  const assets = study.previewAssets ?? [];

  return (
    <AppShell>
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <Link to="/app/history" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Worklist
        </Link>
        <div className="flex items-center gap-2">
          <TierBadge tier={study.modality.tier} size="md" />
          {isReviewed && (
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-tier-nvidia-soft text-tier-nvidia-foreground border border-tier-nvidia-border/60">
              <CheckCircle2 className="h-3 w-3" /> Reviewed
            </span>
          )}
        </div>
      </div>

      {isTierC && <ResearchAssistedBanner className="mb-6" />}

      {/* Header */}
      <header className="surface-clinical p-5 md:p-7 mb-6 relative overflow-hidden">
        <div className={cn("absolute left-0 top-0 bottom-0 w-1", isTierC ? "tier-stripe-research" : "tier-stripe-nvidia")} />
        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{study.modality.category}</div>
        <h1 className="font-display text-3xl md:text-4xl tracking-tight mt-1">{study.modality.label}</h1>
        <div className="mt-2 text-sm text-muted-foreground">
          Study <span className="font-mono">{study.id}</span> · created{" "}
          {new Date(study.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
        </div>
      </header>

      {/* ───────── Adaptive grid: viewer | findings | review ─────────
           Mobile (<lg): single column, stacked
           Desktop (>=lg): viewer takes the wider column, sidebar on the right
           XL (>=xl): 3-column with viewer + report + sticky review */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_340px]">
        {/* ── Column 1 — Viewer + confidence ── */}
        <div className="space-y-5 min-w-0">
          <ReasoningReplay
            study={study}
            onActiveBeatChange={setActiveBeat}
          />

          {/* Confidence */}
          {r && (
            <div className="surface-clinical p-5 md:p-6">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Overall confidence</div>
                  <div className="font-display text-4xl tracking-tight mt-1">
                    {Math.round(r.overallConfidence * 100)}%
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    AI-assisted · clinician-reviewed
                  </div>
                </div>
                <ConfidenceGauge value={r.overallConfidence} />
              </div>
              {/* Severity strip */}
              <div className="mt-5 grid grid-cols-4 gap-2">
                {(["low","medium","high","critical"] as Severity[]).map((s) => {
                  const count = sortedFindings.filter((f) => f.severity === s).length;
                  return (
                    <div key={s} className="rounded-lg bg-surface p-2.5 text-center">
                      <div className={cn("h-1 w-8 rounded-full mx-auto", severityCls[s].bar)} />
                      <div className="font-display text-xl mt-1.5">{count}</div>
                      <div className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">{severityCls[s].label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Column 2 — Findings + narrative ── */}
        <div className="space-y-5 min-w-0">
          <section className="surface-clinical p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl tracking-tight inline-flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" /> Findings
              </h2>
              <span className="text-xs text-muted-foreground">{sortedFindings.length} identified</span>
            </div>
            <ul className="space-y-3">
              {sortedFindings.map((f, i) => (
                <motion.div
                  key={f.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className={cn(
                    "rounded-xl transition-all duration-300",
                    activeBeat?.findingId === f.id
                      ? "ring-2 ring-primary shadow-lg scale-[1.02] bg-primary/5"
                      : ""
                  )}
                >
                  <FindingCard
                    finding={f}
                    narrative={r?.narrative}
                    studyId={study.id}
                    onUpdateFinding={(updated) => handleUpdateFinding(f.id, updated)}
                  />
                </motion.div>
              ))}
            </ul>
            <div className="mt-4 text-[0.7rem] text-muted-foreground italic">
              Tip — tap a severity badge to expand a finding&rsquo;s narrative &amp; confidence breakdown.
            </div>
          </section>

          {/* Narrative */}
          {r && (
            <section className="surface-clinical p-5 md:p-6">
              <h2 className="font-display text-xl tracking-tight mb-3">Narrative summary</h2>
              <p className="text-[0.95rem] leading-relaxed text-foreground/90 text-pretty">{r.narrative}</p>
              {r.foundationModelCaveat && (
                <div className="mt-4 rounded-lg border border-warning-critical-border/60 bg-warning-critical-soft p-3 text-xs text-warning-critical-foreground">
                  <div className="flex gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{r.foundationModelCaveat}</span>
                  </div>
                </div>
              )}
              {r.informationGaps && r.informationGaps.length > 0 && (
                <div className="mt-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Information gaps</div>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {r.informationGaps.map((g, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-warning-critical">•</span>
                        <span>{g}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
        </div>

        {/* ── Column 3 — Review gate + delivery ── */}
        <aside className="space-y-4 lg:col-span-2 xl:col-span-1 lg:sticky lg:top-24 lg:self-start">
          <div className={cn(
            "surface-clinical overflow-hidden",
            !isReviewed && (isTierC ? "ring-2 ring-warning-critical/30" : "ring-2 ring-primary/20")
          )}>
            <div className={cn("h-1", isReviewed ? "bg-tier-nvidia" : isTierC ? "bg-warning-critical" : "bg-primary")} />
            <div className="p-5">
              <div className="flex items-center gap-2 mb-1">
                {isReviewed ? (
                  <CheckCircle2 className="h-5 w-5 text-tier-nvidia" />
                ) : (
                  <Lock className="h-5 w-5 text-warning-critical" />
                )}
                <h3 className="font-display text-lg tracking-tight">
                  {isReviewed ? "Review confirmed" : "Review required"}
                </h3>
              </div>
              <p className="text-sm text-muted-foreground">
                {isReviewed
                  ? "Download and share are unlocked."
                  : isTierC
                  ? "Type your clinical impression (≥ 20 chars) to unlock delivery."
                  : "Confirm you have reviewed this analysis."}
              </p>

              {!isReviewed && (
                <div className="mt-4 space-y-3">
                  {isTierC ? (
                    <>
                      <Textarea
                        value={impression}
                        onChange={(e) => setImpression(e.target.value.slice(0, 2000))}
                        placeholder="Your clinical impression and any deviations from the AI draft…"
                        className="min-h-[120px] bg-background"
                      />
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Minimum 20 characters</span>
                        <span className={cn(
                          "font-mono",
                          impression.trim().length >= 20 ? "text-tier-nvidia" : "text-muted-foreground"
                        )}>
                          {impression.trim().length} / 20
                        </span>
                      </div>
                    </>
                  ) : (
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(Boolean(v))} className="mt-0.5" />
                      <span className="text-sm">
                        I have reviewed this analysis and accept clinical responsibility for any
                        action taken.
                      </span>
                    </label>
                  )}

                  <Button
                    onClick={onConfirm}
                    disabled={!canConfirm || confirming}
                    className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50"
                  >
                    {confirming ? (
                      <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Confirming…</>
                    ) : (
                      <><ShieldCheck className="h-4 w-4 mr-1.5" /> Confirm review</>
                    )}
                  </Button>
                </div>
              )}

              {isReviewed && (
                <div className="mt-3 text-xs text-muted-foreground border-t border-border pt-3">
                  Reviewed by <span className="font-medium text-foreground">{doctor?.fullName}</span>
                  <br />
                  {new Date(study.reviewConfirmedAt!).toLocaleString("en-IN")}
                  {study.reviewingDoctorNote && (
                    <div className="mt-2 p-2.5 rounded bg-surface text-foreground italic">
                      &ldquo;{study.reviewingDoctorNote}&rdquo;
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Deliver actions */}
          <div className="surface-clinical p-5">
            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground mb-3">Deliver</div>
            <div className="space-y-2">
              <Button
                onClick={() => navigate(`/app/study/${study.id}/report`)}
                variant="default"
                className="w-full justify-start bg-primary hover:bg-primary/90"
              >
                <FileText className="h-4 w-4 mr-2" /> Open full report viewer
              </Button>
              <Button
                onClick={onDownload}
                disabled={!isReviewed || downloadingPdf}
                variant="outline"
                className="w-full justify-start disabled:opacity-50"
              >
                {downloadingPdf ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating PDF…</>
                ) : (
                  <><Download className="h-4 w-4 mr-2" /> Download PDF</>
                )}
                {!isReviewed && <Lock className="h-3 w-3 ml-auto" />}
              </Button>
              <Button
                onClick={onShare}
                disabled={!isReviewed}
                variant="outline"
                className="w-full justify-start disabled:opacity-50"
              >
                <Share2 className="h-4 w-4 mr-2" /> Share via WhatsApp
                {!isReviewed && <Lock className="h-3 w-3 ml-auto" />}
              </Button>
              <Button
                onClick={onDiscussWithAi}
                disabled={!isReviewed}
                variant="outline"
                className="w-full justify-start disabled:opacity-50"
                title="Open the domain-aware AI co-pilot (Allopathy / Ayurveda / Homeopathy / Siddha / Unani)"
              >
                <MessageCircle className="h-4 w-4 mr-2" /> Discuss with AI (10 msgs / scan)
                {!isReviewed && <Lock className="h-3 w-3 ml-auto" />}
              </Button>
            </div>
          </div>
        </aside>
      </div>

      {/* Unsaved customisations sticky save footer */}
      {hasUnsavedChanges && (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce flex items-center gap-3 bg-primary text-primary-foreground px-5 py-3 rounded-xl shadow-2xl border border-primary-foreground/10" onClick={(e) => e.stopPropagation()}>
          <div className="text-xs font-medium">You have unsaved clinical report customizations.</div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={handleSaveCustomizations}
            disabled={savingCustomizations}
            className="h-8 font-semibold shrink-0"
          >
            {savingCustomizations ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> Saving...
              </>
            ) : (
              "Save Customizations"
            )}
          </Button>
        </div>
      )}
    </AppShell>
  );
};

function severityRank(s: Severity) {
  return { low: 0, medium: 1, high: 2, critical: 3 }[s];
}

// (Local ConfidenceGauge replaced by shared component in @/components/report/ConfidenceGauge)

export default StudyView;
