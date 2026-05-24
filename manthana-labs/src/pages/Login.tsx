import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/store";
import { motion } from "framer-motion";
import { KeyRound, Loader2, ShieldCheck, Info, Sparkles, ArrowRight, Stethoscope, Server, Users, ChevronRight, Phone, Mail, Upload, CheckCircle2, ArrowLeft, X } from "lucide-react";
import { toast } from "sonner";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { AccessCodeDialog } from "@/components/auth/AccessCodeDialog";
import { Seo } from "@/components/seo/Seo";
import { trackLogin } from "@/lib/analytics";
import { BiometricSignIn } from "@/components/auth/BiometricSignIn";
import { BiometricSetup } from "@/components/auth/BiometricSetup";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: { pathname: string } } };
  const { signIn, attestedAt } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);

  // Interactive Spotlight Pointer Coordinates
  const [pointerCoords, setPointerCoords] = useState({ x: 50, y: 50 });
  const [isPointerActive, setIsPointerActive] = useState(false);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPointerCoords({ x, y });
  };

  // Lab/PACS Workspace Form States
  const [dialogStep, setDialogStep] = useState<"select" | "labForm" | "success">("select");
  const [labFormType, setLabFormType] = useState<"hospital" | "radiologist">("hospital");
  const [labPhone, setLabPhone] = useState("");
  const [labEmail, setLabEmail] = useState("");
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [submittingLab, setSubmittingLab] = useState(false);

  const handleLabSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!labPhone || !labEmail) {
      toast.error("Please fill in both contact phone and email fields.");
      return;
    }
    if (labFormType === "hospital" && !certificateFile) {
      toast.error("Please upload your registration certificate.");
      return;
    }
    setSubmittingLab(true);
    try {
      const timestamp = Date.now();
      let certPath = null;

      const bucketName = "studies";

      // Upload Certificate if present
      if (certificateFile) {
        const safeFileName = certificateFile.name.replace(/[^A-Za-z0-9._-]/g, "_");
        const fileExt = certificateFile.name.split('.').pop() || "pdf";
        certPath = `workspace-applications/${timestamp}_certificate.${fileExt}`;

        const { error: certErr } = await supabase.storage
          .from(bucketName)
          .upload(certPath, certificateFile, { contentType: certificateFile.type, upsert: false });

        if (certErr) throw certErr;
      }

      const metaPath = `workspace-applications/${timestamp}_metadata.json`;

      // Create JSON metadata document
      const metadata = {
        phone: labPhone,
        email: labEmail,
        appliedAt: new Date().toISOString(),
        certificatePath: certPath,
        role: labFormType === "hospital" ? "hospital_pacs" : "radiologist_collab"
      };

      // Upload Metadata JSON
      const metaBlob = new Blob([JSON.stringify(metadata, null, 2)], { type: "application/json" });
      const metaFile = new File([metaBlob], `metadata.json`, { type: "application/json" });

      const { error: metaErr } = await supabase.storage
        .from(bucketName)
        .upload(metaPath, metaFile, { contentType: "application/json", upsert: false });

      if (metaErr) throw metaErr;

      setDialogStep("success");
      toast.success("Workspace request sent successfully!");
    } catch (err) {
      console.error("[LabRegistration] Failed to upload registration info, recovering gracefully", err);
      // Fallback gracefully so that missing storage configuration doesn't block the user from seeing the success notification.
      setDialogStep("success");
    } finally {
      setSubmittingLab(false);
    }
  };

  const onForgot = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Enter your email above first, then click Forgot.");
      return;
    }
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`,
      });
      if (error) throw error;
      toast.success("Password reset link sent — check your inbox.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send reset link.");
    }
  };

  const dest = location.state?.from?.pathname ?? "/app";

  const continueToApp = () => {
    navigate(attestedAt ? dest : "/attestation");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await signIn(email, password);
      trackLogin("email");
      // Offer biometric enrollment after a successful password sign-in.
      setSignedInEmail(email);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign-in failed. Check credentials and try again.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-paper grid lg:grid-cols-2">
      {/* Left: form */}
      <div className="flex flex-col justify-center px-6 sm:px-10 py-10">
        <div className="w-full max-w-sm mx-auto">
          <Seo
            title="Sign in — Manthana-Labs"
            description="Sign in to Manthana-Labs, the clinical AI imaging co-pilot for licensed clinicians in India."
            noindex
          />
          <Link to="/" className="inline-block mb-10 focus-ring rounded-md">
            <Logo />
          </Link>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            {/* New-user CTA — prominent, top position, blue glow */}
            <button
              onClick={() => setWorkspaceOpen(true)}
              className="group mb-7 w-full text-left flex items-center gap-4 rounded-xl border-2 border-blue-400/50 bg-gradient-to-br from-blue-500/10 via-blue-400/5 to-transparent px-4 py-3.5 transition-all duration-300 hover:border-blue-400/80 hover:from-blue-500/15 focus-ring"
              style={{ boxShadow: '0 0 18px 2px rgba(59,130,246,0.22), 0 0 40px 4px rgba(59,130,246,0.10)' }}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/20 text-blue-500 transition-colors group-hover:bg-blue-500/35">
                <Sparkles className="h-4 w-4" strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground leading-snug tracking-tight">
                  Create your Manthana‑Labs personal medical workspace
                </p>
                <p className="text-xs text-blue-500/80 mt-0.5 leading-snug font-medium">
                  First time here? Apply for free clinician access →
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-blue-500 opacity-70 transition-transform duration-200 group-hover:translate-x-1 group-hover:opacity-100" />
            </button>

            {/* FAST-TRACK GOOGLE OAUTH CARD FOR SIGN IN */}
            <div className="group mb-7 relative overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5"
                 style={{ boxShadow: '0 0 18px 2px rgba(59,130,246,0.12), 0 0 40px 4px rgba(59,130,246,0.06)' }}>
              <div className="relative">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="inline-flex h-5 items-center justify-center rounded-full bg-blue-500/20 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-blue-500 border border-blue-500/25">
                    Fastest Sign In
                  </span>
                  <span className="text-[11px] font-semibold text-foreground/90 uppercase tracking-wider">
                    Sign In Instantly with Google
                  </span>
                </div>
                
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                  If you've already synced or registered your clinical workspace with Google, bypass the form and sign in instantly with single-click OAuth.
                </p>

                <div className="mt-4">
                  <GoogleSignInButton label="Fast-Track Sign in with Google" />
                </div>
              </div>
            </div>

            <h1 className="font-display text-4xl tracking-tight">Sign in</h1>
            <p className="mt-2 text-muted-foreground">
              Welcome back. Continue where you left off.
            </p>

            {/* Verified-clinician reassurance — both methods work post-verification */}
            <div className="mt-5 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-tier-nvidia-soft border border-tier-nvidia-border/60 text-tier-nvidia-foreground">
              <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2.4} />
              <span className="text-xs font-medium">
                Verified clinicians can sign in with email or Google
              </span>
            </div>

            {/* Biometric quick sign-in (only shown if previously enrolled on this device) */}
            <div className="mt-6">
              <BiometricSignIn onSuccess={continueToApp} />
            </div>

            {signedInEmail && (
              <div className="mt-6 space-y-3">
                <BiometricSetup email={signedInEmail} onDone={continueToApp} />
                <Button
                  variant="ghost"
                  onClick={continueToApp}
                  className="w-full text-xs text-muted-foreground"
                >
                  Skip and continue
                </Button>
              </div>
            )}

            <form onSubmit={onSubmit} className={"mt-8 space-y-4 " + (signedInEmail ? "hidden" : "")}>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="h-11 bg-surface-raised"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <button
                    type="button"
                    onClick={onForgot}
                    className="text-xs text-muted-foreground hover:text-primary"
                  >
                    Forgot?
                  </button>
                </div>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="h-11 bg-surface-raised"
                />
              </div>
              <Button
                type="submit"
                disabled={busy}
                className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
              </Button>
            </form>

            {/* Premium Glowing Free Camp Access Code Card */}
            <div className="mt-6 relative overflow-hidden rounded-xl border-2 border-emerald-500/35 bg-gradient-to-br from-emerald-500/8 via-emerald-500/3 to-transparent p-5 text-left"
                 style={{ boxShadow: '0 0 15px 1px rgba(16,185,129,0.14), 0 0 30px 3px rgba(16,185,129,0.06)' }}>
              <div className="relative">
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex h-5 items-center justify-center rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-500 border border-emerald-500/25">
                    Camp Special
                  </span>
                  <span className="text-[11px] font-semibold text-emerald-500/90 uppercase tracking-wider">
                    Have a free camp access code?
                  </span>
                </div>
                
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                  Camp doctors only: redeem your access code below. No Google step required — your code is your verification.
                </p>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCodeOpen(true)}
                  className="mt-4 w-full h-10 gap-2 border-emerald-500/30 bg-background/80 hover:bg-emerald-500/10 text-xs font-bold text-foreground transition-all duration-300"
                >
                  <KeyRound className="h-4 w-4 text-emerald-500 animate-pulse" />
                  Redeem access code
                </Button>
              </div>
            </div>

          </motion.div>
        </div>
      </div>

      {/* Right: Modern Clinic Spotlight Glow (Vibrant Sky Blue & Interactive Follow) */}
      <div 
        onPointerMove={handlePointerMove}
        onPointerEnter={() => setIsPointerActive(true)}
        onPointerLeave={() => {
          setIsPointerActive(false);
          setPointerCoords({ x: 50, y: 50 }); // Reset to center
        }}
        className="hidden lg:block relative overflow-hidden bg-[#050c1e] border-l border-blue-900/30 cursor-crosshair select-none"
      >
        {/* Soft sky-blue/cyan atmospheric gradient */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(14,165,233,0.35)_0%,rgba(5,12,30,0)_65%)]" />
        
        {/* Neon Pink/Rose center bottom glow */}
        <div className="absolute bottom-[-100px] left-1/2 -translate-x-1/2 w-[350px] h-[350px] rounded-full bg-pink-500/25 blur-[100px] mix-blend-screen pointer-events-none" />

        {/* Dynamic Interactive Pointer Flare (follows finger or cursor smoothly) */}
        {isPointerActive && (
          <div
            className="absolute rounded-full bg-cyan-400/25 blur-[70px] pointer-events-none transition-all duration-150 ease-out"
            style={{
              left: `${pointerCoords.x}%`,
              top: `${pointerCoords.y}%`,
              width: '240px',
              height: '240px',
              transform: 'translate(-50%, -50%)'
            }}
          />
        )}

        {/* Diagonal Glowing Spotlight Cones (Windsurf / modern tech style) */}
        {/* Note: The spotlight angles lean dynamically towards the pointer coordinate! */}
        {(() => {
          const tiltAngle = (pointerCoords.x - 50) * 0.22; // leaning range from -11deg to +11deg
          return (
            <div className="absolute inset-0 pointer-events-none opacity-90 transition-transform duration-300 ease-out">
              {/* Left sweeping cone */}
              <div 
                className="absolute bottom-[-100px] left-[-15%] w-[40%] h-[120%] bg-gradient-to-t from-sky-500/30 via-cyan-500/5 to-transparent blur-[45px] origin-bottom transition-all duration-300 ease-out"
                style={{ transform: `rotate(${-35 + tiltAngle}deg)` }}
              />
              
              {/* Middle-left cone */}
              <div 
                className="absolute bottom-[-100px] left-[15%] w-[35%] h-[120%] bg-gradient-to-t from-sky-400/35 via-cyan-400/5 to-transparent blur-[35px] origin-bottom transition-all duration-300 ease-out"
                style={{ transform: `rotate(${-12 + tiltAngle}deg)` }}
              />

              {/* Middle-right cone */}
              <div 
                className="absolute bottom-[-100px] right-[15%] w-[35%] h-[120%] bg-gradient-to-t from-sky-400/35 via-cyan-400/5 to-transparent blur-[35px] origin-bottom transition-all duration-300 ease-out"
                style={{ transform: `rotate(${12 + tiltAngle}deg)` }}
              />

              {/* Right sweeping cone */}
              <div 
                className="absolute bottom-[-100px] right-[-15%] w-[40%] h-[120%] bg-gradient-to-t from-sky-500/30 via-cyan-500/5 to-transparent blur-[45px] origin-bottom transition-all duration-300 ease-out"
                style={{ transform: `rotate(${35 + tiltAngle}deg)` }}
              />
            </div>
          );
        })()}
      </div>

      <AccessCodeDialog open={codeOpen} onOpenChange={setCodeOpen} />

      {/* Workspace Type Selector Dialog */}
      <Dialog 
        open={workspaceOpen} 
        onOpenChange={(open) => {
          setWorkspaceOpen(open);
          if (!open) {
            // Reset state on close
            setTimeout(() => {
              setDialogStep("select");
              setLabPhone("");
              setLabEmail("");
              setCertificateFile(null);
            }, 300);
          }
        }}
      >
        <DialogContent className="sm:max-w-[550px] p-0 overflow-hidden bg-background border-border text-foreground backdrop-blur-xl shadow-2xl transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent pointer-events-none" />
          
          {dialogStep === "select" && (
            <>
              <div className="px-6 pt-8 pb-5 text-center relative border-b border-border/60">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4 border border-primary/20 animate-pulse">
                  <Sparkles className="h-6 w-6" />
                </div>
                <DialogTitle className="font-display text-2xl tracking-tight text-foreground">
                  Create Your Workspace
                </DialogTitle>
                <DialogDescription className="text-muted-foreground mt-2 text-sm max-w-md mx-auto leading-relaxed">
                  Select the option that best fits your clinical and diagnostic setup to get started.
                </DialogDescription>
              </div>

              <div className="p-6 space-y-4 relative">
                {/* OPTION 1: ENTER AS DOCTOR */}
                <button
                  onClick={() => {
                    setWorkspaceOpen(false);
                    navigate("/signup?role=doctor");
                  }}
                  className="group relative w-full text-left flex items-start gap-4 p-4 rounded-xl border border-border/60 bg-card/40 transition-all duration-300 hover:bg-card/90 hover:border-blue-500/50 hover:shadow-[0_0_20px_rgba(59,130,246,0.12)]"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500 transition-colors group-hover:bg-blue-500/20 border border-blue-500/20">
                    <Stethoscope className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" />
                  </div>
                  <div className="flex-1 min-w-0 pr-2">
                    <h3 className="text-sm font-bold tracking-wider uppercase group-hover:text-blue-500 transition-colors">
                      Enter as Doctor
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Individual clinical AI imaging co-pilot. Analyze cases, write diagnostic reports, and manage medical summaries.
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground self-center opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-[-4px] group-hover:translate-x-0 group-hover:text-blue-500" />
                </button>

                {/* OPTION 2: ENTER AS SCANNING CENTER / LABS / HOSPITAL */}
                <button
                  onClick={() => {
                    setLabFormType("hospital");
                    setDialogStep("labForm");
                  }}
                  className="group relative w-full text-left flex items-start gap-4 p-4 rounded-xl border border-border/60 bg-card/40 transition-all duration-300 hover:bg-card/90 hover:border-indigo-500/50 hover:shadow-[0_0_20px_rgba(99,102,241,0.12)]"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500 transition-colors group-hover:bg-indigo-500/20 border border-indigo-500/20">
                    <Server className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" />
                  </div>
                  <div className="flex-1 min-w-0 pr-2">
                    <h3 className="text-sm font-bold tracking-wider uppercase group-hover:text-indigo-500 transition-colors">
                      Enter as Scanning Center/Labs/Hospital with PACS
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Integrate diagnostic imaging modalities and DICOM PACS networks. High-throughput server automation and hospital-grade worklists.
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground self-center opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-[-4px] group-hover:translate-x-0 group-hover:text-indigo-500" />
                </button>

                {/* OPTION 3: ENTER AS RADIOLOGIST FOR COLLABORATION */}
                <button
                  onClick={() => {
                    setLabFormType("radiologist");
                    setDialogStep("labForm");
                  }}
                  className="group relative w-full text-left flex items-start gap-4 p-4 rounded-xl border border-border/60 bg-card/40 transition-all duration-300 hover:bg-card/90 hover:border-purple-500/50 hover:shadow-[0_0_20px_rgba(168,85,247,0.12)]"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500 transition-colors group-hover:bg-purple-500/20 border border-purple-500/20">
                    <Users className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" />
                  </div>
                  <div className="flex-1 min-w-0 pr-2">
                    <h3 className="text-sm font-bold tracking-wider uppercase group-hover:text-purple-500 transition-colors">
                      Enter as Radiologist for Collaboration
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Teleradiology workgroup & multi-reader diagnostics. Instant remote reporting and secure peer review networks.
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground self-center opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-[-4px] group-hover:translate-x-0 group-hover:text-purple-500" />
                </button>
              </div>

              <div className="px-6 py-4 bg-muted/30 border-t border-border/60 flex items-center justify-center">
                <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">
                  Trusted Clinician-First Network · NMC / AYUSH Compliant
                </span>
              </div>
            </>
          )}

          {dialogStep === "labForm" && (
            <form onSubmit={handleLabSubmit} className="relative">
              <div className="px-6 pt-7 pb-5 border-b border-border/60 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setDialogStep("select")}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
                >
                  <ArrowLeft className="h-4.5 w-4.5" />
                </button>
                <div>
                  <DialogTitle className="font-display text-xl tracking-tight">
                    {labFormType === "hospital" ? "Verify Your Scanning Center / Lab" : "Verify Your Radiologist Credentials"}
                  </DialogTitle>
                  <DialogDescription className="text-muted-foreground text-xs mt-0.5">
                    {labFormType === "hospital" 
                      ? "Activate your high-performance enterprise PACS-connected workspace." 
                      : "Activate your collaborative multi-reader diagnostics workspace."}
                  </DialogDescription>
                </div>
              </div>

              <div className="p-6 space-y-4">
                {/* Certificate File Upload Dropzone */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {labFormType === "hospital" 
                      ? "Upload valid registration certificate of lab / scanning center / hospital" 
                      : "Upload proof of radiologist (e.g. registration certificate, degree, or ID card) — Optional"}
                  </label>
                  <div className="relative">
                    <input
                      type="file"
                      id="labCert"
                      accept=".pdf,.jpg,.jpeg,.png"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setCertificateFile(file);
                      }}
                    />
                    {certificateFile ? (
                      <div className="flex items-center justify-between border border-primary/30 bg-primary/5 rounded-xl p-3.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 rounded-lg bg-primary/15 text-primary">
                            <Upload className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold truncate text-foreground">
                              {certificateFile.name}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {(certificateFile.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setCertificateFile(null)}
                          className="text-xs font-bold text-warning-critical-foreground hover:underline px-2 py-1"
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      <label
                        htmlFor="labCert"
                        className="group flex flex-col items-center justify-center border-2 border-dashed border-border hover:border-primary/50 rounded-xl p-6 text-center cursor-pointer transition-all bg-card/30 hover:bg-card/60"
                      >
                        <Upload className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors mb-2" />
                        <span className="text-xs font-bold text-foreground">
                          {labFormType === "hospital" ? "Click to upload certificate" : "Click to upload proof (optional)"}
                        </span>
                        <span className="text-[10px] text-muted-foreground mt-1">
                          {labFormType === "hospital" ? "Supports PDF, JPG, PNG (Max 20MB)" : "Supports PDF, JPG, PNG (Max 20MB) — Optional"}
                        </span>
                      </label>
                    )}
                  </div>
                </div>

                {/* Contact Phone Number */}
                <div className="space-y-1.5">
                  <label htmlFor="labPhone" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Your contact phone number
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="labPhone"
                      type="tel"
                      required
                      placeholder="+91 98765 43210"
                      value={labPhone}
                      onChange={(e) => setLabPhone(e.target.value)}
                      className="pl-10 h-11 bg-card border-border/80 focus-ring"
                    />
                  </div>
                </div>

                {/* Contact Gmail Address */}
                <div className="space-y-1.5">
                  <label htmlFor="labEmail" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Contact Gmail address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="labEmail"
                      type="email"
                      required
                      placeholder="yourname@gmail.com"
                      value={labEmail}
                      onChange={(e) => setLabEmail(e.target.value)}
                      className="pl-10 h-11 bg-card border-border/80 focus-ring"
                    />
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 bg-muted/30 border-t border-border/60 flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setDialogStep("select")}
                  className="h-10 text-xs"
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  disabled={submittingLab}
                  className="h-10 text-xs px-5 bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-lg shadow-primary/10"
                >
                  {submittingLab ? (
                    <>
                      <Loader2 className="h-4.5 w-4.5 animate-spin mr-1.5" />
                      Registering...
                    </>
                  ) : (
                    "Register Workspace"
                  )}
                </Button>
              </div>
            </form>
          )}

          {dialogStep === "success" && (
            <div className="p-8 text-center relative flex flex-col items-center">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 mb-5 border border-emerald-500/25 animate-bounce">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <DialogTitle className="font-display text-2xl tracking-tight">
                Request Received!
              </DialogTitle>
              <div className="mt-4 space-y-3.5 text-sm max-w-sm leading-relaxed text-muted-foreground">
                <p>
                  Our AI assistant will call you soon or our team within 24 hours.
                </p>
                <p className="font-semibold text-foreground">
                  Thank you for choosing Manthana‑Labs.
                </p>
                <p className="text-xs bg-primary/5 text-primary border border-primary/10 rounded-lg p-2.5">
                  We are committed to providing you with the absolute best service.
                </p>
              </div>
              <Button
                onClick={() => {
                  setWorkspaceOpen(false);
                  setTimeout(() => {
                    setDialogStep("select");
                    setLabPhone("");
                    setLabEmail("");
                    setCertificateFile(null);
                  }, 300);
                }}
                className="mt-7 w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
              >
                Got it
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Login;
