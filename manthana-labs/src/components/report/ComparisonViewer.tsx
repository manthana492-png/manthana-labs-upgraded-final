import { useState } from "react";
import { Layers, ArrowLeftRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ModalityViewer } from "@/components/viewers/ModalityViewer";
import { useStudies } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Study } from "@/lib/types";

/**
 * ComparisonViewer
 * ─────────────────────────────────────────────────────────────────────
 * Side-by-side prior vs current viewer — critical for oncology
 * follow-up, MS lesion tracking, nodule growth, and post-op evaluation.
 *
 * Lists all the doctor's *other* studies of the same modality category
 * as candidate priors.
 */
export function ComparisonViewer({ current }: { current: Study }) {
  const allStudies = useStudies((s) => s.studies);
  const candidates = allStudies.filter(
    (s) =>
      s.id !== current.id &&
      s.modality.category === current.modality.category &&
      (s.previewAssets?.length ?? 0) > 0,
  );

  const [priorId, setPriorId] = useState<string | undefined>(undefined);
  const prior = candidates.find((s) => s.id === priorId);

  if (candidates.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface p-5 text-sm text-muted-foreground flex items-start gap-3">
        <Layers className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
        <div>
          <div className="font-medium text-foreground">Comparison mode unavailable</div>
          <div className="mt-0.5">
            No prior {current.modality.category} studies found for this account. Once you upload a
            second study of the same category, you can use comparison mode here.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-surface flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <ArrowLeftRight className="h-4 w-4 text-primary shrink-0" />
          <div className="min-w-0">
            <div className="text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">
              Comparison mode
            </div>
            <div className="text-sm font-medium">Prior vs current</div>
          </div>
        </div>
        <div className="flex items-center gap-2 min-w-0 w-full sm:w-auto">
          <Select value={priorId} onValueChange={setPriorId}>
            <SelectTrigger className="h-9 min-w-[14rem] flex-1">
              <SelectValue placeholder={`Pick a prior ${current.modality.category} study…`} />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <span className="truncate">
                    {s.modality.label} ·{" "}
                    {new Date(s.createdAt).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "2-digit",
                    })}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {priorId && (
            <Button size="icon" variant="ghost" onClick={() => setPriorId(undefined)} aria-label="Clear prior">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border">
        <Pane label="Prior" subtitle={prior ? new Date(prior.createdAt).toLocaleDateString("en-IN") : "Not selected"}>
          {prior ? (
            <ModalityViewer modality={prior.modality} assets={prior.previewAssets ?? []} />
          ) : (
            <div className="h-full min-h-[280px] flex items-center justify-center text-sm text-muted-foreground p-6 text-center">
              Pick a prior study above to compare against the current acquisition.
            </div>
          )}
        </Pane>
        <Pane label="Current" subtitle={new Date(current.createdAt).toLocaleDateString("en-IN")} highlight>
          <ModalityViewer modality={current.modality} assets={current.previewAssets ?? []} />
        </Pane>
      </div>
    </div>
  );
}

function Pane({
  label,
  subtitle,
  highlight,
  children,
}: {
  label: string;
  subtitle: string;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface-raised">
      <div
        className={cn(
          "px-3 py-1.5 text-[0.65rem] uppercase tracking-[0.14em] font-mono flex items-center justify-between",
          highlight ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground",
        )}
      >
        <span>{label}</span>
        <span className="opacity-80 normal-case">{subtitle}</span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}
