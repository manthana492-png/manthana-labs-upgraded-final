import { useEffect, useState } from "react";
import { Fingerprint, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  enrollBiometric,
  isBiometricEnrolled,
  isBiometricSupported,
  isPlatformAuthenticatorAvailable,
  disableBiometric,
} from "@/lib/biometric";

interface Props {
  email: string;
  /** Called after successful enrollment (or skip). */
  onDone?: () => void;
  variant?: "card" | "inline";
}

/**
 * Prompt the user (after a successful password sign-in) to enable
 * fingerprint / Face ID / Windows Hello sign-in next time.
 */
export function BiometricSetup({ email, onDone, variant = "card" }: Props) {
  const [available, setAvailable] = useState(false);
  const [enrolled, setEnrolled] = useState(isBiometricEnrolled());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = isBiometricSupported() && (await isPlatformAuthenticatorAvailable());
      if (!cancelled) setAvailable(ok);
    })();
    return () => { cancelled = true; };
  }, []);

  if (!available) return null;

  const enable = async () => {
    setBusy(true);
    try {
      await enrollBiometric(email);
      setEnrolled(true);
      toast.success("Biometric sign-in enabled on this device.");
      onDone?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not enable biometric login.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const disable = () => {
    disableBiometric();
    setEnrolled(false);
    toast.success("Biometric sign-in disabled on this device.");
  };

  if (enrolled) {
    return (
      <div className="rounded-xl border border-tier-nvidia-border/60 bg-tier-nvidia-soft/40 p-3.5 flex items-center gap-3">
        <ShieldCheck className="h-4 w-4 text-tier-nvidia-foreground shrink-0" />
        <div className="flex-1 text-xs">
          <div className="font-medium text-tier-nvidia-foreground">Biometric sign-in is enabled</div>
          <div className="text-muted-foreground">Use Face ID, fingerprint, or Windows Hello next time.</div>
        </div>
        <button
          type="button"
          onClick={disable}
          className="text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
        >
          <X className="h-3 w-3" /> Disable
        </button>
      </div>
    );
  }

  return (
    <div className={variant === "card" ? "rounded-xl border border-border/60 bg-surface-raised/40 p-3.5 space-y-3" : "space-y-2"}>
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Fingerprint className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium">Enable biometric sign-in</div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            Sign in next time with Face ID, fingerprint, or Windows Hello — no password needed on this device.
          </p>
        </div>
      </div>
      <Button
        type="button"
        onClick={enable}
        disabled={busy}
        className="w-full h-10"
        variant="outline"
      >
        <Fingerprint className="h-4 w-4 mr-2" />
        {busy ? "Enabling…" : "Enable on this device"}
      </Button>
    </div>
  );
}
