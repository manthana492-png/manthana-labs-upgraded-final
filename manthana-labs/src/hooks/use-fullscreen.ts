import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useFullscreen — unified enter/exit fullscreen for any element.
 *
 * Strategy:
 *   1) Native Fullscreen API (Chrome/Edge/Firefox/Safari desktop & Android).
 *   2) Webkit-prefixed `webkitEnterFullscreen` for iOS Safari <video> elements.
 *   3) CSS pseudo-fullscreen fallback (position:fixed inset-0 z-[9999])
 *      for iOS Safari when neither of the above are available — works on
 *      every viewer (canvas, divs) with the same exit experience.
 *
 * Returns:
 *   - ref: attach to the wrapping element you want fullscreen
 *   - isFullscreen: boolean (covers all 3 modes)
 *   - toggle, enter, exit: control fns
 *   - pseudoFullscreenClass: apply when isPseudo is true to fix the element
 */
type FsTarget = HTMLElement | null;

interface FsApi<T extends HTMLElement> {
  ref: React.MutableRefObject<T | null>;
  isFullscreen: boolean;
  isPseudo: boolean;
  enter: () => Promise<void>;
  exit: () => Promise<void>;
  toggle: () => Promise<void>;
}

function getFsElement(): Element | null {
  const d = document as Document & {
    webkitFullscreenElement?: Element;
    msFullscreenElement?: Element;
  };
  return (
    document.fullscreenElement ||
    d.webkitFullscreenElement ||
    d.msFullscreenElement ||
    null
  );
}

async function requestFs(el: FsTarget) {
  if (!el) return false;
  const e = el as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>;
    msRequestFullscreen?: () => Promise<void>;
  };
  if (e.requestFullscreen) { await e.requestFullscreen(); return true; }
  if (e.webkitRequestFullscreen) { await e.webkitRequestFullscreen(); return true; }
  if (e.msRequestFullscreen) { await e.msRequestFullscreen(); return true; }
  return false;
}

async function exitFs() {
  const d = document as Document & {
    webkitExitFullscreen?: () => Promise<void>;
    msExitFullscreen?: () => Promise<void>;
  };
  if (document.exitFullscreen) { await document.exitFullscreen(); return; }
  if (d.webkitExitFullscreen) { await d.webkitExitFullscreen(); return; }
  if (d.msExitFullscreen) { await d.msExitFullscreen(); return; }
}

export function useFullscreen<T extends HTMLElement = HTMLDivElement>(): FsApi<T> {
  const ref = useRef<T | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPseudo, setIsPseudo] = useState(false);

  // Sync with native API
  useEffect(() => {
    const fn = () => {
      const native = !!getFsElement();
      setIsFullscreen(native || isPseudo);
    };
    document.addEventListener("fullscreenchange", fn);
    document.addEventListener("webkitfullscreenchange", fn as EventListener);
    return () => {
      document.removeEventListener("fullscreenchange", fn);
      document.removeEventListener("webkitfullscreenchange", fn as EventListener);
    };
  }, [isPseudo]);

  // Allow ESC to exit pseudo-fullscreen
  useEffect(() => {
    if (!isPseudo) return;
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsPseudo(false);
        setIsFullscreen(false);
        document.body.style.overflow = "";
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [isPseudo]);

  const enter = useCallback(async () => {
    const el = ref.current;
    if (!el) return;
    const ok = await requestFs(el).catch(() => false);
    if (ok) {
      setIsFullscreen(true);
      return;
    }
    // iOS Safari fallback — pseudo-fullscreen via CSS
    setIsPseudo(true);
    setIsFullscreen(true);
    document.body.style.overflow = "hidden";
  }, []);

  const exit = useCallback(async () => {
    if (getFsElement()) {
      await exitFs().catch(() => {});
    }
    setIsPseudo(false);
    setIsFullscreen(false);
    document.body.style.overflow = "";
  }, []);

  const toggle = useCallback(async () => {
    if (isFullscreen) await exit();
    else await enter();
  }, [isFullscreen, enter, exit]);

  return { ref, isFullscreen, isPseudo, enter, exit, toggle };
}
