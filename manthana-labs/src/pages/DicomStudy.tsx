import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DicomDropzone } from "@/components/dicom/DicomDropzone";
import { DicomSeriesList } from "@/components/dicom/DicomSeriesList";
import { useDicomEntitlement } from "@/lib/useDicomEntitlement";
import {
  ingestDicomFiles,
  analyzeDicomStudy,
  inboundStowUrl,
} from "@/lib/dicom/api";
import { listHospitalConnections } from "@/lib/dicom/api";
import type { DicomTagPreview } from "@/lib/dicom/parse";
import {
  ShieldCheck,
  Lock,
  ArrowRight,
  Hospital,
  Crown,
  Copy,
  Check,
  Loader2,
  Sparkles,
  Cpu,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

const DicomStudy = () => {
  const navigate = useNavigate();
  const ent = useDicomEntitlement();
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<DicomTagPreview[]>([]);
  const [patientRef, setPatientRef] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [stowUrl, setStowUrl] = useState<string | null>(null);

  const validCount = previews.filter((p) => p.isDicom).length;

  // Fetch first hospital connection's inbound URL (display in unlock view).
  useState(() => {
    if (!ent.allowed) return;
    listHospitalConnections()
      .then((conns) => {
        if (conns[0]) setStowUrl(inboundStowUrl(conns[0].inbound_token));
      })
      .catch(() => {
        /* no-op */
      });
  });

  const onFiles = (fs: File[], pv: DicomTagPreview[]) => {
    setFiles((prev) => [...prev, ...fs]);
    setPreviews((prev) => [...prev, ...pv]);
  };

  const removeFile = (name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name));
    setPreviews((prev) => prev.filter((p) => p.fileName !== name));
  };

  const submit = async () => {
    const valid = files.filter((f, i) => previews[i]?.isDicom);
    if (valid.length === 0) {
      toast.error("Add at least one valid DICOM file.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await ingestDicomFiles({
        files: valid,
        patientRefShort: patientRef || undefined,
      });
      toast.success(`Ingested ${res.acceptedFiles} instance(s) — analysing now`);
      await analyzeDicomStudy(res.studyId);
      navigate(`/app/study/${res.studyId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ingest failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell>
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden surface-clinical p-6 md:p-10"
      >
        <div className="absolute inset-0 bg-aurora opacity-80 pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground mb-3">
            <Hospital className="h-3.5 w-3.5" />
            Hospital · Radiologist
            <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[0.65rem] text-primary">
              <Crown className="h-3 w-3" /> Pro+ / Enterprise
            </span>
          </div>
          <h1 className="font-display text-3xl md:text-5xl tracking-tight text-balance">
            Direct DICOM upload &amp; PACS bridge
          </h1>
          <p className="mt-2 text-muted-foreground text-pretty max-w-2xl">
            Drop a study from your modality workstation. We parse tags, deidentify
            PHI, run a 5-point structured radiology read, and push results back
            into your PACS as a DICOM SR + encapsulated PDF — no copy-paste, no
            workflow break.
          </p>

          <div className="mt-6 grid sm:grid-cols-3 gap-3 text-sm">
            <Capability
              icon={<ShieldCheck className="h-4 w-4 text-primary" />}
              title="DPDP-aligned"
              body="Patient identifiers stripped before any AI call. Audit-logged end-to-end."
            />
            <Capability
              icon={<Cpu className="h-4 w-4 text-primary" />}
              title="5-point structured read"
              body="Adequacy · Primary · Secondary · Differentials · Recommendation."
            />
            <Capability
              icon={<Sparkles className="h-4 w-4 text-primary" />}
              title="DICOM SR + FHIR"
              body="Reports return to PACS via STOW-RS, and to your RIS as DiagnosticReport."
            />
          </div>
        </div>
      </motion.section>

      {/* ── Locked teaser for ineligible users ── */}
      {!ent.allowed && !ent.loading && (
        <section className="surface-clinical p-6 md:p-8 mt-8 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-tier-nvidia/5 pointer-events-none" />
          <div className="relative grid md:grid-cols-[1fr_auto] gap-6 items-center">
            <div>
              <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                <Lock className="h-3.5 w-3.5" /> Locked feature preview
              </div>
              <h2 className="font-display text-2xl tracking-tight mt-2">
                {ent.reason}
              </h2>
              <p className="text-muted-foreground mt-1.5 max-w-xl">
                The DICOM bridge is built for hospitals, nursing homes, and
                radiologists who need studies to flow directly between their PACS
                and our AI. General-practice flows on Free / Pro stay exactly as
                they are — multi-modality, compare mode, branding, and live
                capture all included.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => navigate("/pricing")} className="bg-primary hover:bg-primary/90">
                  See Pro+ pricing <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
                <Link
                  to="/app/settings"
                  className="text-sm font-medium text-primary px-3 py-2 rounded-lg hover:bg-accent/50 transition focus-ring"
                >
                  Update my role →
                </Link>
              </div>
            </div>
            <div className="hidden md:block opacity-70 pointer-events-none">
              <div className="rounded-2xl border border-border bg-surface-raised/60 p-5 backdrop-blur-sm">
                <div className="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground mb-2">
                  What unlocks
                </div>
                <ul className="text-sm space-y-1.5">
                  <UnlockItem>Drag-and-drop DICOM ingest</UnlockItem>
                  <UnlockItem>5-point structured radiology read</UnlockItem>
                  <UnlockItem>DICOM SR + encapsulated PDF push</UnlockItem>
                  <UnlockItem>FHIR DiagnosticReport to your RIS</UnlockItem>
                  <UnlockItem>Inbound STOW-RS auto-routing</UnlockItem>
                </ul>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Live ingest + auto-routing setup (allowed users) ── */}
      {ent.allowed && (
        <>
          <section className="surface-clinical p-6 md:p-8 mt-8">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="font-display text-xl tracking-tight">
                Manual upload
              </h2>
              <span className="text-xs text-muted-foreground">
                {validCount > 0 && `${validCount} instance${validCount === 1 ? "" : "s"} ready`}
              </span>
            </div>

            <DicomDropzone onFiles={onFiles} disabled={submitting} />

            {previews.length > 0 && (
              <div className="mt-5 space-y-4">
                <DicomSeriesList previews={previews} onRemove={removeFile} />

                <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end pt-2">
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">
                      Patient reference (initials or short tag — optional)
                    </label>
                    <Input
                      value={patientRef}
                      onChange={(e) => setPatientRef(e.target.value.slice(0, 40))}
                      placeholder="e.g. AB-2841"
                      className="h-11 bg-background"
                    />
                  </div>
                  <Button
                    size="lg"
                    onClick={submit}
                    disabled={submitting || validCount === 0}
                    className="h-11 bg-primary hover:bg-primary/90"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                        Ingesting…
                      </>
                    ) : (
                      <>
                        Ingest &amp; analyse
                        <ArrowRight className="h-4 w-4 ml-1.5" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </section>

          <section className="surface-clinical p-6 md:p-8 mt-6">
            <h2 className="font-display text-xl tracking-tight">
              Auto-route from your PACS
            </h2>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
              Configure your hospital's PACS to forward studies via DICOMweb
              STOW-RS. Studies appear here automatically — no upload step.
            </p>
            {stowUrl ? (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-background/60 px-3 py-2.5">
                <code className="text-xs font-mono break-all flex-1">{stowUrl}</code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    void navigator.clipboard.writeText(stowUrl);
                    setTokenCopied(true);
                    setTimeout(() => setTokenCopied(false), 1800);
                  }}
                >
                  {tokenCopied ? (
                    <Check className="h-4 w-4 text-tier-nvidia-foreground" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ) : (
              <div className="mt-4 text-sm text-muted-foreground">
                Add a Hospital Connection in{" "}
                <Link to="/app/settings" className="text-primary hover:underline">
                  Settings
                </Link>{" "}
                to generate your auto-routing URL.
              </div>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
};

function Capability({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised/60 p-3.5">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {icon} {title}
      </div>
      <p className="mt-1.5 text-foreground/90 text-[0.85rem] leading-snug">
        {body}
      </p>
    </div>
  );
}

function UnlockItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <Check className="h-3.5 w-3.5 text-primary shrink-0" />
      <span>{children}</span>
    </li>
  );
}

export default DicomStudy;
