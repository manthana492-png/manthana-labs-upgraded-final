import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ShieldCheck, Loader2, Copy, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface MfaSetupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEnrolled?: () => void;
}

/**
 * TOTP 2FA enrollment dialog using Supabase's native MFA API.
 * - Enrolls a TOTP factor (returns provisioning URI + QR SVG)
 * - User scans with Authenticator app + types 6-digit code
 * - On verify, the factor is challenged and confirmed; we record it in mfa_enrollments.
 */
export function MfaSetup({ open, onOpenChange, onEnrolled }: MfaSetupProps) {
  const [step, setStep] = useState<"loading" | "scan" | "verify" | "done" | "error">("loading");
  const [qrSvg, setQrSvg] = useState<string>("");
  const [secret, setSecret] = useState<string>("");
  const [factorId, setFactorId] = useState<string>("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState<string>("");

  // Begin enrollment when dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setStep("loading");
      setErrMsg("");
      // Clean up any unverified factors first (so user can re-enroll cleanly).
      try {
        const { data: list } = await supabase.auth.mfa.listFactors();
        const unverified = list?.all?.filter((f) => f.status === "unverified") ?? [];
        for (const f of unverified) {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
      } catch { /* noop */ }

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Manthana-${Date.now()}`,
      });
      if (cancelled) return;
      if (error || !data) {
        setStep("error");
        setErrMsg(error?.message ?? "Could not start TOTP enrolment.");
        return;
      }
      setQrSvg(data.totp.qr_code);
      setSecret(data.totp.secret);
      setFactorId(data.id);
      setStep("scan");
    })();
    return () => { cancelled = true; };
  }, [open]);

  const verify = async () => {
    if (code.length < 6) return;
    setBusy(true);
    try {
      const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
      if (cErr || !challenge) throw cErr ?? new Error("Challenge failed");
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });
      if (vErr) throw vErr;

      // Record enrollment server-side for our audit trail.
      const { data: sess } = await supabase.auth.getSession();
      const userId = sess.session?.user?.id;
      if (userId) {
        await supabase.from("mfa_enrollments").upsert({
          user_id: userId,
          factor_id: factorId,
          enrolled_at: new Date().toISOString(),
          last_verified_at: new Date().toISOString(),
        });
        await supabase.from("audit_log").insert({
          user_id: userId,
          actor_email: sess.session?.user?.email ?? null,
          action: "mfa.enroll",
          entity_type: "mfa_factor",
          entity_id: factorId,
          metadata: { method: "totp" },
          user_agent: navigator.userAgent.slice(0, 500),
        });
      }
      setStep("done");
      onEnrolled?.();
      toast.success("Two-factor authentication enabled.");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Invalid code.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Enable two-factor authentication
          </DialogTitle>
          <DialogDescription>
            Required for clinical software. Use Google Authenticator, Authy, 1Password, or any TOTP app.
          </DialogDescription>
        </DialogHeader>

        {step === "loading" && (
          <div className="py-12 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {step === "error" && (
          <div className="rounded-md border border-warning-critical-border bg-warning-critical-soft p-4 flex gap-3">
            <AlertCircle className="h-5 w-5 text-warning-critical-foreground shrink-0" />
            <div className="text-sm">
              <div className="font-medium text-warning-critical-foreground">Couldn’t start enrolment</div>
              <div className="text-xs text-warning-critical-foreground/80 mt-1">{errMsg}</div>
            </div>
          </div>
        )}

        {step === "scan" && (
          <div className="space-y-4">
            <div className="rounded-md border border-border bg-white p-3 flex justify-center">
              <div className="w-44 h-44" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            </div>
            <div>
              <Label className="text-xs">Or paste this secret manually</Label>
              <div className="flex gap-2 mt-1">
                <Input value={secret} readOnly className="font-mono text-xs h-9" />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { navigator.clipboard.writeText(secret); toast.success("Copied"); }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <Button onClick={() => setStep("verify")} className="w-full bg-primary hover:bg-primary/90">
              I’ve added it — continue
            </Button>
          </div>
        )}

        {step === "verify" && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="code">Enter the 6-digit code shown in your app</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                placeholder="123456"
                maxLength={6}
                className="font-mono text-2xl tracking-[0.4em] text-center h-14 mt-1"
              />
              {errMsg && <p className="text-xs text-destructive mt-1">{errMsg}</p>}
            </div>
            <Button
              onClick={verify}
              disabled={busy || code.length < 6}
              className="w-full bg-primary hover:bg-primary/90"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify & enable"}
            </Button>
          </div>
        )}

        {step === "done" && (
          <div className="text-center py-8">
            <CheckCircle2 className="h-10 w-10 mx-auto text-tier-nvidia-foreground" />
            <h3 className="font-display text-xl tracking-tight mt-3">2FA active</h3>
            <p className="text-sm text-muted-foreground mt-1">
              You’ll be asked for a code at your next sign-in.
            </p>
            <Button onClick={() => onOpenChange(false)} className="mt-5">Close</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
