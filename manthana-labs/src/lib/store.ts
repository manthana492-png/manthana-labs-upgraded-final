import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DoctorProfile, Study, Report, Finding } from "./types";
import { supabase } from "@/integrations/supabase/client";

// ─────────────── Versioned attestation ───────────────
// Bump whenever the disclaimer text changes — doctors will be required
// to re-accept on next sign-in.
export const ATTESTATION_VERSION = "2025.04";

interface AuthState {
  doctor: DoctorProfile | null;
  attestedAt: string | null;
  attestedVersion: string | null;
  /** Hydrate doctor + attestation status from Supabase session. */
  hydrateFromSession: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<DoctorProfile>;
  signUp: (data: Omit<DoctorProfile, "attestedAt"> & { password: string }) => Promise<DoctorProfile>;
  signOut: () => Promise<void>;
  acceptAttestation: () => Promise<void>;
  /** True if the doctor has attested to the current ATTESTATION_VERSION. */
  isAttestationCurrent: () => boolean;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      doctor: null,
      attestedAt: null,
      attestedVersion: null,

      hydrateFromSession: async () => {
        const { data } = await supabase.auth.getSession();
        const user = data.session?.user;
        if (!user) {
          set({ doctor: null, attestedAt: null, attestedVersion: null });
          return;
        }

        // Check for fast track Google OAuth onboarding metadata in localStorage
        const fastTrackRaw = localStorage.getItem("manthana_fast_track");
        if (fastTrackRaw) {
          try {
            // Remove the item immediately to prevent concurrent re-entrancy / infinite loops
            localStorage.removeItem("manthana_fast_track");
            
            const fastTrack = JSON.parse(fastTrackRaw);
            // 1. Update the profile row that was created via OAuth with custom name and registration details.
            await supabase
              .from("profiles")
              .update({
                full_name: fastTrack.fullName,
                council_number: fastTrack.councilNumber,
              })
              .eq("id", user.id);

            // 2. Attach the user's custom password if provided (for accessing their personal workspace)
            if (fastTrack.password) {
              await supabase.auth.updateUser({ password: fastTrack.password });
            }
          } catch (err) {
            console.error("[Auth] Fast track hydration failed", err);
          }
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, email, council_number, specialty, system, council_body, council_state, council_year, verification_status")
          .eq("id", user.id)
          .maybeSingle();
        const doctor: DoctorProfile = {
          fullName: profile?.full_name ?? user.email ?? "Clinician",
          email: profile?.email ?? user.email ?? "",
          councilNumber: profile?.council_number ?? "",
          specialty: profile?.specialty ?? undefined,
          system: profile?.system ?? undefined,
          councilBody: profile?.council_body ?? undefined,
          councilState: profile?.council_state ?? undefined,
          councilYear: profile?.council_year ?? undefined,
          verificationStatus: profile?.verification_status ?? undefined,
        };
        const { data: latestAttest } = await supabase
          .from("attestations")
          .select("version, accepted_at")
          .eq("user_id", user.id)
          .order("accepted_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        set({
          doctor,
          attestedAt: latestAttest?.accepted_at ?? null,
          attestedVersion: latestAttest?.version ?? null,
        });
      },

      signIn: async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error || !data.user) throw error ?? new Error("Sign-in failed");
        await get().hydrateFromSession();
        const d = get().doctor;
        if (!d) throw new Error("Profile missing");
        return d;
      },

      signUp: async ({ password, ...profileData }) => {
        const redirectUrl = `${window.location.origin}/attestation`;
        const { data, error } = await supabase.auth.signUp({
          email: profileData.email,
          password,
          options: {
            emailRedirectTo: redirectUrl,
            data: {
              full_name: profileData.fullName,
              council_number: profileData.councilNumber,
              specialty: profileData.specialty,
              system: profileData.system,
              council_body: profileData.councilBody,
              council_state: profileData.councilState,
              council_year: profileData.councilYear ? String(profileData.councilYear) : undefined,
            },
          },
        });
        if (error || !data.user) throw error ?? new Error("Sign-up failed");
        // Trigger creates the profile row; hydrate now.
        await get().hydrateFromSession();
        return profileData;
      },

      signOut: async () => {
        await supabase.auth.signOut();
        set({ doctor: null, attestedAt: null, attestedVersion: null });
      },

      acceptAttestation: async () => {
        const { data: sess } = await supabase.auth.getSession();
        const userId = sess.session?.user?.id;
        const acceptedAt = new Date().toISOString();
        if (userId) {
          await supabase.from("attestations").insert({
            user_id: userId,
            version: ATTESTATION_VERSION,
            user_agent: navigator.userAgent.slice(0, 500),
          });
          await supabase.from("audit_log").insert({
            user_id: userId,
            actor_email: sess.session?.user?.email ?? null,
            action: "attestation.accept",
            entity_type: "attestation",
            entity_id: ATTESTATION_VERSION,
            metadata: { accepted_at: acceptedAt },
            user_agent: navigator.userAgent.slice(0, 500),
          });
        }
        set({ attestedAt: acceptedAt, attestedVersion: ATTESTATION_VERSION });
      },

      isAttestationCurrent: () => {
        const s = get();
        return !!s.attestedAt && s.attestedVersion === ATTESTATION_VERSION;
      },
    }),
    { name: "manthana.auth" },
  ),
);

