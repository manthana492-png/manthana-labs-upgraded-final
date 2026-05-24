import { useEffect, useRef, useState } from "react";
import { Search, Loader2, Tag, X, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface MedicalCode {
  system: "icd10" | "snomed";
  code: string;
  label: string;
  category?: string;
}

export interface CodePickerProps {
  system: "icd10" | "snomed";
  value?: { code?: string; label?: string };
  onSelect: (code: MedicalCode | null) => void;
  className?: string;
}

/**
 * Searchable ICD-10 / SNOMED CT code picker.
 * Calls the `search-medical-codes` edge function with debounced input.
 */
export function CodePicker({ system, value, onSelect, className }: CodePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MedicalCode[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Click outside closes the dropdown.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Debounced search.
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (query.trim().length < 1) {
      setResults([]);
      return;
    }
    setLoading(true);
    debounceRef.current = window.setTimeout(async () => {
      try {
        const { data, error } = await supabase.functions.invoke("search-medical-codes", {
          body: null,
          method: "GET",
          // Edge function reads URL params; pass via headers workaround:
        });
        // Prefer direct fetch with query params.
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/search-medical-codes?system=${system}&q=${encodeURIComponent(query.trim())}&limit=20`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        });
        if (!res.ok) throw error ?? new Error("Search failed");
        const json = (await res.json()) as { results?: MedicalCode[] };
        setResults(json.results ?? []);
        // Suppress unused-data linter
        void data;
      } catch (err) {
        console.warn("code search failed:", err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [query, system, open]);

  const label = system === "icd10" ? "ICD-10" : "SNOMED CT";

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full text-left rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs flex items-center gap-2 hover:bg-accent/40 focus-ring",
        )}
      >
        <Tag className="h-3 w-3 opacity-60 shrink-0" />
        <span className="opacity-60 shrink-0">{label}</span>
        {value?.code ? (
          <>
            <span className="font-mono font-semibold truncate">{value.code}</span>
            {value.label && (
              <span className="opacity-60 truncate hidden sm:inline">· {value.label}</span>
            )}
          </>
        ) : (
          <span className="opacity-50 italic">add code…</span>
        )}
        {value?.code && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onSelect(null); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(null); } }}
            className="ml-auto opacity-50 hover:opacity-100 focus-ring rounded p-0.5"
            aria-label={`Clear ${label} code`}
            title={`Clear ${label} code`}
          >
            <X className="h-3 w-3" />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 right-0 mt-1.5 z-50 rounded-lg border border-border bg-surface-raised shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border bg-surface">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${label} by code or term…`}
                className="h-8 pl-7 text-sm bg-background"
              />
              {loading && (
                <Loader2 className="h-3.5 w-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />
              )}
            </div>
          </div>
          <ul className="max-h-72 overflow-y-auto scrollbar-thin">
            {results.length === 0 && !loading && (
              <li className="px-3 py-4 text-xs text-center text-muted-foreground">
                {query.trim().length === 0
                  ? "Start typing to search…"
                  : "No matches found."}
              </li>
            )}
            {results.map((r) => {
              const isActive = value?.code === r.code;
              return (
                <li key={`${r.system}-${r.code}`}>
                  <button
                    type="button"
                    onClick={() => { onSelect(r); setOpen(false); setQuery(""); }}
                    className={cn(
                      "w-full text-left px-3 py-2 hover:bg-accent/40 flex items-start gap-2 border-b border-border/40 last:border-0",
                      isActive && "bg-accent/40",
                    )}
                  >
                    <span className="font-mono text-[0.7rem] font-semibold mt-0.5 shrink-0">
                      {r.code}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs leading-snug">{r.label}</span>
                      {r.category && (
                        <span className="text-[0.65rem] text-muted-foreground">{r.category}</span>
                      )}
                    </span>
                    {isActive && <Check className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-border bg-surface px-3 py-1.5 flex items-center justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              className="h-7 text-xs"
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
