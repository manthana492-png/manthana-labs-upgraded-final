import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/store";
import { KeyRound, Loader2, ShieldCheck, Sparkles, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import {
  COUNCIL_BODIES,
  SYSTEM_LABEL,
  SYSTEM_BLURB,
  councilsForSystem,
  validateRegistrationFormat,
  findCouncil,
  matchCouncilByName,
} from "@/lib/councils";
import type { MedicalSystem } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";

import { AccessCodeDialog } from "@/components/auth/AccessCodeDialog";
import { CertificateUploader, type ExtractedCertificateFields } from "@/components/auth/CertificateUploader";
import { Seo } from "@/components/seo/Seo";
import { trackSignup } from "@/lib/analytics";
import { Checkbox } from "@/components/ui/checkbox";
import { MailCheck } from "lucide-react";

const schema = z.object({
  fullName: z.string().trim().min(2, "Full name is required").max(100),
  email: z.string().trim().email("Enter a valid email").max(255),
  system: z.enum(["allopathy", "ayurveda", "homeopathy", "siddha", "unani", "dental"]),
  councilBody: z.string().min(2, "Select your council"),
  councilNumber: z.string().trim().min(3).max(40),
  councilState: z.string().trim().max(60).optional(),
  councilYear: z.string().trim().max(4).optional(),
  specialty: z.string().trim().max(80).optional(),
  password: z.string().min(8, "Minimum 8 characters").max(128),
});

const Signup = () => {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [codeOpen, setCodeOpen] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);
  const [truthConsent, setTruthConsent] = useState(false);
  const [emailSent, setEmailSent] = useState<string | null>(null);

  // Controlled form state — needed so the OCR uploader can autofill fields.
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [system, setSystem] = useState<MedicalSystem>("allopathy");
  const [councilBody, setCouncilBody] = useState<string>("");
  const [registration, setRegistration] = useState("");
  const [councilYear, setCouncilYear] = useState("");
  const [councilState, setCouncilState] = useState("");
  const [password, setPassword] = useState("");

  // Fast-track form states
  const [fastTrackName, setFastTrackName] = useState("");
  const [fastTrackReg, setFastTrackReg] = useState("");
  const [fastTrackPassword, setFastTrackPassword] = useState("");
  const [fastTrackConsent, setFastTrackConsent] = useState(false);
  const [fastTrackBusy, setFastTrackBusy] = useState(false);

  const handleFastTrackOAuth = async () => {
    if (!fastTrackName.trim()) {
      toast.error("Doctor name is required for your workspace.");
      return;
    }
    if (!fastTrackReg.trim()) {
      toast.error("Registration certificate number is required.");
      return;
    }
    if (fastTrackPassword.length < 8) {
      toast.error("Workspace password must be at least 8 characters.");
      return;
    }
    if (!fastTrackConsent) {
      toast.error("Please confirm the declaration of truthfulness to continue.");
      return;
    }
    setFastTrackBusy(true);
    try {
      // 1. Store metadata
      localStorage.setItem("manthana_fast_track", JSON.stringify({
        fullName: fastTrackName.trim(),
        councilNumber: fastTrackReg.trim(),
        password: fastTrackPassword
      }));

      // 2. Trigger Google OAuth
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/attestation`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fast-track Google connection failed.");
      setFastTrackBusy(false);
    }
  };

  const councils = councilsForSystem(system);
  const fmtCheck = councilBody && registration ? validateRegistrationFormat(councilBody, registration) : null;

  const handleExtracted = (f: ExtractedCertificateFields) => {
    // Apply system first so council list filters correctly.
    let nextSystem: MedicalSystem = system;
    if (f.system) {
      nextSystem = f.system;
      setSystem(f.system);
    }
    if (f.fullName) setFullName(f.fullName);
    if (f.registrationNumber) setRegistration(f.registrationNumber.trim());
    if (f.registrationYear) setCouncilYear(f.registrationYear.replace(/\D/g, "").slice(0, 4));
    if (f.councilState) setCouncilState(f.councilState);
    if (f.specialty) setSpecialty(f.specialty);
    const matched = matchCouncilByName(f.councilBody, nextSystem);
    if (matched) setCouncilBody(matched.id);
    setAutoFilled(true);
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = {
      fullName,
      email,
      specialty,
      password,
      system,
      councilBody,
      councilNumber: registration,
      councilState,
      councilYear,
    };
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.issues.forEach((i) => { fieldErrors[i.path[0] as string] = i.message; });
      setErrors(fieldErrors);
      return;
    }
    // Note: registration-number format is shown as a hint only — we no longer
    // block submission on it. Backend council verification is intentionally
    // skipped at this stage (future plan); the doctor's declaration below is
    // taken on trust.
    if (!truthConsent) {
      setErrors({ truthConsent: "Please confirm the declaration to continue." });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const council = findCouncil(parsed.data.councilBody);
      await signUp({
        fullName: parsed.data.fullName,
        email: parsed.data.email,
        councilNumber: parsed.data.councilNumber,
        specialty: parsed.data.specialty,
        password: parsed.data.password,
        system: parsed.data.system,
        councilBody: council?.name ?? parsed.data.councilBody,
        councilState: parsed.data.councilState,
        councilYear: parsed.data.councilYear ? Number(parsed.data.councilYear) : undefined,
      });
      trackSignup("email");

      // Email verification is mandatory — show the "check your inbox" screen
      // instead of routing into the app. The user clicks the link in their
      // email, which lands them on /attestation with an authenticated session.
      setEmailSent(parsed.data.email);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not complete signup. Try again.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  if (emailSent) {
    return (
      <div className="min-h-screen bg-gradient-paper">
        <header className="container flex h-16 items-center justify-between">
          <Link to="/" className="focus-ring rounded-md"><Logo /></Link>
        </header>
        <div className="container max-w-lg py-16 md:py-24">
          <Seo title="Verify your email — Manthana-Labs" description="Confirm your email to activate your Manthana-Labs account." noindex />
          <div className="surface-clinical p-8 md:p-10 text-center">
            <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-5">
              <MailCheck className="h-7 w-7" strokeWidth={2.2} />
            </div>
            <h1 className="font-display text-3xl md:text-4xl tracking-tight">
              Doctor verification link sent to your email
            </h1>
            <p className="mt-3 text-muted-foreground">
              We've sent a verification link to{" "}
              <span className="font-medium text-foreground">{emailSent}</span>.
              Please open your inbox and click the link to confirm it's yours — then come
              back and enter Manthana‑Labs.
            </p>
            <div className="mt-6 rounded-lg border border-border/60 bg-muted/30 p-4 text-left text-xs text-muted-foreground space-y-1.5">
              <div>1. Open the email from Manthana‑Labs.</div>
              <div>2. Click <span className="font-medium text-foreground">Confirm my email</span>.</div>
              <div>3. You'll be brought back here to accept the clinician terms and enter the studio.</div>
            </div>
            <p className="mt-5 text-xs text-muted-foreground">
              Can't find it? Check your spam folder, or{" "}
              <button
                type="button"
                onClick={async () => {
                  try {
                    await supabase.auth.resend({ type: "signup", email: emailSent });
                    toast.success("Verification email sent again.");
                  } catch {
                    toast.error("Could not resend right now. Please try in a minute.");
                  }
                }}
                className="text-primary hover:underline font-medium"
              >
                resend the link
              </button>.
            </p>
            <Button
              variant="outline"
              className="mt-6"
              onClick={() => navigate("/login")}
            >
              Go to sign in
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-paper">
      <header className="container flex h-16 items-center justify-between">
        <Link to="/" className="focus-ring rounded-md"><Logo /></Link>
        <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
          Already registered? <span className="text-primary font-medium">Sign in</span>
        </Link>
      </header>

      <div className="container max-w-xl py-10 md:py-16">
        <Seo
          title="Apply for access — Manthana-Labs for Doctors"
          description="Apply for Manthana-Labs access. Verified for licensed clinicians across NMC, NCISM, NCH, and DCI in India."
          path="/signup"
        />
        <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full bg-tier-nvidia-soft border border-tier-nvidia-border/60 text-tier-nvidia-foreground">
          <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2.4} />
          <span className="text-xs font-medium">All recognised systems · NMC · NCISM · NCH · DCI</span>
        </div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tight">Apply for access</h1>
        <p className="mt-2 text-muted-foreground">
          Manthana‑Labs supports Allopathy and AYUSH practitioners. Provide your council details
          on trust — we ask you to declare them as true and to verify your email before signing in.
        </p>

        {/* FAST-TRACK GOOGLE OAUTH CARD WITH MINIMAL DETAILS */}
        <div className="mt-8 relative overflow-hidden rounded-2xl border-2 border-blue-400/40 bg-gradient-to-br from-blue-500/10 via-primary/5 to-transparent p-6 md:p-8"
             style={{ boxShadow: '0 0 25px 3px rgba(59,130,246,0.18), 0 0 50px 5px rgba(59,130,246,0.08)' }}>
          <div className="absolute top-0 right-0 p-3 opacity-15 pointer-events-none">
            <Sparkles className="h-20 w-20 text-primary animate-pulse" />
          </div>
          <div className="relative">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex h-6 items-center justify-center rounded-full bg-blue-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-500 border border-blue-500/25">
                Fastest Way
              </span>
              <span className="text-xs font-semibold text-blue-500/90 flex items-center gap-1">
                Verify later? Create workspace instantly
              </span>
            </div>
            
            <h2 className="font-display text-2xl tracking-tight text-foreground mt-3">
              Fast-Track via Google OAuth
            </h2>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed max-w-lg">
              Provide just your doctor name and medical certificate registration number. Secure your personal medical workspace with a password, and link it instantly with Google OAuth.
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="fastName" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Doctor Name (as on certificate)
                </Label>
                <Input
                  id="fastName"
                  placeholder="Dr. Rajesh Kumar"
                  value={fastTrackName}
                  onChange={(e) => setFastTrackName(e.target.value)}
                  className="h-10 bg-background/80 border-border/80 focus-ring text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fastReg" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Registration Certificate Number
                </Label>
                <Input
                  id="fastReg"
                  placeholder="MCI-12345"
                  value={fastTrackReg}
                  onChange={(e) => setFastTrackReg(e.target.value)}
                  className="h-10 bg-background/80 border-border/80 focus-ring text-sm"
                />
              </div>
            </div>

            <div className="mt-4 space-y-1.5">
              <Label htmlFor="fastPassword" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Personal Workspace Password
              </Label>
              <Input
                id="fastPassword"
                type="password"
                placeholder="••••••••"
                value={fastTrackPassword}
                onChange={(e) => setFastTrackPassword(e.target.value)}
                className="h-10 bg-background/80 border-border/80 focus-ring text-sm"
              />
              <p className="text-[10px] text-muted-foreground leading-normal">
                Choose a strong password to protect your private patient summary logs and diagnostic workspace.
              </p>
            </div>

            {/* Health-professional truthfulness consent */}
            <label className="mt-4 flex items-start gap-3 rounded-lg border border-border/60 bg-background/50 p-3.5 cursor-pointer">
              <Checkbox
                checked={fastTrackConsent}
                onCheckedChange={(v) => setFastTrackConsent(Boolean(v))}
                className="mt-0.5 border-blue-500/50 data-[state=checked]:bg-blue-500"
              />
              <span className="text-xs leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">Declaration of truthfulness.</span>{" "}
                I declare, on my own responsibility as a health professional, that all the
                information I have provided about my identity, qualifications and council
                registration is <span className="font-semibold text-foreground">true, current and genuine</span>,
                and that the details I have typed belong to me. I understand that providing false credentials is a serious
                offence, that Manthana‑Labs records every submission for audit, and that my
                account may be suspended and reported to the relevant council if any
                detail is found to be inaccurate or misrepresented.
              </span>
            </label>

            <Button
              type="button"
              disabled={fastTrackBusy || !fastTrackConsent}
              onClick={handleFastTrackOAuth}
              className="mt-5 w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-lg shadow-primary/10 gap-2 flex items-center justify-center transition-all duration-300"
            >
              {fastTrackBusy ? (
                <>
                  <Loader2 className="h-4.5 w-4.5 animate-spin mr-1.5" />
                  Linking Google Account...
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="mr-1">
                    <path fill="currentColor" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.616z" />
                    <path fill="currentColor" opacity="0.8" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
                    <path fill="currentColor" opacity="0.9" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" />
                    <path fill="currentColor" opacity="0.85" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" />
                  </svg>
                  Fast-Track Workspace with Google OAuth
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border/60" />
          </div>
          <div className="relative flex justify-center text-[11px] uppercase tracking-widest">
            <span className="bg-gradient-paper px-3 text-muted-foreground">upload your medical registration certificate</span>
          </div>
        </div>

        <CertificateUploader onExtracted={handleExtracted} />

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border/60" />
          </div>
          <div className="relative flex justify-center text-[11px] uppercase tracking-widest">
            <span className="bg-gradient-paper px-3 text-muted-foreground">
              {autoFilled ? "review & confirm details" : "or type council details manually"}
            </span>
          </div>
        </div>

        <form onSubmit={onSubmit} className="surface-clinical p-6 md:p-8 space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Full name (as on certificate)</Label>
            <Input id="fullName" name="fullName" required maxLength={100} value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-11 bg-background" />
            {errors.fullName && <p className="text-xs text-destructive">{errors.fullName}</p>}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Work email</Label>
              <Input id="email" name="email" type="email" required maxLength={255} value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 bg-background" />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="specialty">Specialty</Label>
              <Input id="specialty" name="specialty" placeholder="e.g. Radiology, Panchakarma" maxLength={80} value={specialty} onChange={(e) => setSpecialty(e.target.value)} className="h-11 bg-background" />
            </div>
          </div>

          {/* System selector */}
          <div className="space-y-1.5">
            <Label>Medical system</Label>
            <Select value={system} onValueChange={(v) => { setSystem(v as MedicalSystem); setCouncilBody(""); }}>
              <SelectTrigger className="h-11 bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(SYSTEM_LABEL) as MedicalSystem[]).map((s) => (
                  <SelectItem key={s} value={s}>{SYSTEM_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{SYSTEM_BLURB[system]}</p>
          </div>

          {/* Council body */}
          <div className="space-y-1.5">
            <Label>Registering council / board</Label>
            <Select value={councilBody} onValueChange={setCouncilBody}>
              <SelectTrigger className="h-11 bg-background"><SelectValue placeholder="Select your council" /></SelectTrigger>
              <SelectContent>
                {councils.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {councilBody && (
              <p className="text-xs text-muted-foreground">
                Format: <span className="font-mono">{COUNCIL_BODIES.find((c) => c.id === councilBody)?.formatHint}</span>
              </p>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="councilNumber">
                Registration number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="councilNumber"
                name="councilNumber"
                required
                value={registration}
                onChange={(e) => setRegistration(e.target.value)}
                placeholder="As printed on certificate"
                className="h-11 bg-background font-mono"
              />
              {fmtCheck && !fmtCheck.ok && (
                <p className="text-xs text-muted-foreground">
                  Hint: {fmtCheck.message} — you can still continue if your certificate shows a different format.
                </p>
              )}
              {fmtCheck && fmtCheck.ok && (
                <p className="text-xs text-tier-nvidia-foreground">Format looks correct ✓</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="councilYear">Year of registration</Label>
              <Input id="councilYear" name="councilYear" inputMode="numeric" placeholder="e.g. 2018" maxLength={4} value={councilYear} onChange={(e) => setCouncilYear(e.target.value)} className="h-11 bg-background" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="councilState">State (if state-issued)</Label>
            <Input id="councilState" name="councilState" placeholder="e.g. Maharashtra" maxLength={60} value={councilState} onChange={(e) => setCouncilState(e.target.value)} className="h-11 bg-background" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required minLength={8} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 bg-background" />
            {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
          </div>

          {/* Health-professional truthfulness consent */}
          <label className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/30 p-3.5 cursor-pointer">
            <Checkbox
              checked={truthConsent}
              onCheckedChange={(v) => setTruthConsent(Boolean(v))}
              className="mt-0.5"
            />
            <span className="text-xs leading-relaxed">
              <span className="font-medium text-foreground">Declaration of truthfulness.</span>{" "}
              I declare, on my own responsibility as a health professional, that all the
              information I have provided about my identity, qualifications and council
              registration is <span className="font-medium">true, current and genuine</span>,
              and that the certificate I have uploaded or the details I have typed
              belong to me. I understand that providing false credentials is a serious
              offence, that Manthana‑Labs records every submission for audit, and that my
              account may be suspended and reported to the relevant council if any
              detail is found to be inaccurate or misrepresented.
            </span>
          </label>
          {errors.truthConsent && (
            <p className="text-xs text-destructive">{errors.truthConsent}</p>
          )}

          <Button
            type="submit"
            disabled={busy || !truthConsent}
            className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account & verify email"}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Email verification is required. We'll send a confirmation link to your inbox —
            click it to activate your Manthana‑Labs account.
          </p>

          <p className="text-[10px] text-center text-muted-foreground/80 pt-2 border-t border-border/40">
            A product of <span className="font-medium text-foreground">Quaasx 108 Private Limited</span> ·
            Support: <a href="mailto:info@quaasx108.com" className="text-primary hover:underline">info@quaasx108.com</a>
          </p>
        </form>
      </div>

      <AccessCodeDialog open={codeOpen} onOpenChange={setCodeOpen} />
    </div>
  );
};

export default Signup;
