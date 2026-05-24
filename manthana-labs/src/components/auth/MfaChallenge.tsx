import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/brand/Logo";
import { ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Full-screen 2FA challenge shown when the current session has TOTP factors
 * enrolled but the AAL is below `aal2`. The user enters their TOTP code; on
 * success the session is upgraded and the parent flow continues.
 */
export function MfaChallenge({ onVerified }: { onVerified: () => void }) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      const verified = data?.totp?.find((f) => f.status === "verified");
      if (verified) setFactorId(verified.id);
    })();
  }, []);

  const verify = async () => {
    if (!factorId || code.length < 6) return;
    setBusy(true);
    setErr("");
    try {
      const { data: ch, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
      if (cErr || !ch) throw cErr ?? new Error("Challenge failed");
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: ch.id,
        code,
      });
      if (vErr) throw vErr;
      await supabase.from("mfa_enrollments").update({
        last_verified_at: new Date().toISOString(),
      }).eq("factor_id", factorId);
      toast.success("Verified.");
      onVerified();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Invalid code");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-paper flex flex-col">
      <header className="container flex h-16 items-center"><Logo /></header>
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm surface-clinical p-6">
          <div className="flex items-center gap-2 mb-3 text-primary">
            <ShieldCheck className="h-5 w-5" />
            <span className="text-xs font-mono uppercase tracking-wider">Two-factor required</span>
          </div>
          <h1 className="font-display text-3xl tracking-tight">Enter your code</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Open your authenticator app and enter the 6-digit code for Manthana‑Labs.
          </p>
          <div className="mt-6">
            <Label htmlFor="code">6-digit code</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoFocus
              maxLength={6}
              className="font-mono text-2xl tracking-[0.4em] text-center h-14 mt-1 bg-background"
            />
            {err && <p className="text-xs text-destructive mt-1">{err}</p>}
          </div>
          <Button
            onClick={verify}
            disabled={busy || code.length < 6}
            className="w-full mt-5 bg-primary hover:bg-primary/90"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
          </Button>
          <button
            onClick={async () => { await supabase.auth.signOut(); window.location.href = "/login"; }}
            className="mt-3 w-full text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel and sign out
          </button>
        </div>
      </main>
    </div>
  );
}
