import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * useIdleLock
 * ─────────────────────────────────────────────────────────────────────
 * Tracks user activity. After `timeoutMs` of inactivity, locks the UI
 * with an opaque blur overlay until the doctor presses "Resume". Helps
 * prevent shoulder-surfing on shared clinic computers.
 */
export function useIdleLock(timeoutMs: number = 15 * 60 * 1000) {
  const [locked, setLocked] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);

  const reset = useCallback(() => {
    if (locked) return; // don't restart timer while locked
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setLocked(true), timeoutMs);
  }, [locked, timeoutMs]);

  useEffect(() => {
    const events: (keyof WindowEventMap)[] = [
      "mousemove",
      "keydown",
      "click",
      "scroll",
      "touchstart",
    ];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [reset]);

  return { locked, unlock: () => setLocked(false), reset };
}

/**
 * IdleLockOverlay — pairs with `useIdleLock` to render the privacy screen.
 */
export function IdleLockOverlay({
  timeoutMinutes = 15,
}: {
  timeoutMinutes?: number;
}) {
  const { locked, unlock } = useIdleLock(timeoutMinutes * 60 * 1000);
  return (
    <AnimatePresence>
      {locked && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[10000] backdrop-blur-2xl bg-background/85 flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Session locked for privacy"
        >
          <div className="surface-clinical max-w-sm w-full p-7 text-center">
            <div className="h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
              <Lock className="h-6 w-6" />
            </div>
            <h2 className="font-display text-xl tracking-tight">Session paused for privacy</h2>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Your screen has been blurred after {timeoutMinutes} minutes of inactivity to prevent
              shoulder-surfing on shared computers. No data was lost.
            </p>
            <Button onClick={unlock} className="w-full mt-5 bg-primary hover:bg-primary/90">
              <Eye className="h-4 w-4 mr-2" /> Resume my session
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
