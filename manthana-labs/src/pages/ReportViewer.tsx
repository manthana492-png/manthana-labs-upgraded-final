import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { TierBadge } from "@/components/tier/TierBadge";
import { ResearchAssistedBanner } from "@/components/tier/ResearchAssistedBanner";
import { ReasoningReplay } from "@/components/report/reasoning/ReasoningReplay";
import { FindingCard } from "@/components/report/FindingCard";
import { ConfidenceGauge } from "@/components/report/ConfidenceGauge";
import { DifferentialPanel } from "@/components/report/DifferentialPanel";
import { CriticalFindingBanner } from "@/components/report/CriticalFindingBanner";
import { ConfidenceFloorBanner } from "@/components/report/ConfidenceFloorBanner";
import { IncidentReportButton } from "@/components/report/IncidentReportButton";
import { PatientSummaryCard } from "@/components/report/PatientSummaryCard";
import { ComparisonViewer } from "@/components/report/ComparisonViewer";
import { DomainReportChat } from "@/components/report/DomainReportChat";
import { ReportTranslationPanel } from "@/components/report/ReportTranslationPanel";
import { UrgencyEscalationGate, urgencyGateCleared } from "@/components/report/UrgencyEscalationGate";
import { ReferencesPanel } from "@/components/live/ReferencesPanel";
import { IdleLockOverlay } from "@/components/safety/IdleLockOverlay";
import { trackPdfDownloaded } from "@/lib/analytics";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useStudies, useAuth } from "@/lib/store";
import { downloadFhirReport } from "@/lib/fhir";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { ReportEditor } from "@/components/report/ReportEditor";
import { BrandedLetterhead } from "@/components/report/BrandedLetterhead";
import { PacsPushPanel } from "@/components/dicom/PacsPushPanel";
import { DICOM_FEATURES_ENABLED } from "@/lib/featureFlags";
import { usePlan, isProOrAbove } from "@/lib/usePlan";
import { fetchMyBranding, type DoctorBranding } from "@/lib/branding";
import { lockReport } from "@/lib/reportEdit";
import { fetchStudy } from "@/lib/studyApi";
import {
  ArrowLeft,
  ShieldCheck,
  AlertTriangle,
  Activity,
  Sparkles,
  CheckCircle2,
  Lock,
  Download,
  Share2,
  MessageCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  FileJson,
  ArrowLeftRight,
  Pencil,
  BadgeCheck,
} from "lucide-react";
import type { Finding, Severity, Report, Study } from "@/lib/types";

const SEV_ORDER: Severity[] = ["low", "medium", "high", "critical"];
const SEV_BAR: Record<Severity, string> = {
  low: "bg-severity-low",
  medium: "bg-severity-medium",
  high: "bg-severity-high",
  critical: "bg-severity-critical",
};
const SEV_LABEL: Record<Severity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

/**
 * ReportViewer (`/app/study/:id/report` and `/app/study/:id/report/:findingId`)
 * ─────────────────────────────────────────────────────────────────────
 * • Adaptive single-column / 2-column layout.
 * • Deep-linking with prev/next URL navigation between findings.
 * • Always-visible sticky "Go to finding" selector (no URL change).
 * • Print-optimized PDF generation (off-screen clone, animations frozen).
 */
