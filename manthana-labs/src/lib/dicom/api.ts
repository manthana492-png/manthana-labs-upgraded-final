import { supabase } from "@/integrations/supabase/client";

export interface DicomIngestResult {
  studyId: string;
  acceptedFiles: number;
  rejectedFiles: number;
  studyInstanceUID?: string;
  modality?: string;
}

export interface HospitalConnection {
  id: string;
  name: string;
  pacs_stow_url: string | null;
  pacs_qido_url: string | null;
  pacs_auth_header: string | null;
  ris_fhir_base_url: string | null;
  ris_auth_header: string | null;
  ae_title: string | null;
  inbound_token: string;
  pacs_open_url_template: string | null;
  enabled: boolean;
  verified_at: string | null;
  last_push_at: string | null;
  created_at: string;
}

export interface DicomExportRow {
  id: string;
  kind: "sr" | "pdf" | "sc" | "fhir";
  status: "pending" | "success" | "error";
  target_url: string | null;
  response_code: number | null;
  error: string | null;
  sop_instance_uid: string | null;
  created_at: string;
}

/** Upload one or more `.dcm` files for ingestion + analysis. */
export async function ingestDicomFiles(opts: {
  files: File[];
  patientRefShort?: string;
}): Promise<DicomIngestResult> {
  const fd = new FormData();
  if (opts.patientRefShort) fd.append("patient_ref_short", opts.patientRefShort);
  for (const f of opts.files) fd.append("files", f, f.name);
  const { data, error } = await supabase.functions.invoke("dicom-ingest", {
    body: fd,
  });
  if (error) throw new Error(error.message);
  const d = data as Record<string, unknown>;
  return {
    studyId: String(d.study_id),
    acceptedFiles: Number(d.accepted_files ?? 0),
    rejectedFiles: Number(d.rejected_files ?? 0),
    studyInstanceUID: (d.study_instance_uid as string) ?? undefined,
    modality: (d.modality as string) ?? undefined,
  };
}

/** Kick off the DICOM-aware 5-point analysis. */
export async function analyzeDicomStudy(studyId: string): Promise<void> {
  const { error } = await supabase.functions.invoke("analyze-dicom-study", {
    body: { study_id: studyId },
  });
  if (error) throw new Error(error.message);
}

export async function listHospitalConnections(): Promise<HospitalConnection[]> {
  const { data, error } = await supabase
    .from("hospital_connections")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as HospitalConnection[];
}

export async function saveHospitalConnection(
  values: Partial<HospitalConnection> & { name: string },
): Promise<HospitalConnection> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) throw new Error("not_authenticated");

  if (values.id) {
    const { data, error } = await supabase
      .from("hospital_connections")
      .update({
        name: values.name,
        pacs_stow_url: values.pacs_stow_url ?? null,
        pacs_qido_url: values.pacs_qido_url ?? null,
        pacs_auth_header: values.pacs_auth_header ?? null,
        ris_fhir_base_url: values.ris_fhir_base_url ?? null,
        ris_auth_header: values.ris_auth_header ?? null,
        ae_title: values.ae_title ?? null,
        pacs_open_url_template: values.pacs_open_url_template ?? null,
        enabled: values.enabled ?? true,
      })
      .eq("id", values.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as HospitalConnection;
  }
  const { data, error } = await supabase
    .from("hospital_connections")
    .insert({
      user_id: uid,
      name: values.name,
      pacs_stow_url: values.pacs_stow_url ?? null,
      pacs_qido_url: values.pacs_qido_url ?? null,
      pacs_auth_header: values.pacs_auth_header ?? null,
      ris_fhir_base_url: values.ris_fhir_base_url ?? null,
      ris_auth_header: values.ris_auth_header ?? null,
      ae_title: values.ae_title ?? null,
      pacs_open_url_template: values.pacs_open_url_template ?? null,
      enabled: values.enabled ?? true,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as HospitalConnection;
}

export async function deleteHospitalConnection(id: string): Promise<void> {
  const { error } = await supabase.from("hospital_connections").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function verifyHospitalConnection(id: string): Promise<{
  ok: boolean;
  pacs_ok: boolean;
  ris_ok: boolean;
  message?: string;
}> {
  const { data, error } = await supabase.functions.invoke("pacs-verify", {
    body: { connection_id: id },
  });
  if (error) throw new Error(error.message);
  return data as { ok: boolean; pacs_ok: boolean; ris_ok: boolean; message?: string };
}

export async function pushDicomExport(opts: {
  studyId: string;
  connectionId: string;
  kinds: Array<"sr" | "pdf" | "sc">;
}): Promise<{ exports: DicomExportRow[] }> {
  const { data, error } = await supabase.functions.invoke("dicom-export", {
    body: {
      study_id: opts.studyId,
      connection_id: opts.connectionId,
      kinds: opts.kinds,
    },
  });
  if (error) throw new Error(error.message);
  return data as { exports: DicomExportRow[] };
}

export async function pushFhirReport(opts: {
  studyId: string;
  connectionId: string;
}): Promise<DicomExportRow> {
  const { data, error } = await supabase.functions.invoke("fhir-push", {
    body: { study_id: opts.studyId, connection_id: opts.connectionId },
  });
  if (error) throw new Error(error.message);
  return (data as { export: DicomExportRow }).export;
}

export async function listExports(studyId: string): Promise<DicomExportRow[]> {
  const { data, error } = await supabase
    .from("dicom_exports")
    .select("*")
    .eq("study_id", studyId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as DicomExportRow[];
}

/** Public DICOMweb STOW-RS URL the hospital pastes into their PACS. */
export function inboundStowUrl(token: string): string {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dicom-ingest?token=${encodeURIComponent(token)}`;
}