// Keep zustand in sync with auth state changes (sign-in / sign-out from elsewhere).
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    useAuth.setState({ doctor: null, attestedAt: null, attestedVersion: null });
  } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
    // Defer to avoid recursion within the listener.
    setTimeout(() => { useAuth.getState().hydrateFromSession(); }, 0);
  }
});

// ─────────────── Studies ───────────────
interface StudiesState {
  studies: Study[];
  draft: Partial<Study> | null;
  beginDraft: (s: Partial<Study>) => void;
  updateDraft: (s: Partial<Study>) => void;
  commitDraft: (study: Study) => void;
  clearDraft: () => void;
  setReport: (id: string, report: Report) => void;
  /** Local-only review confirmation (kept for offline / legacy). Prefer
   * confirmReviewRemote() from studyApi for production confirmation. */
  confirmReview: (id: string, note?: string) => void;
  /** Idempotent merge from server response into the local cache. */
  upsertStudy: (study: Study) => void;
  /** Patch status/progress/error from Realtime updates. */
  patchStudyStatus: (
    id: string,
    patch: { status?: Study["status"]; progress?: Record<string, unknown>; errorMessage?: string | null },
  ) => void;
  /** ACR critical-finding acknowledgment (callback target = referrer / patient / OPD) */
  acknowledgeCritical: (id: string, callbackTarget: string, doctorName: string) => void;
  /** Urgency escalation acknowledgment for urgent / stat findings */
  acknowledgeEscalation: (
    studyId: string,
    findingId: string,
    payload: { callbackTarget: string; communicationNote: string; doctorName: string },
  ) => void;
  /** Update a single finding's medical codes (ICD-10 / SNOMED). */
  updateFindingCodes: (
    studyId: string,
    findingId: string,
    codes: Partial<Pick<Finding, "icd10Code" | "icd10Label" | "snomedCode" | "snomedLabel">>,
  ) => void;
  /** Set the AI-generated patient summary on a study. */
  setPatientSummary: (studyId: string, summary: string) => void;
  /** Replace a study's report wholesale (used by doctor edit + lock). */
  replaceReport: (studyId: string, report: Report, opts?: { editedByDoctor?: boolean; locked?: boolean }) => void;
}

