import { useNavigate, Link } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { WorkflowBadge } from "@/components/tier/WorkflowBadge";
import { useAuth, useStudies } from "@/lib/store";
import {
  ArrowRight,
  Sparkles,
  Upload,
  FileText,
  Clock,
  Radio,
  ScanLine,
  Microscope,
  Activity,
  Camera,
  Layers,
  ArrowLeftRight,
} from "lucide-react";
import { motion } from "framer-motion";
import { MODALITIES } from "@/lib/modalities";
import { laneForModality, isLocked, type Lane } from "@/lib/catalog";
import { DICOM_FEATURES_ENABLED } from "@/lib/featureFlags";

const Studio = () => {
  const navigate = useNavigate();
  const { doctor } = useAuth();
  const studies = useStudies((s) => s.studies);
  const recent = studies.slice(0, 4);
  const awaiting = studies.filter((s) => s.status === "awaiting_review").length;

  const counts = MODALITIES.reduce(
    (acc, m) => {
      if (isLocked(m)) return acc; // hide locked from public counts
      acc[laneForModality(m)] = (acc[laneForModality(m)] ?? 0) + 1;
      return acc;
    },
    { imaging: 0, live: 0, pathology: 0, ecg: 0, photo: 0 } as Record<Lane, number>,
  );

  return (
    <AppShell>
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden surface-clinical p-6 md:p-10"
      >
        <div className="absolute inset-0 bg-aurora opacity-80 pointer-events-none" />
        <div className="relative grid md:grid-cols-[1fr_auto] gap-6 items-end">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-3">
              Welcome back
            </div>
            <h1 className="font-display text-3xl md:text-5xl tracking-tight text-balance">
              Good to see you, {doctor?.fullName.split(" ").slice(-1)[0]}.
            </h1>
            <p className="mt-2 text-muted-foreground text-pretty max-w-xl">
              Upload a study or capture live — Manthana‑Labs detects the modality and
              prepares an AI-assisted report for your review.
            </p>

            <div className="mt-7 flex flex-col sm:flex-row gap-3">
              <Button
                size="lg"
                onClick={() => navigate("/app/new")}
                className="h-12 px-6 text-base bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
              >
                <Upload className="h-4 w-4 mr-2" />
                Start a new study
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
              <Button
                size="lg"
                onClick={() => navigate("/app/live")}
                className="h-12 px-6 text-base bg-tier-hybrid hover:bg-tier-hybrid/90 text-white shadow-lg shadow-tier-hybrid/20"
              >
                <Radio className="h-4 w-4 mr-2" />
                Live capture
              </Button>
              <Button
                size="lg"
                onClick={() => navigate("/app/multi")}
                className="h-12 px-6 text-base bg-gradient-to-r from-primary to-tier-nvidia text-primary-foreground shadow-lg shadow-primary/20"
              >
                <Layers className="h-4 w-4 mr-2" />
                Multi-modality patient
                <span className="ml-2 text-[0.6rem] uppercase tracking-wider opacity-90 border border-primary-foreground/30 rounded px-1.5 py-0.5">
                  Pro
                </span>
              </Button>
              <Button
                size="lg"
                onClick={() => navigate("/app/compare")}
                className="h-12 px-6 text-base bg-gradient-to-r from-tier-hybrid to-primary text-white shadow-lg shadow-tier-hybrid/20"
              >
                <ArrowLeftRight className="h-4 w-4 mr-2" />
                Compare mode
                <span className="ml-2 text-[0.6rem] uppercase tracking-wider opacity-90 border border-white/30 rounded px-1.5 py-0.5">
                  Pro
                </span>
              </Button>
              {DICOM_FEATURES_ENABLED && (
                <Button
                  size="lg"
                  onClick={() => navigate("/app/dicom")}
                  className="h-12 px-6 text-base bg-gradient-to-r from-tier-nvidia to-primary text-primary-foreground shadow-lg shadow-primary/20"
                >
                  DICOM &amp; PACS bridge
                </Button>
              )}
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate("/app/new?advanced=1")}
                className="h-12 px-6 text-base border-border bg-surface-raised/60"
              >
                Advanced — pick modality
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2.5 md:min-w-[340px]">
            <div className="grid grid-cols-2 gap-2.5">
              <BigTile
                tone="standard"
                icon={<ScanLine className="h-4 w-4" strokeWidth={2.4} />}
                count={counts.imaging}
                label="Imaging"
                sub="X-Ray · CT · MRI · US"
              />
              <BigTile
                tone="live"
                icon={<Radio className="h-4 w-4" strokeWidth={2.4} />}
                count={counts.live}
                label="Live Capture"
                sub="Bedside · real-time"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <SmallChip
                icon={<Microscope className="h-3 w-3" strokeWidth={2.6} />}
                count={counts.pathology}
                label="Pathology"
              />
              <SmallChip
                icon={<Activity className="h-3 w-3" strokeWidth={2.6} />}
                count={counts.ecg}
                label="ECG"
              />
              <SmallChip
                icon={<Camera className="h-3 w-3" strokeWidth={2.6} />}
                count={counts.photo}
                label="Photo"
              />
            </div>
          </div>
        </div>
      </motion.section>

      <div className="mt-8 grid lg:grid-cols-3 gap-4 md:gap-6">
        <div className="lg:col-span-2 surface-clinical p-5 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Recent</div>
              <h2 className="font-display text-xl tracking-tight mt-0.5">Your studies</h2>
            </div>
            <Link
              to="/app/history"
              className="text-sm text-primary hover:underline focus-ring rounded-md"
            >
              View worklist →
            </Link>
          </div>

          {recent.length === 0 ? (
            <EmptyState onStart={() => navigate("/app/new")} />
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/app/study/${s.id}`}
                    className="flex items-center justify-between gap-4 py-3.5 hover:bg-accent/40 -mx-2 px-2 rounded-lg transition focus-ring"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{s.modality.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                        <Clock className="h-3 w-3" />
                        {new Date(s.createdAt).toLocaleString("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                        <span>·</span>
                        <span>{s.imagesCount} img · {s.videosCount} vid</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusPill status={s.status} />
                      <WorkflowBadge modality={s.modality} size="sm" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-4 md:space-y-6">
          <div className="surface-clinical p-5 md:p-6">
            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Awaiting your sign-off
            </div>
            <div className="mt-2 font-display text-5xl tracking-tight">{awaiting}</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Reports ready for review and impression.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4 w-full"
              onClick={() => navigate("/app/history?filter=awaiting_review")}
            >
              <FileText className="h-4 w-4 mr-2" />
              Open review queue
            </Button>
          </div>

          <div className="surface-clinical p-5 md:p-6 bg-gradient-clinical text-primary-foreground">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] opacity-80">
              <Sparkles className="h-3.5 w-3.5" /> Tip
            </div>
            <p className="mt-2 font-display text-lg leading-snug tracking-tight">
              Auto-detect handles 92% of incoming studies. Use Advanced when the
              modality matters more than the time saved.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
};

function BigTile({
  tone,
  icon,
  count,
  label,
  sub,
}: {
  tone: "standard" | "live";
  icon: React.ReactNode;
  count: number;
  label: string;
  sub: string;
}) {
  const cls =
    tone === "live"
      ? "bg-tier-hybrid-soft border-tier-hybrid-border/60 text-tier-hybrid-foreground"
      : "bg-accent border-border text-accent-foreground";
  return (
    <div className={"rounded-xl p-3.5 border " + cls}>
      <div className="flex items-center gap-1.5 text-[0.65rem] font-medium uppercase tracking-wider opacity-90">
        {icon} {label}
      </div>
      <div className="font-display text-3xl md:text-4xl tracking-tight mt-1">{count}</div>
      <div className="text-[0.7rem] opacity-80 leading-tight">{sub}</div>
    </div>
  );
}

function SmallChip({
  icon,
  count,
  label,
}: {
  icon: React.ReactNode;
  count: number;
  label: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/60 px-2.5 py-1.5">
      <div className="flex items-center gap-1.5 text-[0.6rem] font-medium uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className="font-display text-base tracking-tight mt-0.5 text-foreground">{count}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    delivered: { label: "Delivered", cls: "bg-tier-nvidia-soft text-tier-nvidia-foreground border-tier-nvidia-border/60" },
    awaiting_review: { label: "Awaiting review", cls: "bg-warning-critical-soft text-warning-critical-foreground border-warning-critical-border/60" },
    analyzing: { label: "Analyzing", cls: "bg-accent text-accent-foreground border-border" },
    questionnaire: { label: "In progress", cls: "bg-muted text-muted-foreground border-border" },
    uploading: { label: "Uploading", cls: "bg-muted text-muted-foreground border-border" },
    draft: { label: "Draft", cls: "bg-muted text-muted-foreground border-border" },
  };
  const m = map[status] ?? map.draft;
  return (
    <span className={"text-[0.65rem] px-2 py-0.5 rounded-full border font-medium " + m.cls}>
      {m.label}
    </span>
  );
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="text-center py-10 px-4">
      <div className="mx-auto h-14 w-14 rounded-2xl bg-accent flex items-center justify-center mb-4">
        <Upload className="h-6 w-6 text-primary" strokeWidth={2.2} />
      </div>
      <h3 className="font-display text-xl tracking-tight">No studies yet</h3>
      <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">
        Upload your first medical image — Manthana‑Labs will detect the modality
        before any analysis runs.
      </p>
      <Button onClick={onStart} className="mt-5 bg-primary hover:bg-primary/90">
        Start a new study <ArrowRight className="ml-1.5 h-4 w-4" />
      </Button>
    </div>
  );
}

export default Studio;
