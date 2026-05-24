import { useEffect, useState, useCallback } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import {
  Download, FileText, ShieldCheck, Smartphone, CheckCircle2, AlertCircle,
  Clock, Loader2, RefreshCw, Mail,
} from "lucide-react";
import { toast } from "sonner";
import { MfaSetup } from "@/components/auth/MfaSetup";
import { BrandingSettings } from "@/components/settings/BrandingSettings";
import { HospitalConnectionSettings } from "@/components/settings/HospitalConnectionSettings";
import { SYSTEM_LABEL } from "@/lib/councils";
import type { VerificationStatus } from "@/lib/types";

interface VerificationRow {
  id: string;
  status: VerificationStatus;
  verification_source: string | null;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  registration_number: string;
  council_body: string;
  full_name_submitted: string;
}

const Settings = () => {
  const { doctor, hydrateFromSession } = useAuth();
  const [mfaOpen, setMfaOpen] = useState(false);
  const [mfaEnrolled, setMfaEnrolled] = useState<boolean | null>(null);
  const [verifications, setVerifications] = useState<VerificationRow[] | null>(null);
  const [resubmitting, setResubmitting] = useState(false);
  const [revLoading, setRevLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const refreshMfa = async () => {
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      setMfaEnrolled((data?.totp?.filter((f) => f.status === "verified").length ?? 0) > 0);
    } catch {
      setMfaEnrolled(false);
    }
  };

  const refreshVerifications = useCallback(async () => {
    setRevLoading(true);
    try {
      const { data } = await supabase
        .from("council_verifications")
        .select("id,status,verification_source,rejection_reason,created_at,reviewed_at,registration_number,council_body,full_name_submitted")
        .order("created_at", { ascending: false })
        .limit(5);
      setVerifications((data ?? []) as VerificationRow[]);
    } finally {
      setRevLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshMfa();
    refreshVerifications();
  }, [refreshVerifications]);

  // Realtime: react to status changes from admin/edge function.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("council-verif-status")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "council_verifications", filter: `user_id=eq.${userId}` },
        () => {
          refreshVerifications();
          hydrateFromSession();
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, refreshVerifications, hydrateFromSession]);

  const latest = verifications?.[0];
  const status: VerificationStatus = doctor?.verificationStatus ?? latest?.status ?? "pending";

  const resubmit = async () => {
    if (!doctor) return;
    setResubmitting(true);
    try {
      const { error } = await supabase.functions.invoke("verify-council", {
        body: {
          system: doctor.system ?? "allopathy",
          council_body: doctor.councilBody ?? "Unspecified",
          registration_number: doctor.councilNumber ?? "",
          registration_year: doctor.councilYear ?? undefined,
          state: doctor.councilState ?? undefined,
          full_name: doctor.fullName,
        },
      });
      if (error) throw error;
      toast.success("Re-submitted for verification");
      await refreshVerifications();
      await hydrateFromSession();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not resubmit.");
    } finally {
      setResubmitting(false);
    }
  };

  return (
    <AppShell>
      <div className="max-w-2xl">
        <h1 className="font-display text-3xl md:text-4xl tracking-tight">Settings</h1>
        <p className="mt-1 text-muted-foreground">Profile, security, and audit.</p>

        {/* ── Verification status ── */}
        <section className="surface-clinical p-6 mt-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xl tracking-tight">Council verification</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {doctor?.system ? SYSTEM_LABEL[doctor.system] : "—"}
                {doctor?.councilBody && <> · {doctor.councilBody}</>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <VerificationBadge status={status} />
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={refreshVerifications}
                disabled={revLoading}
                title="Refresh status"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${revLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          <div className="mt-4 grid sm:grid-cols-2 gap-3 text-sm">
            <div>
              <Label className="text-xs text-muted-foreground">Registration</Label>
              <div className="font-mono">{doctor?.councilNumber || "—"}</div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">State / Year</Label>
              <div>{doctor?.councilState ?? "—"} · {doctor?.councilYear ?? "—"}</div>
            </div>
          </div>

          {/* Next-action panel — depends on live status */}
          <NextActionPanel
            status={status}
            latest={latest}
            onResubmit={resubmit}
            resubmitting={resubmitting}
          />

          {/* History */}
          {verifications && verifications.length > 0 && (
            <div className="mt-5 border-t border-border pt-4">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                Recent submissions
              </div>
              <ul className="space-y-2">
                {verifications.slice(0, 3).map((v) => (
                  <li key={v.id} className="flex items-center justify-between text-xs gap-2">
                    <div className="text-muted-foreground">
                      {new Date(v.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} ·{" "}
                      <span className="font-mono">{v.registration_number}</span>
                    </div>
                    <VerificationBadge status={v.status} compact />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Misuse caution */}
          <div className="mt-5 rounded-lg border border-warning-critical-border/40 bg-warning-critical-soft/40 p-3 text-xs text-warning-critical-foreground/90">
            <div className="font-medium mb-0.5">Identity disclaimer</div>
            <p className="leading-relaxed">
              Misusing another clinician's registration number or providing a false identity is the
              sole responsibility of the person who submitted it. Manthana‑Labs logs every attempt and
              cooperates with councils on any reported misuse.
            </p>
          </div>
        </section>

        {/* ── 2FA ── */}
        <section className="surface-clinical p-6 mt-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xl tracking-tight flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-primary" />
                Two-factor authentication
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Required for clinical software. Uses TOTP (Google Authenticator, Authy, 1Password).
              </p>
            </div>
            {mfaEnrolled === true && (
              <Badge className="bg-tier-nvidia-soft text-tier-nvidia-foreground border-tier-nvidia-border">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Enabled
              </Badge>
            )}
            {mfaEnrolled === false && <Badge variant="outline">Not enabled</Badge>}
          </div>
          <Button
            onClick={() => setMfaOpen(true)}
            className="mt-4 bg-primary hover:bg-primary/90"
          >
            {mfaEnrolled ? "Re-enroll" : "Enable 2FA"}
          </Button>
        </section>

        {/* ── Profile ── */}
        <section className="surface-clinical p-6 mt-6">
          <h2 className="font-display text-xl tracking-tight mb-4">Profile</h2>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Full name</Label>
              <Input defaultValue={doctor?.fullName} className="h-11 bg-background" />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input defaultValue={doctor?.email} className="h-11 bg-background" />
              </div>
              <div className="space-y-1.5">
                <Label>Specialty</Label>
                <Input defaultValue={doctor?.specialty} className="h-11 bg-background" />
              </div>
            </div>
            <Button onClick={() => toast.success("Profile saved.")} className="bg-primary hover:bg-primary/90">
              Save changes
            </Button>
          </div>
        </section>

        {/* ── Report branding (Pro / Pro+) ── */}
        <BrandingSettings />
        <HospitalConnectionSettings />
        <section className="surface-clinical p-6 mt-6">
          <h2 className="font-display text-xl tracking-tight mb-1">Data &amp; audit</h2>
          <p className="text-sm text-muted-foreground mb-4">DPDP-aligned exports are available on demand.</p>
          <div className="space-y-2">
            <Button variant="outline" className="w-full justify-start" onClick={() => toast.success("CSV export queued.")}>
              <Download className="h-4 w-4 mr-2" /> Export my data (CSV)
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => toast.success("Audit log export queued.")}>
              <FileText className="h-4 w-4 mr-2" /> Export audit log
            </Button>
          </div>
        </section>

        <section className="surface-clinical p-6 mt-6 bg-accent/40">
          <div className="flex gap-3 items-start">
            <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="font-display text-lg tracking-tight">Re-accept attestation</h3>
              <p className="text-sm text-muted-foreground mt-1">
                You will be prompted to re-accept the clinician-use terms whenever they materially change.
              </p>
            </div>
          </div>
        </section>

        {/* Support footer */}
        <section className="surface-clinical p-5 mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-4 w-4 text-primary" />
              Need help? Reach us at{" "}
              <a href="mailto:info@quaasx108.com" className="text-primary font-medium hover:underline">
                info@quaasx108.com
              </a>
            </div>
            <div className="text-xs text-muted-foreground">
              A product of <span className="font-medium text-foreground">Quaasx 108 Private Limited</span>
            </div>
          </div>
        </section>
      </div>

      <MfaSetup
        open={mfaOpen}
        onOpenChange={setMfaOpen}
        onEnrolled={() => { refreshMfa(); hydrateFromSession(); }}
      />
    </AppShell>
  );
};

function VerificationBadge({ status, compact }: { status: VerificationStatus; compact?: boolean }) {
  const config = {
    verified: { label: "Verified", cls: "bg-tier-nvidia-soft text-tier-nvidia-foreground border-tier-nvidia-border", Icon: CheckCircle2 },
    pending: { label: "Queued", cls: "bg-muted text-muted-foreground border-border", Icon: Loader2 },
    manual_review: { label: "Under review", cls: "bg-tier-research-soft text-tier-research-foreground border-tier-research-border", Icon: Clock },
    rejected: { label: "Rejected", cls: "bg-warning-critical-soft text-warning-critical-foreground border-warning-critical-border", Icon: AlertCircle },
  }[status];
  return (
    <Badge className={`${config.cls} border ${compact ? "text-[10px] py-0 px-1.5" : ""}`}>
      <config.Icon className={`h-3 w-3 mr-1 ${status === "pending" ? "animate-spin" : ""}`} /> {config.label}
    </Badge>
  );
}

function NextActionPanel({
  status, latest, onResubmit, resubmitting,
}: {
  status: VerificationStatus;
  latest?: VerificationRow;
  onResubmit: () => void;
  resubmitting: boolean;
}) {
  if (status === "verified") {
    return (
      <div className="mt-4 rounded-lg border border-tier-nvidia-border/40 bg-tier-nvidia-soft/40 p-3 text-xs">
        <div className="font-medium text-tier-nvidia-foreground">You're verified.</div>
        <p className="text-muted-foreground mt-0.5">
          All clinical features are unlocked. No further action needed.
        </p>
      </div>
    );
  }
  if (status === "rejected") {
    return (
      <div className="mt-4 rounded-lg border border-warning-critical-border/40 bg-warning-critical-soft/40 p-3 text-xs space-y-2">
        <div className="font-medium text-warning-critical-foreground">Verification couldn't complete.</div>
        <p className="text-warning-critical-foreground/90">
          {latest?.rejection_reason ?? "Please double-check your registration number and full name as they appear on your council certificate."}
        </p>
        <ol className="list-decimal pl-4 space-y-0.5 text-muted-foreground">
          <li>Re-check your registration number — including any prefix / slash.</li>
          <li>Make sure your full name matches the council certificate.</li>
          <li>Resubmit, or email <a href="mailto:info@quaasx108.com" className="text-primary">info@quaasx108.com</a> with a scan of your certificate.</li>
        </ol>
        <Button size="sm" variant="outline" onClick={onResubmit} disabled={resubmitting} className="mt-1">
          {resubmitting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
          Re-submit verification
        </Button>
      </div>
    );
  }
  if (status === "manual_review") {
    return (
      <div className="mt-4 rounded-lg border border-tier-research-border/40 bg-tier-research-soft/40 p-3 text-xs space-y-2">
        <div className="font-medium text-tier-research-foreground">Under manual review.</div>
        <p className="text-muted-foreground">
          Our verification team is checking your details against your council registry. Typical
          turnaround is 24–48 hours. You can use AI-assisted tools right now.
        </p>
        <p className="text-muted-foreground">
          Need it sooner? Email a copy of your council certificate to{" "}
          <a href="mailto:info@quaasx108.com" className="text-primary">info@quaasx108.com</a>.
        </p>
      </div>
    );
  }
  // pending
  return (
    <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3 text-xs">
      <div className="font-medium">Queued for verification.</div>
      <p className="text-muted-foreground mt-0.5">
        Your submission is in the queue. You'll see a live update here the moment the status changes.
      </p>
    </div>
  );
}

export default Settings;
