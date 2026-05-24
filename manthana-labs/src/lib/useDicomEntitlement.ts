import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePlan, type PlanCode } from "./usePlan";

export type ProfessionalRole =
  | "radiologist"
  | "hospital"
  | "nursing_home"
  | "clinician_general"
  | "other";

const ELIGIBLE_PLANS: PlanCode[] = ["pro_plus", "enterprise"];
const ELIGIBLE_ROLES: ProfessionalRole[] = [
  "radiologist",
  "hospital",
  "nursing_home",
];

/**
 * Pro+/Enterprise + radiologist/hospital/nursing_home gate for the DICOM /
 * PACS bridge. Other users see the feature in a *locked teaser* state — never
 * a 404 — so they can discover it and upgrade. Server-side functions also
 * re-validate this entitlement; UI checks are advisory.
 */
export interface DicomEntitlement {
  loading: boolean;
  plan: PlanCode;
  role: ProfessionalRole;
  /** True iff plan + role both eligible. */
  allowed: boolean;
  /** True for Pro+ / Enterprise (regardless of role) — gates billing UI copy. */
  planEligible: boolean;
  /** True for radiologist / hospital / nursing_home. */
  roleEligible: boolean;
  /** Human-readable reason when not allowed (shown in lock badges). */
  reason?: string;
}

export function useDicomEntitlement(): DicomEntitlement {
  const { plan, loading: planLoading } = usePlan();
  const [role, setRole] = useState<ProfessionalRole>("other");
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id;
      if (!uid) {
        if (!cancelled) {
          setRole("other");
          setRoleLoading(false);
        }
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("professional_role")
        .eq("id", uid)
        .maybeSingle();
      if (cancelled) return;
      const r = (data as { professional_role?: ProfessionalRole } | null)
        ?.professional_role;
      setRole(r ?? "other");
      setRoleLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const planEligible = ELIGIBLE_PLANS.includes(plan);
  const roleEligible = ELIGIBLE_ROLES.includes(role);
  const allowed = planEligible && roleEligible;

  let reason: string | undefined;
  if (!planEligible && !roleEligible) {
    reason = "Available on Pro+ / Enterprise for radiologists and hospitals.";
  } else if (!planEligible) {
    reason = "Upgrade to Pro+ or Enterprise to unlock the PACS bridge.";
  } else if (!roleEligible) {
    reason = "Set your role to Radiologist, Hospital, or Nursing home in Settings.";
  }

  return {
    loading: planLoading || roleLoading,
    plan,
    role,
    allowed,
    planEligible,
    roleEligible,
    reason,
  };
}
