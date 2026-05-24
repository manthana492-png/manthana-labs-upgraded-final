import { supabase } from "@/integrations/supabase/client";
import type { Report } from "./types";

/**
 * Persist a doctor-edited report. On first edit, snapshots the AI's
 * original report into `original_report` so it remains retrievable.
 */
export async function saveEditedReport(
  studyId: string,
  editedReport: Report,
): Promise<void> {
  // Read current state to know whether we need to snapshot.
  const { data: current, error: readErr } = await supabase
    .from("studies")
    .select("report, original_report, edited_by_doctor, report_locked")
    .eq("id", studyId)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!current) throw new Error("Study not found");
  if (current.report_locked) throw new Error("Report is locked (signed). Edits are not allowed.");

  const shouldSnapshot =
    !current.edited_by_doctor && !current.original_report && !!current.report;
  const patch = {
    report: editedReport as unknown as never,
    edited_by_doctor: true,
    edited_at: new Date().toISOString(),
    ...(shouldSnapshot ? { original_report: current.report as unknown as never } : {}),
  };
  const { error } = await supabase.from("studies").update(patch).eq("id", studyId);
  if (error) throw error;

  // Audit
  try {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user?.id;
    if (uid) {
      await supabase.from("audit_log").insert({
        user_id: uid,
        actor_email: sess.session?.user?.email ?? null,
        action: "report.edit",
        entity_type: "study",
        entity_id: studyId,
        metadata: { findings_count: editedReport.findings.length },
      });
    }
  } catch {
    // best-effort
  }
}

/** Lock the report after signing — no further edits permitted. */
export async function lockReport(studyId: string): Promise<void> {
  const { error } = await supabase
    .from("studies")
    .update({ report_locked: true })
    .eq("id", studyId);
  if (error) throw error;
}
