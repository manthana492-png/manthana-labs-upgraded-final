import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth, ATTESTATION_VERSION } from "@/lib/store";
import { ShieldCheck, ArrowRight, RefreshCcw } from "lucide-react";

const ATTESTATION = [
  {
    h: "I am a licensed clinician.",
    p: "I confirm I am qualified, currently registered with a recognized medical council in India, and I am authorized to use medical AI software in my practice.",
  },
  {
    h: "Manthana‑Labs is decision support — not a diagnosis.",
    p: "I understand all outputs are advisory. I will independently review every finding and exercise my own clinical judgment before any patient action.",
  },
  {
    h: "Manthana‑Labs is AI-assisted decision support.",
    p: "I acknowledge that all analyses are AI-assisted and are not regulated medical devices. I will type a clinical impression before downloading or sharing any report.",
  },
  {
    h: "I will protect patient data.",
    p: "I will not upload PHI beyond what is operationally required and I will follow my institution's privacy and DPDP obligations. Patient identifiers must be removed from filenames and metadata.",
  },
  {
    h: "Audit and accountability.",
    p: "All my reviews and approvals are logged. I accept that my acceptance of each report is binding and traceable.",
  },
];

const Attestation = () => {
  const navigate = useNavigate();
  const { doctor, attestedAt, attestedVersion, acceptAttestation } = useAuth();
  const [reachedEnd, setReachedEnd] = useState(false);
  const [agree, setAgree] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // True when the doctor previously accepted an OLDER version — we ask them
  // to re-accept the updated terms.
  const isReAccept = !!attestedAt && attestedVersion !== ATTESTATION_VERSION;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setReachedEnd(true);
    };
    el.addEventListener("scroll", onScroll);
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  if (!doctor) return <Navigate to="/login" replace />;
  if (attestedAt && attestedVersion === ATTESTATION_VERSION) return <Navigate to="/app" replace />;

  const onAccept = async () => {
    await acceptAttestation();
    navigate("/app", { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-paper flex flex-col">
      <header className="container flex h-16 items-center justify-between">
        <Logo />
        <div className="text-xs text-muted-foreground hidden sm:block font-mono">
          v{ATTESTATION_VERSION} · Required on first sign-in
        </div>
      </header>

      <main className="container max-w-3xl flex-1 py-6 md:py-12">
        {isReAccept && (
          <div className="mb-5 rounded-lg border border-warning-critical-border/60 bg-warning-critical-soft text-warning-critical-foreground p-4 flex items-start gap-3">
            <RefreshCcw className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="text-sm">
              <div className="font-medium">Disclaimer updated to v{ATTESTATION_VERSION}.</div>
              <div className="text-xs mt-0.5 opacity-80">
                You previously accepted v{attestedVersion ?? "earlier"} — please re-read and re-accept the current terms to continue.
              </div>
            </div>
          </div>
        )}
        <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full bg-accent text-accent-foreground">
          <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2.4} />
          <span className="text-xs font-medium">Clinician attestation · v{ATTESTATION_VERSION}</span>
        </div>
        <h1 className="font-display text-3xl md:text-5xl tracking-tight">
          {isReAccept ? "Please re-accept the updated terms." : "Before you begin, please read and accept."}
        </h1>
        <p className="mt-2 text-muted-foreground text-pretty">
          Manthana‑Labs is a co-pilot, not a replacement. Your acceptance below is recorded in our audit log
          with the disclaimer version, your IP, and a timestamp.
        </p>

        <div className="mt-8 surface-clinical overflow-hidden">
          <div
            ref={scrollRef}
            className="max-h-[50vh] overflow-y-auto scrollbar-thin p-6 md:p-8 space-y-6"
          >
            {ATTESTATION.map((item, i) => (
              <div key={i} className="flex gap-4">
                <div className="shrink-0 mt-0.5 h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold font-mono">
                  {i + 1}
                </div>
                <div>
                  <h3 className="font-display text-lg tracking-tight">{item.h}</h3>
                  <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{item.p}</p>
                </div>
              </div>
            ))}
            <div className="text-xs text-muted-foreground pt-4 border-t border-border">
              Signing as <span className="font-medium text-foreground">{doctor.fullName}</span> ·
              council <span className="font-mono">{doctor.councilNumber}</span> · IP and timestamp
              recorded on submission.
            </div>
          </div>

          <div className="border-t border-border bg-surface px-6 md:px-8 py-5">
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={agree}
                onCheckedChange={(v) => setAgree(Boolean(v))}
                disabled={!reachedEnd}
                className="mt-0.5"
              />
              <span className={"text-sm " + (!reachedEnd ? "text-muted-foreground" : "")}>
                I have read all five clauses above and I accept the clinician-use terms.
                {!reachedEnd && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    (Scroll to the end to enable.)
                  </span>
                )}
              </span>
            </label>

            <div className="mt-5 flex justify-end">
              <Button
                onClick={onAccept}
                disabled={!agree}
                className="bg-primary hover:bg-primary/90 disabled:opacity-50"
              >
                Accept &amp; enter the studio
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Attestation;
