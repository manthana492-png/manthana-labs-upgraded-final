import { Trash2, FileText, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { groupBySeries, type DicomTagPreview } from "@/lib/dicom/parse";

interface Props {
  previews: DicomTagPreview[];
  onRemove: (fileName: string) => void;
}

/** Series-grouped preview of the queued DICOM files (before upload). */
export function DicomSeriesList({ previews, onRemove }: Props) {
  if (previews.length === 0) return null;
  const groups = groupBySeries(previews);
  const invalid = previews.filter((p) => !p.isDicom);

  return (
    <div className="space-y-3">
      {invalid.length > 0 && (
        <div className="rounded-lg border border-warning-critical-border/40 bg-warning-critical-soft/40 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium text-warning-critical-foreground">
            <AlertTriangle className="h-4 w-4" />
            {invalid.length} file{invalid.length === 1 ? "" : "s"} not recognised as DICOM
          </div>
          <ul className="mt-1.5 text-xs text-muted-foreground list-disc pl-5">
            {invalid.slice(0, 5).map((p) => (
              <li key={p.fileName}>
                {p.fileName} — {p.error ?? "unknown format"}
              </li>
            ))}
            {invalid.length > 5 && <li>…and {invalid.length - 5} more</li>}
          </ul>
        </div>
      )}

      {groups
        .filter((g) => g.files.some((f) => f.isDicom))
        .map((g) => {
          const sample = g.files.find((f) => f.isDicom) ?? g.files[0];
          const totalBytes = g.files.reduce((acc, f) => acc + f.size, 0);
          return (
            <div
              key={g.seriesUID}
              className="surface-clinical p-4 flex items-start gap-3"
            >
              <div className="h-10 w-10 rounded-lg bg-primary/10 grid place-items-center shrink-0">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">
                    {sample.modality ?? "DICOM"} · {sample.bodyPartExamined ?? "—"}
                  </span>
                  <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground border border-border rounded px-1.5 py-0.5">
                    {g.files.length} instance{g.files.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1 font-mono break-all">
                  Series UID: {g.seriesUID.slice(0, 36)}…
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Patient {sample.patientIdHash ? `#${sample.patientIdHash}` : "—"}{" "}
                  · {(totalBytes / (1024 * 1024)).toFixed(1)} MB
                  {sample.rows && sample.cols && (
                    <>
                      {" "}
                      · {sample.cols}×{sample.rows}px
                    </>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => g.files.forEach((f) => onRemove(f.fileName))}
                className="text-muted-foreground hover:text-warning-critical-foreground"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
    </div>
  );
}
