import { useMemo, useState } from "react";
import Fuse from "fuse.js";
import { CATEGORIES, MODALITIES } from "@/lib/modalities";
import { WorkflowBadge } from "@/components/tier/WorkflowBadge";
import { Input } from "@/components/ui/input";
import {
  Search,
  ScanLine,
  Radio,
  Microscope,
  Activity,
  Camera,
  Lock,
  LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { Modality, ModalityCategory } from "@/lib/types";
import { laneForModality, isLocked, lockReasonForModality, type Lane } from "@/lib/catalog";

interface Props {
  onPick: (m: Modality) => void;
  selected?: string;
}

const LANE_TABS: Array<{ id: Lane | "all"; label: string; icon: React.ReactNode }> = [
  { id: "all", label: "All", icon: <LayoutGrid className="h-3.5 w-3.5" /> },
  { id: "imaging", label: "Imaging", icon: <ScanLine className="h-3.5 w-3.5" /> },
  { id: "live", label: "Live Capture", icon: <Radio className="h-3.5 w-3.5" /> },
  { id: "pathology", label: "Pathology", icon: <Microscope className="h-3.5 w-3.5" /> },
  { id: "ecg", label: "ECG", icon: <Activity className="h-3.5 w-3.5" /> },
  { id: "photo", label: "Photo", icon: <Camera className="h-3.5 w-3.5" /> },
];

export function ModalityCatalog({ onPick, selected }: Props) {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<ModalityCategory | "All">("All");
  const [tab, setTab] = useState<Lane | "all">("all");

  const fuse = useMemo(
    () =>
      new Fuse(MODALITIES, {
        keys: ["label", "category", "slug", "blurb"],
        threshold: 0.32,
        ignoreLocation: true,
      }),
    [],
  );

  const filtered = useMemo(() => {
    let list: Modality[] = q.trim() ? fuse.search(q.trim()).map((r) => r.item) : MODALITIES;
    if (cat !== "All") list = list.filter((m) => m.category === cat);
    if (tab !== "all") list = list.filter((m) => laneForModality(m) === tab);
    return list;
  }, [q, cat, tab, fuse]);

  const counts = useMemo(() => {
    const c: Record<Lane | "all", number> = {
      all: MODALITIES.length,
      imaging: 0,
      live: 0,
      pathology: 0,
      ecg: 0,
      photo: 0,
    };
    for (const m of MODALITIES) c[laneForModality(m)] += 1;
    return c;
  }, []);

  const handlePick = (m: Modality) => {
    if (isLocked(m)) {
      toast({
        title: "Coming soon",
        description: "3D volumetric scans are launching shortly. Standard 2D views remain available today.",
      });
      return;
    }
    onPick(m);
  };

  return (
    <div className="space-y-4">
      {/* Lane tabs */}
      <div className="flex flex-wrap gap-2">
        {LANE_TABS.map((t) => (
          <CatalogTab
            key={t.id}
            active={tab === t.id}
            onClick={() => setTab(t.id)}
            icon={t.icon}
            label={t.label}
            count={counts[t.id]}
          />
        ))}
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${MODALITIES.length} modalities — e.g. chest X-ray, fundus, fMRI…`}
            className="pl-9 h-11 bg-background"
          />
        </div>
      </div>

      {/* Category sub-chips (region) */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-thin -mx-1 px-1 pb-1">
        {(["All", ...CATEGORIES] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={cn(
              "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition focus-ring",
              cat === c
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No modalities match &ldquo;{q}&rdquo;.
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {filtered.map((m) => {
            const isSelected = selected === m.slug;
            const locked = isLocked(m);
            const reason = lockReasonForModality(m);
            const lane = laneForModality(m);
            const isLive = lane === "live";
            return (
              <li key={m.slug}>
                <button
                  type="button"
                  onClick={() => handlePick(m)}
                  aria-disabled={locked || undefined}
                  title={locked ? "Coming soon — 3D volumetric viewer" : undefined}
                  className={cn(
                    "w-full text-left rounded-xl border p-4 transition-all duration-200 focus-ring relative overflow-hidden",
                    locked
                      ? "bg-muted/40 border-border cursor-not-allowed opacity-70"
                      : "bg-surface-raised",
                    !locked && isSelected
                      ? "border-primary ring-2 ring-primary/20 shadow-md"
                      : !locked
                      ? "border-border hover:border-primary/40 hover:shadow-sm"
                      : "",
                  )}
                >
                  <span
                    className={cn(
                      "absolute left-0 top-0 bottom-0 w-0.5",
                      locked
                        ? "bg-muted-foreground/30"
                        : isLive
                        ? "bg-tier-hybrid"
                        : "bg-primary",
                    )}
                  />
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground font-medium">
                      {m.category}
                    </span>
                    <WorkflowBadge
                      kind={locked ? "locked" : isLive ? "live" : "standard"}
                      size="sm"
                    />
                  </div>
                  <div
                    className={cn(
                      "font-medium text-[0.95rem] leading-snug pr-1",
                      locked && "text-muted-foreground",
                    )}
                  >
                    {m.label}
                  </div>
                  <div className="font-mono text-[0.65rem] text-muted-foreground mt-1.5 truncate">
                    {m.slug}
                  </div>
                  {locked && (
                    <div className="mt-2 inline-flex items-center gap-1 text-[0.65rem] text-muted-foreground font-medium">
                      <Lock className="h-3 w-3" strokeWidth={2.6} />
                      {reason === "coming_soon_3d" ? "3D — Coming Soon" : "Coming Soon"}
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CatalogTab({
  active,
  onClick,
  label,
  count,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium border transition focus-ring",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background text-muted-foreground border-border hover:text-foreground",
      )}
    >
      {icon}
      {label}
      <span className={cn("text-[0.65rem] font-mono opacity-80", active ? "" : "text-muted-foreground")}>
        {count}
      </span>
    </button>
  );
}
