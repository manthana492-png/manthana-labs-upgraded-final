import { ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth, ATTESTATION_VERSION } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { MfaChallenge } from "./MfaChallenge";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { doctor, attestedAt, attestedVersion, hydrateFromSession } = useAuth();
  const location = useLocation();
  const [hydrated, setHydrated] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaChecked, setMfaChecked] = useState(false);

  useEffect(() => {
    (async () => {
      await hydrateFromSession();
      try {
        const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (data && data.nextLevel === "aal2" && data.currentLevel !== "aal2") {
          setMfaRequired(true);
        }
      } catch { /* noop */ }
      setMfaChecked(true);
      setHydrated(true);
    })();
  }, [hydrateFromSession]);

  if (!hydrated || !mfaChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (!doctor) return <Navigate to="/login" state={{ from: location }} replace />;
  if (mfaRequired) return <MfaChallenge onVerified={() => setMfaRequired(false)} />;
  if (!attestedAt || attestedVersion !== ATTESTATION_VERSION) {
    return <Navigate to="/attestation" replace />;
  }
  return <>{children}</>;
}
