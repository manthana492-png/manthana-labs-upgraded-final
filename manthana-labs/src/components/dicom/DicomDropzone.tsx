import { useCallback, useRef, useState } from "react";
import { Upload, FileArchive, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { previewDicomFile, type DicomTagPreview } from "@/lib/dicom/parse";

interface Props {
  onFiles: (files: File[], previews: DicomTagPreview[]) => void;
  disabled?: boolean;
}

/** Drag/drop or pick `.dcm` files. Parses tags client-side for instant feedback. */
export function DicomDropzone({ onFiles, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);
  const [parsing, setParsing] = useState(false);

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;
      setParsing(true);
      try {
        const previews = await Promise.all(files.map((f) => previewDicomFile(f)));
        onFiles(files, previews);
      } finally {
        setParsing(false);
      }
    },
    [onFiles],
  );

  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setHover(true);
        }}
        onDragLeave={() => setHover(false)}
        onDrop={(e) => {
          e.preventDefault();
          setHover(false);
          if (disabled) return;
          void handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "w-full rounded-2xl border-2 border-dashed p-10 text-left transition focus-ring",
          "flex flex-col items-center justify-center gap-3 text-center",
          hover
            ? "border-primary bg-primary/5"
            : "border-border bg-surface-raised/40 hover:bg-surface-raised/60",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      >
        <div className="h-14 w-14 rounded-2xl bg-primary/10 grid place-items-center">
          {parsing ? (
            <Loader2 className="h-6 w-6 text-primary animate-spin" />
          ) : (
            <Upload className="h-6 w-6 text-primary" strokeWidth={2.2} />
          )}
        </div>
        <div className="font-display text-lg tracking-tight">
          Drop DICOM files here
        </div>
        <p className="text-sm text-muted-foreground max-w-md">
          Drag a folder of <code>.dcm</code> instances exported from your PACS or
          modality workstation. We parse tags locally before any upload — your
          file stays on this device until you click Analyse.
        </p>
        <div className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground inline-flex items-center gap-2">
          <FileArchive className="h-3 w-3" /> CT · MR · CR · DX · US · MG · NM · PT
        </div>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".dcm,application/dicom"
        className="sr-only"
        onChange={(e) => {
          if (e.target.files) void handleFiles(e.target.files);
        }}
      />
    </div>
  );
}
