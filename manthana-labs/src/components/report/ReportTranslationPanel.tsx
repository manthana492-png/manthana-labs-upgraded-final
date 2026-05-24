import { useState } from "react";
import { Languages, Loader2, Copy, Check, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { LANGUAGES, isRtl } from "@/lib/languages";
import { trackPdfDownloaded } from "@/lib/analytics";
import type { Study } from "@/lib/types";

/**
 * ReportTranslationPanel — translate the narrative + findings into any
 * supported Indian language for patient/family handoff. Also exports a
 * localized PDF in the chosen language.
 */
export function ReportTranslationPanel({ study }: { study: Study }) {
  const [language, setLanguage] = useState<string>("Hindi");
  const [audience, setAudience] = useState<"patient" | "clinician">("patient");
  const [translation, setTranslation] = useState("");
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

  const r = study.report;
  if (!r) return null;

  const sourceText = [
    `Modality: ${study.modality.label}`,
    "",
    "Findings:",
    ...r.findings.map((f, i) =>
      `${i + 1}. [${f.severity.toUpperCase()}] ${f.title}` +
      (f.anatomicalRegion ? ` — ${f.anatomicalRegion}` : "") +
      (f.icd10Code ? ` (ICD-10 ${f.icd10Code})` : "") +
      (f.impression ? `\n   Impression: ${f.impression}` : "") +
      (f.recommendation ? `\n   Next step: ${f.recommendation}` : ""),
    ),
    "",
    "Narrative:",
    r.narrative,
    r.patientSummary ? `\n\nPatient summary:\n${r.patientSummary}` : "",
  ].join("\n");

  async function ensureTranslation(): Promise<string> {
    if (translation) return translation;
    const { data, error } = await supabase.functions.invoke("translate-report", {
      body: { text: sourceText, targetLanguage: language, audience },
    });
    if (error) throw error;
    const payload = data as { translation?: string; error?: string };
    if (payload.error) throw new Error(payload.error);
    const text = (payload.translation ?? "").trim();
    if (!text) throw new Error("Empty translation");
    setTranslation(text);
    return text;
  }

  async function translate() {
    setBusy(true);
    setTranslation("");
    try {
      await ensureTranslation();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Translation failed.";
      toast({ title: "Could not translate", description: msg });
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!translation) return;
    try {
      await navigator.clipboard.writeText(translation);
      setCopied(true);
      toast({ title: "Translation copied", description: "Ready for WhatsApp / SMS." });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: "Copy failed — please select manually." });
    }
  }

  /**
   * Build a localized PDF using jsPDF with a Unicode-safe approach.
   * We render the translated text into a hidden, native-script DOM block
   * and use html2canvas → image to preserve regional scripts (Devanagari,
   * Tamil, Bengali, Arabic …) which jsPDF's built-in fonts cannot render
   * directly. The header/footer is drawn natively in Latin.
   */
  async function downloadTranslatedPdf() {
    setDownloading(true);
    try {
      const text = await ensureTranslation();
      const code = LANGUAGES.find((l) => l.label === language)?.code ?? "en";
      const rtl = isRtl(code);
      const native = LANGUAGES.find((l) => l.label === language)?.native ?? language;

      const PRINT_WIDTH = 980;
      const stage = document.createElement("div");
      stage.style.cssText = [
        "position:fixed",
        "left:-10000px",
        "top:0",
        `width:${PRINT_WIDTH}px`,
        "background:#ffffff",
        "color:#0a0a0a",
        "padding:48px",
        "font-family:'Noto Sans','Noto Sans Devanagari','Noto Sans Tamil','Noto Sans Bengali','Noto Sans Telugu','Noto Sans Kannada','Noto Sans Malayalam','Noto Sans Gujarati','Noto Sans Gurmukhi','Noto Sans Oriya','Noto Naskh Arabic',Arial,sans-serif",
        "font-size:15px",
        "line-height:1.65",
        rtl ? "direction:rtl" : "direction:ltr",
      ].join(";");

      const header = document.createElement("div");
      header.style.cssText = "border-bottom:1px solid #e5e7eb;padding-bottom:14px;margin-bottom:18px;direction:ltr;text-align:left;";
      header.innerHTML = `
        <div style="font-size:20px;font-weight:700;letter-spacing:-0.02em;">Manthana‑Labs — Translated Report</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px;">
          ${escapeHtml(study.modality.label)} · Tier ${escapeHtml(study.modality.tier)} · Study ${escapeHtml(study.id)}
        </div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px;">
          Language: ${escapeHtml(language)} (${escapeHtml(native)}) · Audience: ${escapeHtml(audience)} · ${new Date().toLocaleDateString("en-IN")}
        </div>
      `;
      stage.appendChild(header);

      const body = document.createElement("div");
      body.style.cssText = "white-space:pre-wrap;word-break:break-word;";
      body.textContent = text;
      stage.appendChild(body);

      const footer = document.createElement("div");
      footer.style.cssText = "margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:11px;color:#6b7280;direction:ltr;text-align:left;";
      footer.innerHTML = `
        AI-assisted translation. The English original is the source of truth — clinician interpretation required.
        <br/>A product of <strong>Quaasx 108 Private Limited</strong> · info@quaasx108.com
      `;
      stage.appendChild(footer);

      document.body.appendChild(stage);

      try {
        const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
          import("jspdf"),
          import("html2canvas"),
        ]);

        // Wait for fonts
        if ((document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready) {
          try { await (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready; } catch { /* noop */ }
        }
        await new Promise((res) => requestAnimationFrame(() => res(null)));

        const canvas = await html2canvas(stage, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          logging: false,
          windowWidth: PRINT_WIDTH + 96,
        });

        const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const margin = 28;
        const contentW = pageW - margin * 2;
        const topGutter = 24;
        const bottomGutter = 24;
        const usableH = pageH - topGutter - bottomGutter;
        const pageSlicePxH = (usableH * canvas.width) / contentW;

        let sourceY = 0;
        let pageNum = 0;
        const totalPages = Math.max(1, Math.ceil(canvas.height / pageSlicePxH));

        while (sourceY < canvas.height) {
          if (pageNum > 0) pdf.addPage();
          pageNum++;
          const sliceH = Math.min(pageSlicePxH, canvas.height - sourceY);
          const sliceCanvas = document.createElement("canvas");
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = sliceH;
          sliceCanvas.getContext("2d")?.drawImage(
            canvas, 0, sourceY, canvas.width, sliceH, 0, 0, canvas.width, sliceH,
          );
          const renderedH = (sliceH * contentW) / canvas.width;
          pdf.addImage(
            sliceCanvas.toDataURL("image/jpeg", 0.95),
            "JPEG", margin, topGutter, contentW, renderedH,
          );
          // page number footer
          pdf.setFont("helvetica", "italic");
          pdf.setFontSize(8);
          pdf.setTextColor(120, 120, 120);
          pdf.text(`Page ${pageNum} / ${totalPages}`, pageW - margin, pageH - 12, { align: "right" });
          pdf.setTextColor(0, 0, 0);
          sourceY += sliceH;
        }

        pdf.save(`manthana-report-${study.id}-${code}.pdf`);
        trackPdfDownloaded(study.id, `translated-${code}`);
        toast({
          title: "Translated PDF downloaded",
          description: `${language} · manthana-report-${study.id}-${code}.pdf`,
        });
      } finally {
        stage.remove();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "PDF generation failed.";
      toast({ title: "Could not generate translated PDF", description: msg });
    } finally {
      setDownloading(false);
    }
  }

  const code = LANGUAGES.find((l) => l.label === language)?.code ?? "en";
  const rtl = isRtl(code);

  return (
    <section className="surface-clinical p-5 md:p-6" data-pdf-skip="true">
      <header className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display text-xl tracking-tight inline-flex items-center gap-2">
            <Languages className="h-4 w-4 text-primary" /> Translate report
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Faithful translation across India's regional languages — codes &amp; units preserved.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Select value={language} onValueChange={(v) => { setLanguage(v); setTranslation(""); }}>
          <SelectTrigger className="h-9 w-44 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {LANGUAGES.map((l) => (
              <SelectItem key={l.code} value={l.label} className="text-sm">
                {l.label} · <span className="text-muted-foreground">{l.native}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
          {(["patient", "clinician"] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAudience(a)}
              className={cn(
                "px-2.5 py-1 text-xs rounded-md transition capitalize",
                audience === a ? "bg-primary/15 text-foreground" : "text-muted-foreground",
              )}
            >
              {a}
            </button>
          ))}
        </div>

        <Button
          size="sm"
          onClick={translate}
          disabled={busy || downloading}
          className="bg-primary hover:bg-primary/90 ml-auto"
        >
          {busy ? (
            <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Translating…</>
          ) : (
            <><Languages className="h-3.5 w-3.5 mr-1.5" /> Translate</>
          )}
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={downloadTranslatedPdf}
          disabled={busy || downloading}
          title={`Download a localized PDF in ${language}`}
        >
          {downloading ? (
            <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Building PDF…</>
          ) : (
            <><FileDown className="h-3.5 w-3.5 mr-1.5" /> Download {language} PDF</>
          )}
        </Button>
      </div>

      <div
        className="rounded-xl border border-border bg-surface min-h-[8rem] max-h-[28rem] overflow-y-auto p-3 sm:p-4 text-sm leading-relaxed whitespace-pre-wrap"
        dir={rtl ? "rtl" : "ltr"}
      >
        {translation
          ? translation
          : <span className="text-muted-foreground italic text-xs">Pick a language and click Translate — or jump straight to "Download {language} PDF".</span>}
      </div>

      {translation && (
        <div className="mt-3 flex justify-end">
          <Button size="sm" variant="outline" onClick={copy}>
            {copied
              ? <><Check className="h-3.5 w-3.5 mr-1.5" /> Copied</>
              : <><Copy className="h-3.5 w-3.5 mr-1.5" /> Copy translation</>}
          </Button>
        </div>
      )}
    </section>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
