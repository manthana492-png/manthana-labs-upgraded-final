import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, KeyRound, ShieldAlert, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after successful redemption — page should refetch profile/sub. */
  onSuccess?: () => void;
}

const FP_KEY = "manthana.access_code.fp";

/** Stable-ish browser fingerprint (not cryptographic — combined with IP server-side for lockout). */
function getFingerprint(): string {
  let fp = localStorage.getItem(FP_KEY);
  if (!fp) {
    const seed = `${navigator.userAgent}|${navigator.language}|${screen.width}x${screen.height}|${new Date().getTimezoneOffset()}|${crypto.randomUUID()}`;
    fp = btoa(seed).slice(0, 64);
    localStorage.setItem(FP_KEY, fp);
  }
  return fp;
}

export const AccessCodeDialog = ({ open, onOpenChange, onSuccess }: Props) => {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!open) return;
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    // Hard-require an authenticated session — the function attaches Pro to a user.
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      toast.error("Please sign in first, then redeem your access code.");
      setAuthed(false);
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("redeem-access-code", {
        body: { code: code.trim(), fingerprint: getFingerprint() },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (error) {
        const msg = (data as { error?: string } | null)?.error ?? error.message ?? "Invalid code.";
        toast.error(msg);
      } else if (data?.success) {
        toast.success("Pro access activated. Welcome!");
        setCode("");
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast.error(data?.error ?? "Could not redeem code.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 h-11 w-11 rounded-full bg-tier-nvidia-soft border border-tier-nvidia-border/60 flex items-center justify-center">
            <KeyRound className="h-5 w-5 text-tier-nvidia-foreground" />
          </div>
          <DialogTitle className="text-center font-display text-2xl tracking-tight">
            Enter access code
          </DialogTitle>
          <DialogDescription className="text-center">
            For camp / institutional members issued a code by Quaasx 108.
            Activates a Pro subscription instantly.
          </DialogDescription>
        </DialogHeader>

        {authed === false && (
          <div className="rounded-lg border border-warning-critical-border/40 bg-warning-critical-soft/30 p-3 text-xs text-warning-critical-foreground/90">
            <ShieldAlert className="h-4 w-4 inline mr-1.5 mb-0.5" />
            Tip: sign in or apply for access first so the code links Pro to your account. You can still paste the code below.
          </div>
        )}
        <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="access-code">Access code</Label>
              <Input
                id="access-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Paste the code provided to you"
                autoComplete="off"
                spellCheck={false}
                className="h-11 bg-background font-mono text-sm"
                required
                disabled={busy}
              />
              <p className="text-xs text-muted-foreground">
                3 wrong attempts will lock further attempts from this device for 24 hours.
              </p>
            </div>

            <Button
              type="submit"
              disabled={busy || !code.trim() || authed === null || authed === false}
              className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Redeem & activate Pro
                </>
              )}
            </Button>
          </form>


        <p className="text-[10px] text-center text-muted-foreground/70 pt-2 border-t border-border/40">
          Limited to 20 members total · Issued by Quaasx 108 Private Limited
        </p>
      </DialogContent>
    </Dialog>
  );
};
