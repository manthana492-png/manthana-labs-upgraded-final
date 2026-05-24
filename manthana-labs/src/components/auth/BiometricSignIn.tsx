import { useEffect, useState } from "react";
import { Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  getEnrolledEmail,
  isBiometricEnrolled,
  isBiometricSupported,
  isPlatformAuthenticatorAvailable,
  signInWithBiometric,
} from "@/lib/biometric";
import { useAuth } from "@/lib/store";

interface Props {
  onSuccess: () => void;
}

/** Quick "Sign in with biometrics" button shown on Login if enrolled. */
export function BiometricSignIn({ onSuccess }: Props) {
  const { hydrateFromSession } = useAuth();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const email = getEnrolledEmail();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok =
        isBiometricSupported() &&
        isBiometricEnrolled() &&
        (await isPlatformAuthenticatorAvailable());
      if (!cancelled) setShow(ok);
    })();
    return () => { cancelled = true; };
  }, []);

  if (!show) return null;

  const onClick = async () => {
    setBusy(true);
    try {
      await signInWithBiometric();
      await hydrateFromSession();
      onSuccess();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Biometric sign-in failed.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 space-y-2.5">
      <div className="flex items-center gap-2">
        <Fingerprint className="h-4 w-4 text-primary" />
        <span className="text-xs font-medium">Quick sign-in available</span>
      </div>
      {email && (
        <p className="text-xs text-muted-foreground truncate">
          As <span className="font-medium text-foreground">{email}</span>
        </p>
      )}
      <Button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90"
      >
        <Fingerprint className="h-4 w-4 mr-2" />
        {busy ? "Verifying…" : "Sign in with biometrics"}
      </Button>
    </div>
  );
}