export const useStudies = create<StudiesState>()(
  persist(
    (set) => ({
      studies: [],
      draft: null,
      beginDraft: (s) => set({ draft: s }),
      updateDraft: (s) => set((st) => ({ draft: { ...(st.draft ?? {}), ...s } })),
      commitDraft: (study) =>
        set((st) => ({
          studies: [study, ...st.studies.filter((x) => x.id !== study.id)],
        })),
      clearDraft: () => set({ draft: null }),
      setReport: (id, report) =>
        set((st) => ({
          studies: st.studies.map((s) =>
            s.id === id ? { ...s, report, status: "awaiting_review" } : s,
          ),
        })),
      confirmReview: (id, note) =>
        set((st) => ({
          studies: st.studies.map((s) =>
            s.id === id
              ? {
                  ...s,
                  status: "delivered",
                  reviewConfirmedAt: new Date().toISOString(),
                  reviewingDoctorNote: note,
                }
              : s,
          ),
        })),
      upsertStudy: (study) =>
        set((st) => {
          const existing = st.studies.find((s) => s.id === study.id);
          // Preserve preview assets (object URLs) — they aren't on the server.
          const merged: Study = existing
            ? { ...existing, ...study, previewAssets: existing.previewAssets ?? study.previewAssets }
            : study;
          return {
            studies: [merged, ...st.studies.filter((s) => s.id !== study.id)],
          };
        }),
      patchStudyStatus: (id, patch) =>
        set((st) => ({
          studies: st.studies.map((s) =>
            s.id === id
              ? {
                  ...s,
                  status: (patch.status ?? s.status) as Study["status"],
                }
              : s,
          ),
        })),
      acknowledgeCritical: (id, callbackTarget, doctorName) =>
        set((st) => ({
          studies: st.studies.map((s) =>
            s.id === id && s.report
              ? {
                  ...s,
                  report: {
                    ...s.report,
                    criticalAcknowledgedAt: new Date().toISOString(),
                    criticalAcknowledgedBy: doctorName,
                    criticalCallbackTarget: callbackTarget,
                  },
                }
              : s,
          ),
        })),
      acknowledgeEscalation: (studyId, findingId, { callbackTarget, communicationNote, doctorName }) =>
        set((st) => ({
          studies: st.studies.map((s) =>
            s.id === studyId && s.report
              ? {
                  ...s,
                  report: {
                    ...s.report,
                    findings: s.report.findings.map((f) =>
                      f.id === findingId
                        ? {
                            ...f,
                            escalationAcknowledged: true,
                            escalationCallbackTarget: callbackTarget,
                            escalationCommunicationNote: communicationNote,
                            escalationAcknowledgedAt: new Date().toISOString(),
                            escalationAcknowledgedBy: doctorName,
                          }
                        : f,
                    ),
                  },
                }
              : s,
          ),
        })),
      updateFindingCodes: (studyId, findingId, codes) =>
        set((st) => ({
          studies: st.studies.map((s) =>
            s.id === studyId && s.report
              ? {
                  ...s,
                  report: {
                    ...s.report,
                    findings: s.report.findings.map((f) =>
                      f.id === findingId ? { ...f, ...codes } : f,
                    ),
                  },
                }
              : s,
          ),
        })),
      setPatientSummary: (studyId, summary) =>
        set((st) => ({
          studies: st.studies.map((s) =>
            s.id === studyId && s.report
              ? { ...s, report: { ...s.report, patientSummary: summary } }
              : s,
          ),
        })),
      replaceReport: (studyId, report, opts) =>
        set((st) => ({
          studies: st.studies.map((s) =>
            s.id === studyId
              ? {
                  ...s,
                  report,
                  editedByDoctor: opts?.editedByDoctor ?? s.editedByDoctor,
                  reportLocked: opts?.locked ?? s.reportLocked,
                }
              : s,
          ),
        })),
    }),
    { name: "manthana.studies" },
  ),
);

// ─────────────── Incident reports (model feedback) ───────────────
// Mirrors to Cloud `model_feedback` table in addition to local cache.
export interface IncidentReport {
  id: string;
  studyId: string;
  findingId?: string;
  reason: "incorrect_finding" | "missed_finding" | "wrong_severity" | "wrong_recommendation" | "other";
  detail: string;
  doctorName?: string;
  reportedAt: string;
}

interface FeedbackState {
  incidents: IncidentReport[];
  fileIncident: (i: Omit<IncidentReport, "id" | "reportedAt">) => Promise<void>;
}

export const useFeedback = create<FeedbackState>()(
  persist(
    (set) => ({
      incidents: [],
      fileIncident: async (i) => {
        const local: IncidentReport = {
          ...i,
          id: `inc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          reportedAt: new Date().toISOString(),
        };
        set((st) => ({ incidents: [local, ...st.incidents] }));
        // Best-effort persist to Cloud.
        try {
          const { data: sess } = await supabase.auth.getSession();
          const userId = sess.session?.user?.id;
          if (userId) {
            await supabase.from("model_feedback").insert({
              user_id: userId,
              study_id: null,
              finding_id: null,
              reason: i.reason,
              detail: i.detail,
              doctor_name: i.doctorName ?? null,
            });
          }
        } catch (err) {
          console.warn("Could not sync incident to cloud:", err);
        }
      },
    }),
    { name: "manthana.feedback" },
  ),
);
