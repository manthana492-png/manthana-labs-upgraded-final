import { Check, Palette } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme, type ThemeMeta } from "@/lib/theme";
import { cn } from "@/lib/utils";

interface ThemeSwitcherProps {
  /** Compact icon-only trigger for headers (default). */
  compact?: boolean;
  className?: string;
}

export function ThemeSwitcher({ compact = true, className }: ThemeSwitcherProps) {
  const { theme, setTheme, themes } = useTheme();
  const active = themes.find((t) => t.id === theme) ?? themes[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Choose theme"
        className={cn(
          "focus-ring inline-flex items-center gap-2 rounded-lg border border-border/70 bg-surface-raised px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm transition hover:bg-accent/40",
          className,
        )}
      >
        <Palette className="h-4 w-4 text-muted-foreground" strokeWidth={2.2} />
        {!compact && <span>{active.label}</span>}
        <span
          aria-hidden
          className="h-3.5 w-3.5 rounded-full border border-border/60 shadow-inner"
          style={{
            background: `linear-gradient(135deg, ${active.swatch.accent} 0%, ${active.swatch.bg} 60%, ${active.swatch.fg} 100%)`,
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-1.5">
        <DropdownMenuLabel className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">
          Appearance
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="grid gap-1">
          {themes.map((t) => (
            <ThemeOption
              key={t.id}
              meta={t}
              active={t.id === theme}
              onSelect={() => setTheme(t.id)}
            />
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThemeOption({
  meta,
  active,
  onSelect,
}: {
  meta: ThemeMeta;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "focus-ring group flex w-full items-start gap-3 rounded-md p-2 text-left transition",
        active ? "bg-accent/60" : "hover:bg-accent/30",
      )}
    >
      {/* Live preview chip — uses real bg + fg + accent so user sees contrast */}
      <div
        aria-hidden
        className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md border border-border/60 shadow-sm"
        style={{ background: meta.swatch.bg }}
      >
        <div
          className="absolute inset-x-1 top-1 h-1.5 rounded-sm"
          style={{ background: meta.swatch.accent }}
        />
        <div
          className="absolute inset-x-1 bottom-1.5 h-1 rounded-sm"
          style={{ background: meta.swatch.fg, opacity: 0.85 }}
        />
        <div
          className="absolute inset-x-1 bottom-3.5 h-0.5 rounded-sm"
          style={{ background: meta.swatch.fg, opacity: 0.45 }}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="truncate text-sm font-medium text-foreground">{meta.label}</div>
          {active && <Check className="h-4 w-4 text-primary shrink-0" strokeWidth={2.4} />}
        </div>
        <p className="mt-0.5 text-[0.72rem] leading-snug text-muted-foreground">
          {meta.description}
        </p>
      </div>
    </button>
  );
}