const ReportViewer = () => {
  const { id, findingId } = useParams();
  const navigate = useNavigate();
  const study = useStudies((s) => s.studies.find((x) => x.id === id));
  const replaceReport = useStudies((s) => s.replaceReport);
  const upsertStudy = useStudies((s) => s.upsertStudy);
  const doctor = useAuth((s) => s.doctor);
  const { plan } = usePlan();
  const canEdit = isProOrAbove(plan);
  const canBrand = isProOrAbove(plan);

  const [editorOpen, setEditorOpen] = useState(false);
  const [signing, setSigning] = useState(false);
  const [branding, setBranding] = useState<DoctorBranding | null>(null);
  const [compareImageUrls, setCompareImageUrls] = useState<Record<number, string[]>>({});
  const [loadingStudy, setLoadingStudy] = useState(false);

  useEffect(() => {
    if (!id || study) return;
    const controller = new AbortController();
    setLoadingStudy(true);
    fetchStudy(id, { signal: controller.signal })
      .then((payload) => {
        if (payload?.study?.id) upsertStudy(payload.study as Study);
      })
      .catch(() => { /* shown by fallback below */ })
      .finally(() => setLoadingStudy(false));
    return () => controller.abort();
  }, [id, study, upsertStudy]);

  useEffect(() => {
    if (!canBrand) { setBranding(null); return; }
    fetchMyBranding().then(setBranding).catch(() => setBranding(null));
  }, [canBrand]);

  // Fetch signed URLs for compare-mode timepoint images (for in-app + PDF embed).
  const compareTimepointsRaw = (study as unknown as { compareTimepoints?: CompareTimepointShape[] } | undefined)?.compareTimepoints ?? null;
  const isCompareStudy = !!(study as unknown as { isCompareMode?: boolean } | undefined)?.isCompareMode;
  useEffect(() => {
    if (!isCompareStudy || !compareTimepointsRaw) return;
    let cancelled = false;
    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const out: Record<number, string[]> = {};
      for (const tp of compareTimepointsRaw) {
        const paths = (tp.storage_paths ?? []).slice(0, 4);
        if (paths.length === 0) continue;
        const { data } = await supabase.storage.from("studies").createSignedUrls(paths, 3600);
        out[tp.chrono_order ?? tp.index ?? 0] = (data ?? [])
          .map((d) => d.signedUrl)
          .filter((u): u is string => !!u);
      }
      if (!cancelled) setCompareImageUrls(out);
    })().catch(() => { /* non-fatal */ });
    return () => { cancelled = true; };
  }, [isCompareStudy, compareTimepointsRaw]);

  const sortedFindings = useMemo<Finding[]>(
    () =>
      [...(study?.report?.findings ?? [])].sort(
        (a, b) => SEV_ORDER.indexOf(b.severity) - SEV_ORDER.indexOf(a.severity),
      ),
    [study?.report?.findings],
  );

  // ── Active finding (drives expansion + sticky chrome) ─────────
  const [activeId, setActiveId] = useState<string | undefined>(findingId);
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});

  // Initialize / sync from URL or default to first finding.
  useEffect(() => {
    if (sortedFindings.length === 0) return;
    const target =
      findingId && sortedFindings.some((f) => f.id === findingId)
        ? findingId
        : activeId && sortedFindings.some((f) => f.id === activeId)
        ? activeId
        : sortedFindings[0].id;
    setActiveId(target);
    setOpenMap((prev) => ({ ...prev, [target]: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findingId, sortedFindings.length]);

  const scrollToFinding = useCallback((fid: string) => {
    window.requestAnimationFrame(() => {
      const el = document.getElementById(`finding-${fid}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  // Smooth-scroll to deep-linked finding once mounted.
  useEffect(() => {
    if (!findingId) return;
    const t = window.setTimeout(() => scrollToFinding(findingId), 220);
    return () => window.clearTimeout(t);
  }, [findingId, sortedFindings.length, scrollToFinding]);

  // Deep-link to AI chat via #discuss-with-ai (e.g. from Deliver actions).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#discuss-with-ai") return;
    const t = window.setTimeout(() => {
      const el = document.getElementById("discuss-with-ai");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 320);
    return () => window.clearTimeout(t);
  }, [study?.id]);

  // ── Prev / next URL nav ───────────────────────────────────────
  const activeIndex = activeId ? sortedFindings.findIndex((f) => f.id === activeId) : -1;
  const goToFinding = useCallback(
    (next: Finding | undefined, options?: { updateUrl?: boolean }) => {
      if (!next || !study) return;
      setActiveId(next.id);
      setOpenMap((prev) => ({ ...prev, [next.id]: true }));
      if (options?.updateUrl !== false) {
        navigate(`/app/study/${study.id}/report/${next.id}`, { replace: true });
      }
      scrollToFinding(next.id);
    },
    [navigate, study, scrollToFinding],
  );

  const goPrev = useCallback(() => {
    if (activeIndex <= 0) return;
    goToFinding(sortedFindings[activeIndex - 1]);
  }, [activeIndex, sortedFindings, goToFinding]);
  const goNext = useCallback(() => {
    if (activeIndex < 0 || activeIndex >= sortedFindings.length - 1) return;
    goToFinding(sortedFindings[activeIndex + 1]);
  }, [activeIndex, sortedFindings, goToFinding]);

  // Keyboard: ←/→ moves between findings (when not typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext]);

  // ── PDF generation (print-optimized off-screen clone) ─────────
  const reportRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);

  /** Build the PDF blob (shared by Download + Share). Returns null on failure. */
  const buildPdfBlob = useCallback(async (): Promise<{ blob: Blob; filename: string } | null> => {
    if (!study || !study.report) return null;

    // Expand every finding live so the source DOM stays in sync.
    const allOpen: Record<string, boolean> = {};
    sortedFindings.forEach((f) => { allOpen[f.id] = true; });
    setOpenMap(allOpen);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    // Build an off-screen, print-optimized clone of the report.
    const source = reportRef.current;
    if (!source) return null;
    const PRINT_WIDTH = 1024;
    const stage = document.createElement("div");
    stage.setAttribute("data-pdf-stage", "true");
    stage.style.cssText = [
      "position:fixed",
      "left:-10000px",
      "top:0",
      `width:${PRINT_WIDTH}px`,
      "background:hsl(var(--background))",
      "padding:32px",
      "z-index:-1",
    ].join(";");

    const freezeStyle = document.createElement("style");
    freezeStyle.textContent = `
      [data-pdf-stage] *, [data-pdf-stage] *::before, [data-pdf-stage] *::after {
        transition: none !important;
        animation: none !important;
        animation-duration: 0s !important;
        animation-delay: 0s !important;
      }
      [data-pdf-stage] .lg\\:sticky { position: static !important; top: auto !important; }
      [data-pdf-stage] [data-pdf-skip="true"] { display: none !important; }
      [data-pdf-stage] [data-pdf-only="true"] { display: block !important; }
      [data-pdf-stage] .grid { display: block !important; }
      [data-pdf-stage] .grid > * + * { margin-top: 1.25rem; }
      [data-pdf-stage] [data-pdf-only="true"] [data-pdf-gallery-grid] { display: grid !important; }
      [data-pdf-stage] [data-pdf-only="true"] [data-pdf-gallery-grid] > * + * { margin-top: 0; }
      [data-pdf-stage] [data-pdf-only="true"] figure { break-inside: avoid; page-break-inside: avoid; }
      [data-pdf-stage] [data-pdf-only="true"] figure > div { display: flex !important; }
      [data-pdf-stage] [data-pdf-only="true"] img {
        width: 100% !important;
        height: auto !important;
        object-fit: contain !important;
        background: hsl(var(--image-backdrop));
      }
      [data-pdf-stage] [data-finding-card] { break-inside: avoid; page-break-inside: avoid; }
      [data-pdf-stage] section { break-inside: avoid; page-break-inside: avoid; }
    `;
    document.head.appendChild(freezeStyle);

    const clone = source.cloneNode(true) as HTMLElement;
    clone.querySelectorAll<HTMLElement>("[data-finding-id]").forEach((card) => {
      card.setAttribute("data-pdf-expanded", "true");
      const button = card.querySelector("button[aria-expanded]");
      button?.setAttribute("aria-expanded", "true");
      card.querySelectorAll<HTMLElement>("[id^='finding-'][id$='-body']").forEach((body) => {
        body.style.height = "auto";
        body.style.opacity = "1";
        body.style.overflow = "visible";
      });
    });

    stage.appendChild(clone);
    document.body.appendChild(stage);

    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);

      if ((document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready) {
        try { await (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready; } catch { /* noop */ }
      }
      const imgs = Array.from(clone.querySelectorAll("img"));
      await Promise.all(
        imgs.map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise<void>((res) => {
            img.addEventListener("load", () => res(), { once: true });
            img.addEventListener("error", () => res(), { once: true });
          });
        }),
      );
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await new Promise((r) => setTimeout(r, 120));

      const canvas = await html2canvas(stage, {
        scale: 2,
        useCORS: true,
        backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
        logging: false,
        windowWidth: PRINT_WIDTH + 64,
        width: PRINT_WIDTH + 64,
      });

      const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 28;
      const contentW = pageW - margin * 2;

      const watermark = doctor?.fullName
        ? `REVIEWED BY ${doctor.fullName.toUpperCase()} · ${new Date().toLocaleDateString("en-IN")}`
        : `MANTHANA REPORT · ${new Date().toLocaleDateString("en-IN")}`;

      const drawChrome = (pageNum: number, pageCount: number) => {
        const headerLeft = canBrand && branding?.enabled && branding.clinic_name
          ? branding.clinic_name
          : "Manthana-Labs — Clinical Report";
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.setTextColor(20, 20, 20);
        pdf.text(headerLeft, margin, 18);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(110, 110, 110);
        pdf.text(
          `${study.modality.label} · Tier ${study.modality.tier} · Study ${study.id}`,
          pageW - margin,
          18,
          { align: "right" },
        );
        pdf.saveGraphicsState?.();
        // @ts-expect-error - jsPDF GState typings
        pdf.setGState?.(new pdf.GState({ opacity: 0.07 }));
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(28);
        pdf.setTextColor(20, 20, 20);
        pdf.text(watermark, pageW / 2, pageH / 2, { align: "center", angle: -28 });
        pdf.restoreGraphicsState?.();
        pdf.setTextColor(0, 0, 0);
        const footerY = pageH - 14;
        pdf.setFont("helvetica", "italic");
        pdf.setFontSize(8);
        pdf.setTextColor(120, 120, 120);
        const customFooter = canBrand && branding?.enabled && branding.footer_disclaimer
          ? branding.footer_disclaimer
          : "AI-assisted analysis — clinician interpretation required.";
        pdf.text(customFooter, margin, footerY - 9, { maxWidth: contentW - 100 });
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(7);
        pdf.setTextColor(140, 140, 140);
        pdf.text("Powered by Manthana-Labs  |  Quaasx 108 Private Limited", margin, footerY);
        pdf.setFont("helvetica", "normal");
        pdf.text(
          `Generated ${new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`,
          pageW / 2,
          footerY,
          { align: "center" },
        );
        pdf.text(`Page ${pageNum} / ${pageCount}`, pageW - margin, footerY, { align: "right" });
        pdf.setTextColor(0, 0, 0);
      };

      const topGutter = 32;
      const bottomGutter = 28;
      const usableH = pageH - topGutter - bottomGutter;
      const pageSlicePxH = (usableH * canvas.width) / contentW;

      const totalPages = Math.max(1, Math.ceil(canvas.height / pageSlicePxH));
      let sourceY = 0;
      let pageNum = 0;

      while (sourceY < canvas.height) {
        if (pageNum > 0) pdf.addPage();
        pageNum++;
        const sliceH = Math.min(pageSlicePxH, canvas.height - sourceY);
        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = sliceH;
        sliceCanvas
          .getContext("2d")
          ?.drawImage(canvas, 0, sourceY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
        const renderedH = (sliceH * contentW) / canvas.width;
        pdf.addImage(
          sliceCanvas.toDataURL("image/jpeg", 0.95),
          "JPEG",
          margin,
          topGutter,
          contentW,
          renderedH,
        );
        drawChrome(pageNum, totalPages);
        sourceY += sliceH;
      }

      const isCompare = !!(study as unknown as { isCompareMode?: boolean }).isCompareMode;
      const tpCount = compareTimepointsRaw?.length ?? 0;
      const filename = isCompare
        ? `manthana-compare-${study.modality.slug}-${tpCount}tp-${study.id.slice(0, 8)}.pdf`
        : `manthana-report-${study.id.slice(0, 8)}.pdf`;
      const blob = pdf.output("blob") as Blob;
      return { blob, filename };
    } catch (err) {
      console.error("PDF generation failed", err);
      return null;
    } finally {
      stage.remove();
      freezeStyle.remove();
    }
  }, [study, sortedFindings, doctor, branding, canBrand, compareTimepointsRaw]);

  const handleDownloadPdf = useCallback(async () => {
    if (!study || !study.report) return;
    setDownloading(true);
    try {
      const result = await buildPdfBlob();
      if (!result) {
        toast({ title: "Couldn't generate PDF", description: "Please try again." });
        return;
      }
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      trackPdfDownloaded(study.id, "report");
      toast({ title: "Report downloaded", description: result.filename });
    } finally {
      setDownloading(false);
    }
  }, [study, buildPdfBlob]);

  /** Compose a context-rich WhatsApp message and share PDF. */
  const handleShareWhatsApp = useCallback(async () => {
    if (!study || !study.report) return;
    setSharing(true);
    try {
      const result = await buildPdfBlob();
      if (!result) {
        toast({ title: "Couldn't generate PDF", description: "Please try again." });
        return;
      }

      // Build modality / timepoint context for the share message.
      const isCompare = !!(study as unknown as { isCompareMode?: boolean }).isCompareMode;
      const isMM = !!(study as unknown as { isMultiModality?: boolean }).isMultiModality;
      const compareReport = study.report as unknown as CompareReportShape;
      const tpLabels = compareTimepointsRaw
        ? [...compareTimepointsRaw]
            .sort((a, b) => (a.chrono_order ?? 0) - (b.chrono_order ?? 0))
            .map((t, i) => `T${i + 1}: ${t.label}`)
            .join(" → ")
        : "";

      const lines: string[] = [];
      lines.push("🩺 *Manthana-Labs clinical report*");
      lines.push("");
      lines.push(`*Modality:* ${study.modality.label} (${study.modality.category})`);
      if (study.patientRefShort) lines.push(`*Patient ref:* ${study.patientRefShort}`);
      if (isCompare && tpLabels) {
        lines.push(`*Compare timeline:* ${tpLabels}`);
        if (compareReport?.intervalChange) {
          lines.push(`*Interval change:* ${compareReport.intervalChange.toUpperCase()}`);
        }
      }
      if (isMM) lines.push(`*Multi-modality study* — see attached PDF for synthesis.`);
      const findingCount = sortedFindings.length;
      lines.push(`*Findings:* ${findingCount} identified`);
      if (study.report.overallConfidence != null) {
        lines.push(`*Overall confidence:* ${Math.round(study.report.overallConfidence * 100)}%`);
      }
      lines.push("");
      lines.push("Generated by Manthana-Labs · AI-assisted, clinician-reviewed.");
      lines.push("⚠️ For clinical use only. Do not forward outside the care team.");
      const message = lines.join("\n");

      // Prefer Web Share API (mobile) — shares the PDF file directly.
      const file = new File([result.blob], result.filename, { type: "application/pdf" });
      const navAny = navigator as Navigator & {
        canShare?: (data: { files?: File[] }) => boolean;
        share?: (data: { files?: File[]; text?: string; title?: string }) => Promise<void>;
      };
      if (navAny.canShare && navAny.share && navAny.canShare({ files: [file] })) {
        try {
          await navAny.share({
            files: [file],
            title: `${study.modality.label} report`,
            text: message,
          });
          toast({ title: "Shared", description: "Report sent via your chosen app." });
          return;
        } catch (err) {
          // User cancelled or share failed — fall back to download + WhatsApp link
          if ((err as Error)?.name === "AbortError") return;
          console.warn("Web Share failed, falling back", err);
        }
      }

      // Fallback: download the PDF, then open WhatsApp web/app with the message.
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      const waUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
      window.open(waUrl, "_blank", "noopener,noreferrer");
      toast({
        title: "PDF downloaded — WhatsApp opened",
        description: "Attach the downloaded PDF in the chat. Message text is pre-filled.",
      });
    } finally {
      setSharing(false);
    }
  }, [study, buildPdfBlob, compareTimepointsRaw, sortedFindings.length]);

  // ── Empty / loading guard ─────────────────────────────────────
  if (!study) {
    return (
      <AppShell>
        <div className="text-center py-20">
          {loadingStudy ? (
            <>
              <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
              <h1 className="font-display text-2xl mt-4">Opening report…</h1>
            </>
          ) : (
            <h1 className="font-display text-2xl">Study not found</h1>
          )}
          <Button variant="outline" className="mt-4" onClick={() => navigate("/app/history")}>
            Back to worklist
          </Button>
        </div>
      </AppShell>
    );
  }

  const r = study.report;
  const isTierC = study.modality.tier === "C";
  const isReviewed = !!study.reviewConfirmedAt;
  const editLocked = !!study.reportLocked || isReviewed;
  const wasEdited = !!study.editedByDoctor;
  // (preview assets are now consumed by ReasoningReplay → ModalityViewer)
  const counts: Record<Severity, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  sortedFindings.forEach((f) => { counts[f.severity]++; });
  const activeFinding = activeIndex >= 0 ? sortedFindings[activeIndex] : undefined;
  const escalationCleared = urgencyGateCleared(sortedFindings);
  const exportBlockedReason = !r
    ? "No report available"
    : isTierC && !isReviewed
    ? "Confirm review before downloading"
    : !escalationCleared
    ? "Escalate all urgent / STAT findings before export"
    : null;

  const handleSignAndLock = async () => {
    if (!study) return;
    setSigning(true);
    try {
      await lockReport(study.id);
      replaceReport(study.id, study.report!, { locked: true });
      toast({ title: "Report locked", description: "No further edits allowed. Use addendum if needed." });
    } catch (err) {
      toast({ title: "Could not lock report", description: err instanceof Error ? err.message : "Try again." });
    } finally {
      setSigning(false);
    }
  };

  const handleSavedEdit = (next: Report) => {
    replaceReport(study!.id, next, { editedByDoctor: true });
  };

  return (
    <AppShell>
      {/* Top navigation row */}
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <Link
          to={`/app/study/${study.id}`}
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="h-4 w-4" /> Back to review
        </Link>
        <div className="flex items-center gap-2 flex-wrap">
          <TierBadge tier={study.modality.tier} size="md" />
          {isReviewed ? (
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-tier-nvidia-soft text-tier-nvidia-foreground border border-tier-nvidia-border/60">
              <CheckCircle2 className="h-3 w-3" /> Reviewed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-warning-critical-soft text-warning-critical-foreground border border-warning-critical-border/60">
              <Lock className="h-3 w-3" /> Awaiting review
            </span>
          )}
          {wasEdited && (
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/30">
              <BadgeCheck className="h-3 w-3" /> Doctor-reviewed
            </span>
          )}
          {canEdit && r && !editLocked && (
            <Button
              size="sm"
              variant="outline"
              data-pdf-skip="true"
              onClick={() => setEditorOpen(true)}
              title="Edit findings, narrative & summaries before signing"
            >
              <Pencil className="h-4 w-4 mr-1.5" /> Edit report
            </Button>
          )}
          {canEdit && r && !editLocked && (
            <Button
              size="sm"
              variant="outline"
              data-pdf-skip="true"
              onClick={handleSignAndLock}
              disabled={signing}
              title="Lock the report — no further edits will be allowed"
            >
              {signing
                ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Locking…</>
                : <><Lock className="h-4 w-4 mr-1.5" /> Sign & lock</>}
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleDownloadPdf}
            disabled={downloading || !!exportBlockedReason}
            className="bg-primary hover:bg-primary/90"
            title={exportBlockedReason ?? "Download PDF report"}
          >
            {downloading ? (
              <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Generating…</>
            ) : (
              <><Download className="h-4 w-4 mr-1.5" /> Download PDF</>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            data-pdf-skip="true"
            onClick={handleShareWhatsApp}
            disabled={sharing || downloading || !!exportBlockedReason}
            title={
              exportBlockedReason ??
              "One-tap share — exports the PDF and sends it via WhatsApp with patient context"
            }
            className="border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-500"
          >
            {sharing ? (
              <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Preparing…</>
            ) : (
              <>
                <MessageCircle className="h-4 w-4 mr-1.5" />
                <span className="hidden sm:inline">Share on WhatsApp</span>
                <span className="sm:hidden">Share</span>
                <Share2 className="h-3 w-3 ml-1.5 opacity-60" />
              </>
            )}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                data-pdf-skip="true"
                disabled={!!exportBlockedReason}
                title={exportBlockedReason ?? "Export the report as machine-readable JSON"}
              >
                <FileJson className="h-4 w-4 mr-1.5" />
                <span className="hidden sm:inline">Export JSON</span>
                <span className="sm:hidden">JSON</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-xs">Download report data</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  downloadFhirReport(study, doctor);
                  toast({
                    title: "FHIR bundle downloaded",
                    description: `manthana-fhir-${study.id}.json`,
                  });
                }}
              >
                <FileJson className="h-4 w-4 mr-2" />
                <div className="flex flex-col">
                  <span className="text-sm">FHIR R4 (EHR handoff)</span>
                  <span className="text-[0.65rem] text-muted-foreground">Standard interop bundle</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  if (!study.report) return;
                  const payload = {
                    studyId: study.id,
                    modality: study.modality,
                    generatedAt: new Date().toISOString(),
                    editedByDoctor: wasEdited,
                    reviewedByDoctor: isReviewed,
                    doctor: doctor
                      ? { fullName: doctor.fullName, councilNumber: doctor.councilNumber ?? null }
                      : null,
                    report: study.report,
                  };
                  const blob = new Blob([JSON.stringify(payload, null, 2)], {
                    type: "application/json",
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `manthana-report-${study.id.slice(0, 8)}.json`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                  toast({
                    title: "Report JSON downloaded",
                    description: "Raw report payload (Manthana schema).",
                  });
                }}
              >
                <Download className="h-4 w-4 mr-2" />
                <div className="flex flex-col">
                  <span className="text-sm">Report JSON (raw)</span>
                  <span className="text-[0.65rem] text-muted-foreground">Manthana schema · for archive</span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <IncidentReportButton studyId={study.id} className="hidden sm:inline-flex" />
        </div>
      </div>

      <IdleLockOverlay timeoutMinutes={15} />

      {/* Critical finding workflow + urgency escalation + low-confidence floor */}
      <div className="space-y-3 mb-5" data-pdf-skip="false">
        <CriticalFindingBanner studyId={study.id} />
        <UrgencyEscalationGate studyId={study.id} findings={sortedFindings} />
        {r && <ConfidenceFloorBanner tier={study.modality.tier} confidence={r.overallConfidence} />}
      </div>

      {DICOM_FEATURES_ENABLED && (
        <PacsPushPanel studyId={study.id} isReviewed={isReviewed} className="mb-5" />
      )}


      {isTierC && <ResearchAssistedBanner className="mb-5" />}

      {/* ─── Sticky finding navigator (excluded from PDF) ─── */}
      {sortedFindings.length > 0 && (
        <div
          data-pdf-skip="true"
          className="sticky top-16 z-30 mb-5 -mx-4 sm:mx-0"
        >
          <div className="surface-clinical px-3 py-2.5 sm:px-4 flex items-center gap-2 backdrop-blur-md bg-surface-raised/85 border border-border shadow-sm rounded-none sm:rounded-xl">
            <ListChecks className="h-4 w-4 text-primary shrink-0" />
            <div className="hidden sm:block text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground shrink-0">
              Go to
            </div>

            <Select
              value={activeFinding?.id}
              onValueChange={(val) => {
                const next = sortedFindings.find((f) => f.id === val);
                // Selector jumps WITHOUT changing the URL.
                goToFinding(next, { updateUrl: false });
              }}
            >
              <SelectTrigger className="h-9 flex-1 min-w-0 bg-surface border-border text-sm">
                <SelectValue placeholder="Select a finding" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {sortedFindings.map((f) => (
                  <SelectItem key={f.id} value={f.id} className="text-sm">
                    <span className="inline-flex items-center gap-2">
                      <span className={cn("h-2 w-2 rounded-full shrink-0", SEV_BAR[f.severity])} />
                      <span className="truncate">{f.title}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Prev / counter / Next — drives URL deep-link */}
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="icon"
                variant="outline"
                className="h-9 w-9"
                onClick={goPrev}
                disabled={activeIndex <= 0}
                aria-label="Previous finding"
                title="Previous finding (←)"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="font-mono text-xs tabular-nums text-muted-foreground px-1.5 min-w-[3.25rem] text-center">
                {activeIndex >= 0 ? activeIndex + 1 : "–"}/{sortedFindings.length}
              </div>
              <Button
                size="icon"
                variant="outline"
                className="h-9 w-9"
                onClick={goNext}
                disabled={activeIndex < 0 || activeIndex >= sortedFindings.length - 1}
                aria-label="Next finding"
                title="Next finding (→)"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Capture root for PDF */}
      <div ref={reportRef}>
        {/* ── Doctor branded letterhead (PDF only, Pro/Pro+) ── */}
        {canBrand && branding?.enabled && (
          <BrandedLetterhead branding={branding} editedByDoctor={wasEdited} />
        )}
        {/* Compact header */}
        <header className="surface-clinical p-5 md:p-6 mb-5 relative overflow-hidden">
          <div className={cn("absolute left-0 top-0 bottom-0 w-1", isTierC ? "tier-stripe-research" : "tier-stripe-nvidia")} />
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{study.modality.category}</div>
              <h1 className="font-display text-2xl md:text-3xl tracking-tight mt-1">{study.modality.label}</h1>
              <div className="mt-1.5 text-xs text-muted-foreground">
                Study <span className="font-mono">{study.id}</span> · {new Date(study.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
              </div>
            </div>
            {!isReviewed && (
              <Button
                onClick={() => navigate(`/app/study/${study.id}`)}
                size="sm"
                variant="outline"
                data-pdf-skip="true"
              >
                <ShieldCheck className="h-4 w-4 mr-1.5" /> Open review gate
              </Button>
            )}
          </div>
        </header>

        {/* ─── Uploaded study image(s) — PDF-only, hidden in the app UI ─── */}
        {study.previewAssets && study.previewAssets.filter((a) => a.kind === "image").length > 0 && (() => {
          const imgs = study.previewAssets.filter((a) => a.kind === "image").slice(0, 10);
          const count = imgs.length;
          // Adaptive grid: 1 → solo · 2 → 2-up · 3-4 → 2 cols · 5-6 → 3 cols · 7-10 → 3 cols smaller
          const gridCols =
            count === 1 ? "grid-cols-1"
            : count <= 4 ? "grid-cols-2"
            : "grid-cols-3";
          // Tighter image cap so 10 fit cleanly across pages
          const imgMaxH = count <= 2 ? 480 : count <= 4 ? 360 : count <= 6 ? 280 : 220;
          return (
            <section
              data-pdf-only="true"
              data-pdf-gallery-count={count}
              className="hidden surface-clinical p-5 md:p-6 mb-5"
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display text-lg tracking-tight inline-flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  Uploaded study image{count > 1 ? "s" : ""}
                </h2>
                <span className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">
                  {count} of {study.imagesCount} · {study.modality.label}
                </span>
              </div>
              <div className={cn("grid gap-3", gridCols)} data-pdf-gallery-grid>
                {imgs.map((a, i) => (
                  <figure
                    key={i}
                    className="rounded-xl overflow-hidden border border-border bg-[hsl(var(--image-backdrop))] flex flex-col"
                  >
                    <div className="flex-1 flex items-center justify-center bg-[hsl(var(--image-backdrop))]">
                      <img
                        src={a.src}
                        alt={a.name ?? `Study image ${i + 1}`}
                        crossOrigin="anonymous"
                        className="block w-full h-auto object-contain"
                        style={{ maxHeight: `${imgMaxH}px` }}
                      />
                    </div>
                    <figcaption className="px-3 py-1.5 text-[0.65rem] uppercase tracking-wider text-muted-foreground bg-background/80 border-t border-border flex items-center justify-between gap-2">
                      <span className="font-mono">IMG&nbsp;{String(i + 1).padStart(2, "0")}</span>
                      <span className="truncate normal-case tracking-normal text-foreground/70">
                        {a.name ?? `${study.modality.label} capture`}
                      </span>
                    </figcaption>
                  </figure>
                ))}
              </div>
              <figcaption className="mt-3 text-[0.7rem] text-muted-foreground italic">
                Images as submitted by the clinician — embedded for record-keeping ({count} of {study.imagesCount}).
              </figcaption>
            </section>
          );
        })()}

        {/* ─── Compare-mode per-timepoint image gallery (PDF + in-app) ─── */}
        {isCompareStudy && compareTimepointsRaw && Object.keys(compareImageUrls).length > 0 && (
          <section data-pdf-only="true" className="hidden surface-clinical p-5 md:p-6 mb-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg tracking-tight inline-flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Timepoint images — {study.modality.label}
              </h2>
              <span className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">
                {compareTimepointsRaw.length} timepoints · oldest → newest
              </span>
            </div>
            <div className="space-y-5">
              {[...compareTimepointsRaw]
                .sort((a, b) => (a.chrono_order ?? 0) - (b.chrono_order ?? 0))
                .map((tp) => {
                  const order = tp.chrono_order ?? tp.index ?? 0;
                  const urls = compareImageUrls[order] ?? [];
                  if (urls.length === 0) return null;
                  const cols = urls.length === 1 ? "grid-cols-1" : "grid-cols-2";
                  return (
                    <div key={`tp-${order}`} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium">
                          <span className="font-mono text-[0.7rem] text-muted-foreground mr-2">T{order + 1}</span>
                          {tp.label}
                        </div>
                        <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                          {urls.length} image{urls.length > 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className={cn("grid gap-3", cols)} data-pdf-gallery-grid>
                        {urls.map((src, i) => (
                          <figure key={i} className="rounded-xl overflow-hidden border border-border bg-[hsl(var(--image-backdrop))] flex flex-col">
                            <div className="flex-1 flex items-center justify-center bg-[hsl(var(--image-backdrop))]">
                              <img
                                src={src}
                                alt={`${tp.label} image ${i + 1}`}
                                crossOrigin="anonymous"
                                className="block w-full h-auto object-contain"
                                style={{ maxHeight: "320px" }}
                              />
                            </div>
                            <figcaption className="px-3 py-1.5 text-[0.65rem] uppercase tracking-wider text-muted-foreground bg-background/80 border-t border-border flex items-center justify-between gap-2">
                              <span className="font-mono">T{order + 1}·IMG&nbsp;{String(i + 1).padStart(2, "0")}</span>
                              <span className="truncate normal-case tracking-normal text-foreground/70">{tp.label}</span>
                            </figcaption>
                          </figure>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>
            <figcaption className="mt-3 text-[0.7rem] text-muted-foreground italic">
              Longitudinal series — same patient, same modality, ordered chronologically.
            </figcaption>
          </section>
        )}


        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          {/* ── Viewer column ── */}
          <div className="space-y-5 min-w-0 lg:sticky lg:top-32 lg:self-start">
            <div data-pdf-skip="true">
              <ReasoningReplay
                study={study}
                onActiveBeatChange={(b) => {
                  if (b?.findingId) setActiveId(b.findingId);
                }}
              />
            </div>

            {/* Severity strip (compact under viewer) */}
            {r && (
              <div className="surface-clinical p-4 md:p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">Overall confidence</div>
                    <div className="font-display text-3xl tracking-tight mt-0.5 leading-none">
                      {Math.round(r.overallConfidence * 100)}%
                    </div>
                    <div className="mt-1 text-[0.7rem] text-muted-foreground">
                      {study.modality.catalog === "nvidia_backed"
                        ? "NVIDIA-Backed clinical model"
                        : "Research-assisted foundation model"}
                    </div>
                  </div>
                  <ConfidenceGauge value={r.overallConfidence} />
                </div>
                <div className="mt-4 grid grid-cols-4 gap-2">
                  {SEV_ORDER.map((s) => (
                    <div key={s} className="rounded-lg bg-surface p-2 text-center">
                      <div className={cn("h-1 w-6 rounded-full mx-auto", SEV_BAR[s])} />
                      <div className="font-display text-lg mt-1 leading-none">{counts[s]}</div>
                      <div className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">{SEV_LABEL[s]}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Report column ── */}
          <div className="space-y-5 min-w-0">
            {(r as unknown as { isMultiModality?: boolean })?.isMultiModality && (
              <MultiModalitySection report={r as unknown as MultiReportShape} />
            )}
            {(r as unknown as { isCompareMode?: boolean })?.isCompareMode && (
              <CompareSection report={r as unknown as CompareReportShape} />
            )}
            <section className="surface-clinical p-5 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-xl tracking-tight inline-flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" /> Findings
                </h2>
                <span className="text-xs text-muted-foreground">
                  {sortedFindings.length} identified · tap a badge to expand
                </span>
              </div>
              <ul className="space-y-3 list-none p-0">
                {sortedFindings.map((f, i) => (
                  <motion.li
                    key={f.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.04, 0.3) }}
                    className="list-none"
                    data-finding-card="true"
                  >
                    <FindingCard
                      finding={f}
                      narrative={r?.narrative}
                      studyId={study.id}
                      open={!!openMap[f.id]}
                      onOpenChange={(next) => {
                        setOpenMap((prev) => ({ ...prev, [f.id]: next }));
                        if (next) setActiveId(f.id);
                      }}
                    />
                  </motion.li>
                ))}
                {sortedFindings.length === 0 && (
                  <li className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    No findings have been generated yet.
                  </li>
                )}
              </ul>
            </section>

            {r && (
              <section className="surface-clinical p-5 md:p-6">
                <h2 className="font-display text-xl tracking-tight mb-3 inline-flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> Narrative summary
                </h2>
                <p className="text-[0.95rem] leading-relaxed text-foreground/90 text-pretty whitespace-pre-line">
                  {r.narrative}
                </p>
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

            {/* ── Differential diagnosis (top finding) ── */}
            {activeFinding?.differentials && activeFinding.differentials.length > 0 && (
              <DifferentialPanel
                findingTitle={activeFinding.title}
                differentials={activeFinding.differentials}
              />
            )}

            {/* ── Patient summary (toggleable, plain language) ── */}
            {r && <PatientSummaryCard study={study} />}

            {/* ── Authoritative references (PubMed / NIH / ClinicalTrials / guidelines) ── */}
            {r?.webCitations && r.webCitations.length > 0 && (
              <section className="surface-clinical p-5 md:p-6">
                <ReferencesPanel citations={r.webCitations} />
              </section>
            )}

            {/* ── Comparison mode (prior vs current) ── */}
            <details className="surface-clinical p-5 md:p-6 group" data-pdf-skip="true">
              <summary className="cursor-pointer flex items-center gap-2 font-display text-lg tracking-tight">
                <ArrowLeftRight className="h-4 w-4 text-primary" /> Comparison mode
                <span className="text-xs text-muted-foreground font-normal ml-auto group-open:hidden">Open</span>
              </summary>
              <div className="mt-4">
                <ComparisonViewer current={study} />
              </div>
            </details>

            {/* ── Multi-language translation ── */}
            {r && <ReportTranslationPanel study={study} />}

            {/* ── Domain-aware AI chat (Allopathy / Ayurveda / Homeopathy / Siddha / Unani) ── */}
            {r && <DomainReportChat study={study} />}
          </div>
        </div>
      </div>
      {r && (
        <ReportEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          studyId={study.id}
          report={r}
          onSaved={handleSavedEdit}
        />
      )}
    </AppShell>
  );
};

interface MultiLegReport {
  legIndex: number;
  legSlug: string;
  legLabel: string;
  legCategory: string;
  narrative: string;
  findings: Array<{ title: string; description?: string; severity?: string; confidence?: number }>;
  measurements?: Record<string, unknown>;
  informationGaps?: string[];
}
interface MultiReportShape {
  isMultiModality?: boolean;
  unifiedImpression?: string;
  unifiedRecommendations?: string[];
  urgency?: string;
  legs?: MultiLegReport[];
}

function MultiModalitySection({ report }: { report: MultiReportShape }) {
  const legs = report.legs ?? [];
  return (
    <section className="surface-clinical p-5 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl tracking-tight inline-flex items-center gap-2">
          🧬 Multi-modality synthesis
        </h2>
        {report.urgency && (
          <span className="text-[0.65rem] uppercase tracking-wider rounded-full border border-border bg-surface-raised px-2 py-0.5">
            {report.urgency}
          </span>
        )}
      </div>
      {report.unifiedImpression && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="text-[0.7rem] uppercase tracking-wider text-muted-foreground mb-1">
            Unified impression
          </div>
          <p className="text-sm leading-relaxed">{report.unifiedImpression}</p>
        </div>
      )}
      {report.unifiedRecommendations && report.unifiedRecommendations.length > 0 && (
        <div>
          <div className="text-[0.7rem] uppercase tracking-wider text-muted-foreground mb-1.5">
            Unified recommendations
          </div>
          <ul className="list-disc list-inside text-sm space-y-1 text-foreground">
            {report.unifiedRecommendations.map((rec, i) => <li key={i}>{rec}</li>)}
          </ul>
        </div>
      )}
      {legs.length > 0 && (
        <div className="space-y-2">
          <div className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">
            Per-modality reports ({legs.length})
          </div>
          {legs.map((leg) => (
            <details
              key={leg.legIndex}
              className="rounded-lg border border-border bg-surface group"
            >
              <summary className="cursor-pointer px-4 py-2.5 flex items-center justify-between text-sm font-medium">
                <span>
                  <span className="font-mono text-[0.7rem] text-muted-foreground mr-2">
                    L{leg.legIndex + 1}
                  </span>
                  {leg.legLabel}
                </span>
                <span className="text-[0.7rem] text-muted-foreground">
                  {leg.findings.length} findings
                </span>
              </summary>
              <div className="px-4 pb-3 pt-1 text-sm text-muted-foreground space-y-2">
                {leg.narrative && <p className="leading-relaxed">{leg.narrative}</p>}
                {leg.findings.length > 0 && (
                  <ul className="list-disc list-inside space-y-1 text-foreground">
                    {leg.findings.map((f, i) => (
                      <li key={i}>
                        <span className="font-medium">{f.title}</span>
                        {f.description && <span className="text-muted-foreground"> — {f.description}</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {leg.informationGaps && leg.informationGaps.length > 0 && (
                  <div className="text-xs italic">
                    Gaps: {leg.informationGaps.join(" · ")}
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

// ─────────────────────── Compare-mode types & section ───────────────────────
interface CompareTimepointShape {
  index: number;
  chrono_order: number;
  label: string;
  age_hours: number;
  absolute_date?: string | null;
  storage_paths?: string[];
  detected_modality_slug?: string | null;
  detection_confidence?: number | null;
  modality_match?: boolean | null;
}

interface CompareTimepointReport {
  index: number;
  chronoOrder: number;
  label: string;
  ageHours: number;
  absoluteDate?: string | null;
  narrative: string;
  findings: Array<{ title: string; description?: string; severity?: string; confidence?: number }>;
  informationGaps?: string[];
  detectedModalitySlug?: string | null;
  detectionConfidence?: number | null;
}

type IntervalDirection = "improving" | "stable" | "worsening" | "new" | "mixed";

interface CompareReportShape {
  isCompareMode?: boolean;
  modalitySlug?: string;
  modalityLabel?: string;
  intervalChange?: IntervalDirection;
  intervalFindings?: Array<{
    title: string;
    description?: string;
    direction?: IntervalDirection;
    timepoints?: number[];
  }>;
  timepoints?: CompareTimepointReport[];
  unifiedImpression?: string;
  unifiedRecommendations?: string[];
  urgency?: string;
}

const INTERVAL_LABEL: Record<IntervalDirection, string> = {
  improving: "Improving",
  stable: "Stable",
  worsening: "Worsening",
  new: "New finding(s)",
  mixed: "Mixed",
};
const INTERVAL_TONE: Record<IntervalDirection, string> = {
  improving: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  stable: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  worsening: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  new: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  mixed: "bg-violet-500/15 text-violet-400 border-violet-500/30",
};

function CompareSection({ report }: { report: CompareReportShape }) {
  const tps = [...(report.timepoints ?? [])].sort((a, b) => a.chronoOrder - b.chronoOrder);
  const direction = report.intervalChange ?? "stable";

  return (
    <section className="surface-clinical p-5 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-display text-xl tracking-tight inline-flex items-center gap-2">
          📈 Interval-change synthesis
          {report.modalityLabel && (
            <span className="text-xs font-normal text-muted-foreground ml-1">
              · {report.modalityLabel}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-[0.65rem] uppercase tracking-wider rounded-full border px-2 py-0.5",
              INTERVAL_TONE[direction],
            )}
          >
            {INTERVAL_LABEL[direction]}
          </span>
          {report.urgency && (
            <span className="text-[0.65rem] uppercase tracking-wider rounded-full border border-border bg-surface-raised px-2 py-0.5">
              {report.urgency}
            </span>
          )}
        </div>
      </div>

      {/* Timeline strip */}
      {tps.length > 0 && (
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="text-[0.65rem] uppercase tracking-wider text-muted-foreground mb-2">
            Timeline (oldest → newest)
          </div>
          <ol className="flex items-stretch gap-2 overflow-x-auto pb-1">
            {tps.map((tp, i) => (
              <li key={tp.chronoOrder} className="flex items-center gap-2 shrink-0">
                <div className="rounded-md border border-border bg-surface-raised px-3 py-2 min-w-[120px]">
                  <div className="font-mono text-[0.65rem] text-muted-foreground">
                    T{tp.chronoOrder + 1}
                  </div>
                  <div className="text-xs font-medium truncate max-w-[180px]" title={tp.label}>
                    {tp.label}
                  </div>
                </div>
                {i < tps.length - 1 && (
                  <span className="text-muted-foreground text-xs">→</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {report.unifiedImpression && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="text-[0.7rem] uppercase tracking-wider text-muted-foreground mb-1">
            Unified impression
          </div>
          <p className="text-sm leading-relaxed">{report.unifiedImpression}</p>
        </div>
      )}

      {report.intervalFindings && report.intervalFindings.length > 0 && (
        <div>
          <div className="text-[0.7rem] uppercase tracking-wider text-muted-foreground mb-1.5">
            Interval findings ({report.intervalFindings.length})
          </div>
          <ul className="space-y-2">
            {report.intervalFindings.map((f, i) => {
              const dir = (f.direction ?? "stable") as IntervalDirection;
              return (
                <li
                  key={i}
                  className="rounded-lg border border-border bg-surface p-3 flex items-start gap-3"
                >
                  <span
                    className={cn(
                      "shrink-0 text-[0.6rem] uppercase tracking-wider rounded-full border px-2 py-0.5 mt-0.5",
                      INTERVAL_TONE[dir],
                    )}
                  >
                    {INTERVAL_LABEL[dir]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{f.title}</div>
                    {f.description && (
                      <div className="text-xs text-muted-foreground mt-0.5">{f.description}</div>
                    )}
                    {f.timepoints && f.timepoints.length > 0 && (
                      <div className="text-[0.65rem] uppercase tracking-wider text-muted-foreground mt-1">
                        Seen at: {f.timepoints.map((t) => `T${t + 1}`).join(" · ")}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {report.unifiedRecommendations && report.unifiedRecommendations.length > 0 && (
        <div>
          <div className="text-[0.7rem] uppercase tracking-wider text-muted-foreground mb-1.5">
            Unified recommendations
          </div>
          <ul className="list-disc list-inside text-sm space-y-1 text-foreground">
            {report.unifiedRecommendations.map((rec, i) => <li key={i}>{rec}</li>)}
          </ul>
        </div>
      )}

      {tps.length > 0 && (
        <div className="space-y-2">
          <div className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">
            Per-timepoint reports ({tps.length})
          </div>
          {tps.map((tp) => (
            <details
              key={tp.chronoOrder}
              className="rounded-lg border border-border bg-surface group"
            >
              <summary className="cursor-pointer px-4 py-2.5 flex items-center justify-between text-sm font-medium">
                <span>
                  <span className="font-mono text-[0.7rem] text-muted-foreground mr-2">
                    T{tp.chronoOrder + 1}
                  </span>
                  {tp.label}
                </span>
                <span className="text-[0.7rem] text-muted-foreground">
                  {tp.findings.length} finding{tp.findings.length === 1 ? "" : "s"}
                </span>
              </summary>
              <div className="px-4 pb-3 pt-1 text-sm text-muted-foreground space-y-2">
                {tp.narrative && <p className="leading-relaxed">{tp.narrative}</p>}
                {tp.findings.length > 0 && (
                  <ul className="list-disc list-inside space-y-1 text-foreground">
                    {tp.findings.map((f, i) => (
                      <li key={i}>
                        <span className="font-medium">{f.title}</span>
                        {f.description && (
                          <span className="text-muted-foreground"> — {f.description}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {tp.informationGaps && tp.informationGaps.length > 0 && (
                  <div className="text-xs italic">
                    Gaps: {tp.informationGaps.join(" · ")}
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

export default ReportViewer;
