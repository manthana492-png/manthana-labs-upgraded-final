import { useEffect, useState } from "react";
import {
  ServerCog,
  Send,
  Lock,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  FileType,
  Network,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useDicomEntitlement } from "@/lib/useDicomEntitlement";
import {
  listHospitalConnections,
  listExports,
  pushDicomExport,
  pushFhirReport,
  type HospitalConnection,
  type DicomExportRow,
} from "@/lib/dicom/api";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

interface Props {
  studyId: string;
  isReviewed: boolean;
  className?: string;
}

const KIND_LABEL: Record<DicomExportRow["kind"], string> = {
  sr: "DICOM SR",
  pdf: "Encapsulated PDF",
  sc: "Secondary Capture",
  fhir: "FHIR DiagnosticReport",
};

/**
 * PACS / RIS push panel rendered inside ReportViewer for Pro+ / Enterprise
 * radiologist or hospital users. Other users see a locked teaser linking to
 * Settings → Hospital connection. Hidden from the printable PDF.
 */
export function PacsPushPanel({ studyId, isReviewed, className }: Props) {
  const ent = useDicomEntitlement();
  const [connections, setConnections] = useState<HospitalConnection[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [exports, setExports] = useState<DicomExportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKind, setBusyKind] = useState<string | null>(null);

  useEffect(() => {
    if (!ent.allowed) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [conns, ex] = await Promise.all([
          listHospitalConnections(),
          listExports(studyId),
        ]);
        if (cancelled) return;
        setConnections(conns);
        const firstEnabled = conns.find((c) => c.enabled);
        if (firstEnabled) setSelectedId(firstEnabled.id);
        setExports(ex);
      } catch (err) {
        console.error("[PacsPushPanel] load failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ent.allowed, studyId]);

  const refreshExports = async () => {
    try {
      setExports(await listExports(studyId));
    } catch {
      /* swallow */
    }
  };

  async function handlePush(kind: "sr" | "pdf" | "fhir") {
    if (!selectedId) {
      toast({
        title: "Select a connection",
        description: "Choose a configured PACS / RIS endpoint first.",
        variant: "destructive",
      });
      return;
    }
    setBusyKind(kind);
    try {
      if (kind === "fhir") {
        await pushFhirReport({ studyId, connectionId: selectedId });
        toast({ title: "FHIR report pushed", description: "Sent to RIS endpoint." });
      } else {
        const res = await pushDicomExport({
          studyId,
          connectionId: selectedId,
          kinds: [kind],
        });
        const r = res.exports[0];
        if (r?.status === "success") {
          toast({
            title: `${KIND_LABEL[kind]} delivered`,
            description: `PACS responded ${r.response_code ?? "OK"}.`,
          });
        } else {
          toast({
            title: "Push failed",
            description: r?.error ?? "PACS rejected the object.",
            variant: "destructive",
          });
        }
      }
      await refreshExports();
    } catch (err) {
      toast({
        title: "Push failed",
        description: err instanceof Error ? err.message : "Network error",
        variant: "destructive",
      });
    } finally {
      setBusyKind(null);
    }
  }

  // ── Locked teaser ───────────────────────────────────────────────────────
  if (ent.loading) return null;

  if (!ent.allowed) {
    return (
      <div
        data-pdf-skip="true"
        className={cn(
          "surface-clinical p-4 md:p-5 border border-dashed border-border/70 rounded-xl",
          className,
        )}
      >
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Lock className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-display text-sm font-semibold">
                PACS / RIS bridge
              </h3>
              <span className="text-[10px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
                Pro+ · Enterprise
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Push DICOM SR, encapsulated-PDF and FHIR DiagnosticReport objects
              straight into your PACS/RIS. {ent.reason}
            </p>
            <Button asChild size="sm" variant="outline" className="mt-3">
              <Link to="/app/settings">Configure in Settings</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Active panel ───────────────────────────────────────────────────────
  return (
    <div
      data-pdf-skip="true"
      className={cn("surface-clinical p-4 md:p-5 rounded-xl border border-border", className)}
    >
      <div className="flex items-start gap-3 flex-wrap">
        <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Network className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display text-sm font-semibold">PACS / RIS push</h3>
            {!isReviewed && (
              <span className="text-[10px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30">
                Preliminary
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Deliver this report into your hospital workflow as standards-compliant
            DICOM / FHIR objects. PHI minimised — patient identifiers are limited
            to the local reference you provided.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading connections…
        </div>
      ) : connections.length === 0 ? (
        <div className="mt-4 text-xs text-muted-foreground">
          No PACS/RIS connection configured yet.{" "}
          <Link to="/app/settings" className="text-primary underline underline-offset-2">
            Add one in Settings
          </Link>
          .
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-2">
            <ServerCog className="h-4 w-4 text-muted-foreground shrink-0" />
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="h-9 flex-1 bg-surface border-border text-sm">
                <SelectValue placeholder="Select a connection" />
              </SelectTrigger>
              <SelectContent>
                {connections.map((c) => (
                  <SelectItem key={c.id} value={c.id} disabled={!c.enabled}>
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full",
                          c.verified_at ? "bg-emerald-500" : "bg-muted-foreground/50",
                        )}
                      />
                      {c.name}
                      {!c.enabled && (
                        <span className="text-[10px] text-muted-foreground">(disabled)</span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handlePush("sr")}
              disabled={!selectedId || busyKind !== null}
            >
              {busyKind === "sr" ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <FileText className="h-4 w-4 mr-1.5" />
              )}
              Push DICOM SR
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handlePush("pdf")}
              disabled={!selectedId || busyKind !== null}
            >
              {busyKind === "pdf" ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <FileType className="h-4 w-4 mr-1.5" />
              )}
              Push PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handlePush("fhir")}
              disabled={!selectedId || busyKind !== null}
            >
              {busyKind === "fhir" ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-1.5" />
              )}
              Push FHIR
            </Button>
          </div>
        </>
      )}

      {exports.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground mb-2">
            Recent pushes
          </div>
          <ul className="space-y-1.5 max-h-40 overflow-auto">
            {exports.slice(0, 8).map((ex) => (
              <li
                key={ex.id}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  {ex.status === "success" ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  ) : ex.status === "error" ? (
                    <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                  ) : (
                    <Loader2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                  <span className="truncate">
                    {KIND_LABEL[ex.kind]}
                    {ex.response_code ? ` · ${ex.response_code}` : ""}
                    {ex.error ? ` · ${ex.error}` : ""}
                  </span>
                </span>
                <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                  {new Date(ex.created_at).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
