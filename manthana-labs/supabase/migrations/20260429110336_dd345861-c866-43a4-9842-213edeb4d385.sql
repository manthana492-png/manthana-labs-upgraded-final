-- ── Profile: professional role (drives DICOM entitlement) ─────────────
DO $$ BEGIN
  CREATE TYPE public.professional_role AS ENUM (
    'radiologist','hospital','nursing_home','clinician_general','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS professional_role public.professional_role DEFAULT 'other';

-- ── Studies: DICOM-related additive columns ───────────────────────────
ALTER TABLE public.studies
  ADD COLUMN IF NOT EXISTS is_dicom boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS study_instance_uid text,
  ADD COLUMN IF NOT EXISTS accession_number text,
  ADD COLUMN IF NOT EXISTS referring_physician text;

CREATE INDEX IF NOT EXISTS idx_studies_is_dicom
  ON public.studies (user_id, created_at DESC) WHERE is_dicom = true;

-- ── Hospital connections (PACS / RIS endpoints per user) ──────────────
CREATE TABLE IF NOT EXISTS public.hospital_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  pacs_stow_url text,
  pacs_qido_url text,
  pacs_auth_header text, -- stored encrypted at app layer when set; nullable
  ris_fhir_base_url text,
  ris_auth_header text,
  ae_title text,
  inbound_token text NOT NULL DEFAULT encode(gen_random_bytes(24),'hex'),
  pacs_open_url_template text, -- e.g. https://pacs.example.com/viewer?study={studyInstanceUID}
  enabled boolean NOT NULL DEFAULT true,
  verified_at timestamptz,
  last_push_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_hospital_connections_inbound_token
  ON public.hospital_connections (inbound_token);
CREATE INDEX IF NOT EXISTS idx_hospital_connections_user
  ON public.hospital_connections (user_id);

ALTER TABLE public.hospital_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY hc_self_select ON public.hospital_connections
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY hc_self_insert ON public.hospital_connections
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY hc_self_update ON public.hospital_connections
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY hc_self_delete ON public.hospital_connections
  FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY hc_admin_select ON public.hospital_connections
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER tr_hospital_connections_updated_at
  BEFORE UPDATE ON public.hospital_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── DICOM assets (one row per parsed instance) ────────────────────────
CREATE TABLE IF NOT EXISTS public.dicom_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL,
  user_id uuid NOT NULL,
  sop_instance_uid text NOT NULL,
  sop_class_uid text,
  series_instance_uid text,
  study_instance_uid text,
  modality text,
  body_part text,
  rows int,
  cols int,
  frame_count int NOT NULL DEFAULT 1,
  dcm_path text NOT NULL,
  preview_png_path text,
  phi_scrubbed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dicom_assets_study ON public.dicom_assets (study_id);
CREATE INDEX IF NOT EXISTS idx_dicom_assets_user ON public.dicom_assets (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_dicom_assets_sop
  ON public.dicom_assets (study_id, sop_instance_uid);

ALTER TABLE public.dicom_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY dicom_assets_self_select ON public.dicom_assets
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY dicom_assets_self_insert ON public.dicom_assets
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY dicom_assets_self_delete ON public.dicom_assets
  FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY dicom_assets_admin_select ON public.dicom_assets
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- ── DICOM exports (audit of outbound pushes) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.dicom_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL,
  user_id uuid NOT NULL,
  connection_id uuid,
  kind text NOT NULL CHECK (kind IN ('sr','pdf','sc','fhir')),
  target_url text,
  status text NOT NULL CHECK (status IN ('pending','success','error')),
  response_code int,
  response_body_excerpt text,
  error text,
  sop_instance_uid text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dicom_exports_study ON public.dicom_exports (study_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dicom_exports_user ON public.dicom_exports (user_id, created_at DESC);

ALTER TABLE public.dicom_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY dicom_exports_self_select ON public.dicom_exports
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY dicom_exports_self_insert ON public.dicom_exports
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY dicom_exports_admin_select ON public.dicom_exports
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
