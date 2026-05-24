import { Link, useSearchParams } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { TierBadge } from "@/components/tier/TierBadge";
import { Button } from "@/components/ui/button";
import { useStudies } from "@/lib/store";
import { Clock, FileText, Plus } from "lucide-react";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";

const Worklist = () => {
  const [params] = useSearchParams();
  const studies = useStudies((s) => s.studies);
  const [filter, setFilter] = useState<string>(params.get("filter") ?? "all");

  const filtered = useMemo(() => {
    if (filter === "all") return studies;
    if (filter === "live") return studies.filter((s) => s.modality.tier === "H");
    if (filter === "standard") return studies.filter((s) => s.modality.tier !== "H");
    return studies.filter((s) => s.status === filter);
  }, [studies, filter]);

  return (
    <AppShell>
      <div className="flex items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-3xl md:text-4xl tracking-tight">Worklist</h1>
          <p className="mt-1 text-muted-foreground">All your studies, newest first.</p>
        </div>
        <Button asChild className="bg-primary hover:bg-primary/90">
          <Link to="/app/new"><Plus className="h-4 w-4 mr-1.5" /> New study</Link>
        </Button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-2 mb-4">
        {[
          { k: "all", l: "All" },
          { k: "awaiting_review", l: "Awaiting review" },
          { k: "delivered", l: "Delivered" },
          { k: "standard", l: "Standard" },
          { k: "live", l: "Live" },
        ].map((f) => (
          <button
            key={f.k}
            onClick={() => setFilter(f.k)}
            className={cn(
              "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition",
              filter === f.k
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {f.l}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="surface-clinical p-12 text-center">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-accent flex items-center justify-center mb-4">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <h3 className="font-display text-xl">No studies match this filter</h3>
          <p className="mt-1 text-sm text-muted-foreground">Start a new study to populate your worklist.</p>
          <Button asChild className="mt-5 bg-primary hover:bg-primary/90">
            <Link to="/app/new"><Plus className="h-4 w-4 mr-1.5" /> New study</Link>
          </Button>
        </div>
      ) : (
        <ul className="surface-clinical divide-y divide-border overflow-hidden">
          {filtered.map((s) => (
            <li key={s.id}>
              <Link to={`/app/study/${s.id}`} className="flex items-center justify-between gap-4 p-4 md:p-5 hover:bg-accent/40 transition">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{s.modality.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                    <span className="font-mono">{s.id}</span>
                    <span>·</span>
                    <Clock className="h-3 w-3" />
                    {new Date(s.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {s.status === "awaiting_review" && (
                    <span className="text-[0.65rem] px-2 py-0.5 rounded-full bg-warning-critical-soft text-warning-critical-foreground border border-warning-critical-border/60 font-medium">
                      Awaiting review
                    </span>
                  )}
                  {s.status === "delivered" && (
                    <span className="text-[0.65rem] px-2 py-0.5 rounded-full bg-tier-nvidia-soft text-tier-nvidia-foreground border border-tier-nvidia-border/60 font-medium">
                      Delivered
                    </span>
                  )}
                  <TierBadge tier={s.modality.tier} size="sm" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
};

export default Worklist;
