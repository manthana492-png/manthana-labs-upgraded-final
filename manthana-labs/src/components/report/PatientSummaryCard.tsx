import { useState } from "react";
import { Heart, Copy, Check, Sparkles, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useStudies } from "@/lib/store";
import type { Study } from "@/lib/types";

/**
 * PatientSummaryCard — toggleable plain-language version of the report.
 * Includes a "Generate with AI" action that calls the
 * `generate-patient-summary` edge function (Lovable AI gateway).
 */
export function PatientSummaryCard({
  study,
  className,
}: {
  study: Study;
  className?: string;
}) {
  const setPatientSummary = useStudies((s) => s.setPatientSummary);
  const summary = study.report?.patientSummary;
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);

  const onCopy = async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      toast({ title: "Patient summary copied", description: "Ready to paste into WhatsApp / SMS." });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: "Could not copy — please select and copy manually." });
    }
  };

  const generate = async () => {
    if (!study.report) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-patient-summary", {
        body: {
          modality: study.modality.label,
          narrative: study.report.narrative,
          findings: study.report.findings.map((f) => ({
            title: f.title,
            severity: f.severity,
            impression: f.impression,
            recommendation: f.recommendation,
            anatomicalRegion: f.anatomicalRegion,
          })),
        },
      });
      if (error) throw error;
      const payload = data as { summary?: string; error?: string };
      if (payload.error) throw new Error(payload.error);
      const text = (payload.summary ?? "").trim();
      if (!text) throw new Error("Empty summary returned");
      setPatientSummary(study.id, text);
      setOpen(true);
      toast({ title: "Patient summary generated", description: "Review before sharing." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not generate summary.";
      toast({ title: "AI summary failed", description: msg });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-surface-raised overflow-hidden",
        className,
      )}
    >
      <div className="w-full flex items-center justify-between gap-3 p-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2.5 min-w-0 flex-1 focus-ring rounded-md text-left"
          aria-expanded={open}
        >
          <div className="h-8 w-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center shrink-0">
            <Heart className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="font-display text-sm tracking-tight">Patient-facing summary</div>
            <div className="text-[0.7rem] text-muted-foreground">
              Plain-language · ~ Class 8 reading level · safe to share
            </div>
          </div>
        </button>
        <Button
          size="sm"
          variant={summary ? "outline" : "default"}
          onClick={generate}
          disabled={generating || !study.report}
          className={cn(!summary && "bg-primary hover:bg-primary/90")}
          data-pdf-skip="true"
        >
          {generating ? (
            <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Generating…</>
          ) : summary ? (
            <><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Regenerate</>
          ) : (
            <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Generate with AI</>
          )}
        </Button>
      </div>

      {open && summary && (
        <div className="border-t border-border bg-surface px-4 py-4 space-y-3">
          <pre className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap font-sans text-pretty">
            {summary}
          </pre>
          <div className="flex justify-end" data-pdf-skip="true">
            <Button size="sm" variant="outline" onClick={onCopy}>
              {copied ? (
                <><Check className="h-3.5 w-3.5 mr-1.5" /> Copied</>
              ) : (
                <><Copy className="h-3.5 w-3.5 mr-1.5" /> Copy summary</>
              )}
            </Button>
          </div>
        </div>
      )}
      {open && !summary && (
        <div className="border-t border-border bg-surface px-4 py-4 text-xs text-muted-foreground italic">
          No patient summary yet. Click <span className="font-medium not-italic">Generate with AI</span> to create one your patient can understand.
        </div>
      )}
    </section>
  );
}
