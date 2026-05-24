import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ScanLine, Upload, ShieldCheck, AlertTriangle, FileText, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface ExtractedCertificateFields {
  fullName?: string | null;
  registrationNumber?: string | null;
  registrationYear?: string | null;
  councilBody?: string | null;
  councilState?: string | null;
  system?: "allopathy" | "ayurveda" | "homeopathy" | "siddha" | "unani" | "dental" | null;
  qualification?: string | null;
  specialty?: string | null;
  confidence: number;
  documentLooksGenuine: boolean;
  warnings: string[];
  rawText: string;
}

interface Props {
  onExtracted: (fields: ExtractedCertificateFields) => void;
}

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/jpg", "image/webp", "application/pdf"];

/** Read file → base64 (without the data URL prefix). */
const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const out = String(r.result ?? "");
      const idx = out.indexOf(",");
      resolve(idx >= 0 ? out.slice(idx + 1) : out);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

export function CertificateUploader({ onExtracted }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExtractedCertificateFields | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (f: File) => {
    if (!ACCEPTED.includes(f.type)) {
      toast.error("Use a PNG, JPG, WEBP or PDF certificate.");
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error("File too large. Please keep under 8 MB.");
      return;
    }
    setFile(f);
    setResult(null);
    if (f.type.startsWith("image/")) {
      const url = URL.createObjectURL(f);
      setPreview(url);
    } else {
      setPreview(null);
    }
  }, []);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const reset = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const runExtraction = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const imageBase64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke("ocr-certificate", {
        body: { imageBase64, mimeType: file.type },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error ?? "Extraction failed.");
      const fields = data.fields as ExtractedCertificateFields;
      setResult(fields);
      onExtracted(fields);
      // We accept every uploaded certificate without backend verification.
      // The doctor's typed/scanned details are taken on trust at signup —
      // formal council cross-check is a future enhancement.
      if (fields.confidence >= 0.4) {
        toast.success("Details read from your certificate — please review below.");
      } else {
        toast.message("Read partially — please review or type manually below.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Extraction failed.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const confidencePct = result ? Math.round(result.confidence * 100) : 0;
  const confidenceTone =
    !result ? "muted"
    : result.confidence >= 0.7 ? "ok"
    : result.confidence >= 0.4 ? "warn"
    : "bad";

  return (
    <div className="surface-clinical p-5 md:p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Sparkles className="h-5 w-5" strokeWidth={2.2} />
        </div>
        <div>
          <h3 className="font-medium text-sm">AI certificate verification</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Upload your council registration certificate — our AI reads it instantly and auto-fills the form below.
            Works for NMC, State Councils, NCISM, NCH and DCI.
          </p>
        </div>
      </div>

      {!file && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cn(
            "w-full rounded-lg border-2 border-dashed transition-colors p-6 flex flex-col items-center justify-center gap-2 text-center focus-ring",
            dragOver ? "border-primary bg-primary/5" : "border-border/70 hover:border-primary/50 hover:bg-muted/30"
          )}
        >
          <Upload className="h-6 w-6 text-muted-foreground" />
          <div className="text-sm font-medium">Drop your certificate here, or click to upload</div>
          <div className="text-xs text-muted-foreground">PNG · JPG · WEBP · PDF · up to 8 MB</div>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        onChange={onPick}
        className="hidden"
      />

      {file && (
        <div className="rounded-lg border border-border/70 bg-background overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/60 bg-muted/30">
            <div className="flex items-center gap-2 text-xs min-w-0">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="truncate font-medium">{file.name}</span>
              <span className="text-muted-foreground shrink-0">· {(file.size / 1024).toFixed(0)} KB</span>
            </div>
            <button
              type="button"
              onClick={reset}
              className="p-1 rounded hover:bg-muted text-muted-foreground"
              aria-label="Remove file"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {preview ? (
            <img src={preview} alt="Certificate preview" className="max-h-64 w-full object-contain bg-muted/20" />
          ) : (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              PDF preview unavailable — extraction will run on the file directly.
            </div>
          )}
          <div className="p-3 flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              onClick={runExtraction}
              disabled={busy}
              className="w-full sm:flex-1 h-10"
            >
              {busy ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Reading certificate…</>
              ) : (
                <><ScanLine className="h-4 w-4 mr-2" /> Extract & verify</>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="w-full sm:w-auto h-10"
            >
              Replace
            </Button>
          </div>
        </div>
      )}

      {result && (
        <div
          className={cn(
            "rounded-lg border p-4 space-y-3",
            confidenceTone === "ok" && "border-tier-nvidia-border/60 bg-tier-nvidia-soft/40",
            confidenceTone === "warn" && "border-warning-critical-border/40 bg-warning-critical-soft/30",
            confidenceTone === "bad" && "border-destructive/40 bg-destructive/5",
          )}
        >
          <div className="flex items-center gap-2">
            {confidenceTone === "ok" ? (
              <ShieldCheck className="h-4 w-4 text-tier-nvidia-foreground" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-warning-critical-foreground" />
            )}
            <span className="text-sm font-medium">
              {confidenceTone === "ok" && "Certificate looks genuine"}
              {confidenceTone === "warn" && "Partial read — please review"}
              {confidenceTone === "bad" && "Low confidence — please type manually"}
            </span>
            <span className="ml-auto text-xs text-muted-foreground">{confidencePct}% confidence</span>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <Row label="Name" value={result.fullName} />
            <Row label="Registration #" value={result.registrationNumber} mono />
            <Row label="Council" value={result.councilBody} />
            <Row label="Year" value={result.registrationYear} />
            <Row label="System" value={result.system} />
            <Row label="Qualification" value={result.qualification} />
            {result.councilState && <Row label="State" value={result.councilState} />}
            {result.specialty && <Row label="Specialty" value={result.specialty} />}
          </div>

          {result.warnings.length > 0 && (
            <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
              {result.warnings.slice(0, 4).map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}

          <p className="text-[11px] text-muted-foreground">
            Auto-filled below — please double-check and edit anything that looks wrong before submitting.
          </p>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 min-w-0">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className={cn("truncate", mono && "font-mono", !value && "text-muted-foreground/60 italic")}>
        {value || "—"}
      </span>
    </div>
  );
}
