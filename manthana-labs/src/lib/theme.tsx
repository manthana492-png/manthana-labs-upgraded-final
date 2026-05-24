import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeId = "clinical" | "modern-clinic" | "midnight" | "scifi";

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  description: string;
  /** Preview swatches (bg, fg, accent) — pure CSS color strings */
  swatch: { bg: string; fg: string; accent: string };
}

export const THEMES: ThemeMeta[] = [
  {
    id: "modern-clinic",
    label: "Modern Clinic (default)",
    description: "Crisp white with sky-blue — bright, clean, contemporary.",
    swatch: { bg: "hsl(210 40% 99%)", fg: "hsl(215 40% 12%)", accent: "hsl(211 92% 42%)" },
  },
  {
    id: "clinical",
    label: "Clinical",
    description: "Warm clinical paper with deep teal — calm, editorial.",
    swatch: { bg: "hsl(36 30% 97%)", fg: "hsl(195 30% 10%)", accent: "hsl(184 76% 14%)" },
  },
  {
    id: "midnight",
    label: "Midnight Dark",
    description: "True dark OLED with cool foreground — easy on the eyes.",
    swatch: { bg: "hsl(222 28% 5%)", fg: "hsl(210 30% 94%)", accent: "hsl(199 90% 60%)" },
  },
  {
    id: "scifi",
    label: "Sci-Fi Futuristic",
    description: "Deep space navy with neon cyan & magenta — premium tech.",
    swatch: { bg: "hsl(230 50% 4%)", fg: "hsl(180 100% 92%)", accent: "hsl(184 100% 56%)" },
  },
];

const STORAGE_KEY = "manthana.theme";
const DEFAULT_THEME: ThemeId = "modern-clinic";

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
  themes: ThemeMeta[];
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function applyTheme(theme: ThemeId) {
  const root = document.documentElement;
  // Always set data-theme. Also toggle .dark class for shadcn/Tailwind dark utilities
  // when the theme is dark-natured, ensuring component variants stay legible.
  root.setAttribute("data-theme", theme);
  const isDark = theme === "midnight" || theme === "scifi";
  root.classList.toggle("dark", isDark);
  root.style.colorScheme = isDark ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    if (typeof window === "undefined") return DEFAULT_THEME;
    const saved = window.localStorage.getItem(STORAGE_KEY) as ThemeId | null;
    if (saved && THEMES.some((t) => t.id === saved)) return saved;
    return DEFAULT_THEME;
  });

  useEffect(() => {
    applyTheme(theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* noop */
    }
  }, [theme]);

  const setTheme = (t: ThemeId) => setThemeState(t);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
