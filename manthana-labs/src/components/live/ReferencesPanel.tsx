// Authentic web reference list shown on the report (1-4 links).
import { ExternalLink, BookOpen } from "lucide-react";
import type { WebCitation } from "@/lib/types";

interface ReferencesPanelProps {
  citations: WebCitation[];
  className?: string;
}

export function ReferencesPanel({ citations, className }: ReferencesPanelProps) {
  if (!citations || citations.length === 0) return null;

  return (
    <section className={className}>
      <div className="flex items-center gap-2 mb-3">
        <BookOpen className="h-4 w-4 text-tier-hybrid-foreground" />
        <h3 className="font-display text-base tracking-tight">References</h3>
        <span className="text-[0.65rem] text-muted-foreground">
          · {citations.length} authoritative source{citations.length === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="space-y-2">
        {citations.map((c, i) => (
          <li key={i}>
            <a
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg border border-tier-hybrid-border/60 bg-tier-hybrid-soft/50 hover:bg-tier-hybrid-soft transition p-3 focus-ring"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-sm text-tier-hybrid-foreground truncate">
                    {c.title || c.url}
                  </div>
                  {c.snippet && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {c.snippet}
                    </p>
                  )}
                  <div className="text-[0.65rem] text-muted-foreground mt-1.5 flex items-center gap-1.5">
                    {c.source && (
                      <span className="px-1.5 py-0.5 rounded bg-card border border-border font-medium">
                        {c.source}
                      </span>
                    )}
                    <span className="truncate">{new URL(c.url).hostname}</span>
                  </div>
                </div>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-tier-hybrid-foreground/60 mt-0.5" />
              </div>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
