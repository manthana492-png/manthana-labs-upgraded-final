
-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'clinician');
CREATE TYPE public.study_status AS ENUM ('draft','uploading','questionnaire','analyzing','awaiting_review','delivered');
CREATE TYPE public.severity AS ENUM ('low','medium','high','critical');
CREATE TYPE public.urgency AS ENUM ('routine','urgent','stat');
CREATE TYPE public.tier AS ENUM ('A','B','C');
CREATE TYPE public.catalog AS ENUM ('nvidia_backed','research_assisted');

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  council_number TEXT,
  specialty TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- USER ROLES (separate table — never on profiles)
-- ============================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security-definer role check (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- ============================================================
-- STUDIES
-- ============================================================
CREATE TABLE public.studies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  modality_slug TEXT NOT NULL,
  modality_label TEXT NOT NULL,
  modality_category TEXT NOT NULL,
  tier tier NOT NULL,
  catalog catalog NOT NULL,
  status study_status NOT NULL DEFAULT 'draft',
  patient_ref_short TEXT,
  images_count INT NOT NULL DEFAULT 0,
  videos_count INT NOT NULL DEFAULT 0,
  narrative TEXT,
  overall_confidence NUMERIC(4,3),
  information_gaps JSONB,
  foundation_model_caveat TEXT,
  patient_summary TEXT,
  critical_acknowledged_at TIMESTAMPTZ,
  critical_acknowledged_by TEXT,
  critical_callback_target TEXT,
  review_confirmed_at TIMESTAMPTZ,
  reviewing_doctor_note TEXT,
  report_hash TEXT,
  report_signature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_studies_user ON public.studies(user_id, created_at DESC);
ALTER TABLE public.studies ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- FINDINGS
-- ============================================================
CREATE TABLE public.findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id UUID NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  severity severity NOT NULL,
  confidence NUMERIC(4,3) NOT NULL,
  region TEXT,
  anatomical_region TEXT,
  observation TEXT,
  impression TEXT,
  recommendation TEXT,
  icd10_code TEXT,
  icd10_label TEXT,
  snomed_code TEXT,
  snomed_label TEXT,
  urgency urgency DEFAULT 'routine',
  differentials JSONB,
  -- Urgency escalation gate
  escalation_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  escalation_callback_target TEXT,
  escalation_communication_note TEXT,
  escalation_acknowledged_at TIMESTAMPTZ,
  escalation_acknowledged_by TEXT,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_findings_study ON public.findings(study_id, display_order);
ALTER TABLE public.findings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- ATTESTATIONS (versioned, immutable acceptance log)
-- ============================================================
CREATE TABLE public.attestations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_attestations_user ON public.attestations(user_id, accepted_at DESC);
ALTER TABLE public.attestations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- MODEL FEEDBACK (active-learning loop)
-- ============================================================
CREATE TABLE public.model_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  study_id UUID REFERENCES public.studies(id) ON DELETE SET NULL,
  finding_id UUID REFERENCES public.findings(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  detail TEXT NOT NULL,
  doctor_name TEXT,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.model_feedback ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- AUDIT LOG (append-only)
-- ============================================================
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_user ON public.audit_log(user_id, created_at DESC);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- MEDICAL CODES catalog (searchable ICD-10 + SNOMED)
-- ============================================================
CREATE TABLE public.medical_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system TEXT NOT NULL CHECK (system IN ('icd10','snomed')),
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  category TEXT,
  search_tsv TSVECTOR,
  UNIQUE (system, code)
);
CREATE INDEX idx_medical_codes_search ON public.medical_codes USING GIN (search_tsv);
CREATE INDEX idx_medical_codes_system_code ON public.medical_codes (system, code);
ALTER TABLE public.medical_codes ENABLE ROW LEVEL SECURITY;

-- Auto-populate the tsvector
CREATE OR REPLACE FUNCTION public.medical_codes_tsv_trigger()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_tsv := to_tsvector('english', coalesce(NEW.code,'') || ' ' || coalesce(NEW.label,'') || ' ' || coalesce(NEW.category,''));
  RETURN NEW;
END $$;
CREATE TRIGGER trg_medical_codes_tsv BEFORE INSERT OR UPDATE ON public.medical_codes
  FOR EACH ROW EXECUTE FUNCTION public.medical_codes_tsv_trigger();

-- ============================================================
-- updated_at triggers
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_studies_updated BEFORE UPDATE ON public.studies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_findings_updated BEFORE UPDATE ON public.findings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Auto-create profile + default role on signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, council_number, specialty)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    NEW.raw_user_meta_data->>'council_number',
    NEW.raw_user_meta_data->>'specialty'
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'clinician')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- RLS POLICIES
-- ============================================================
-- profiles
CREATE POLICY "profiles_self_select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_admin_select" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- user_roles
CREATE POLICY "roles_self_select" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "roles_admin_all" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- studies
CREATE POLICY "studies_owner_select" ON public.studies FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "studies_owner_insert" ON public.studies FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "studies_owner_update" ON public.studies FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "studies_owner_delete" ON public.studies FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "studies_admin_select" ON public.studies FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- findings
CREATE POLICY "findings_owner_select" ON public.findings FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "findings_owner_insert" ON public.findings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "findings_owner_update" ON public.findings FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "findings_owner_delete" ON public.findings FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "findings_admin_select" ON public.findings FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- attestations (insert-only by user, read by self/admin)
CREATE POLICY "attest_self_select" ON public.attestations FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "attest_self_insert" ON public.attestations FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "attest_admin_select" ON public.attestations FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- model_feedback
CREATE POLICY "feedback_self_select" ON public.model_feedback FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "feedback_self_insert" ON public.model_feedback FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "feedback_admin_select" ON public.model_feedback FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- audit_log (insert-only by user, read by admin)
CREATE POLICY "audit_self_insert" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "audit_admin_select" ON public.audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "audit_self_select" ON public.audit_log FOR SELECT TO authenticated USING (user_id = auth.uid());

-- medical_codes (catalog: read for any authenticated user, no writes)
CREATE POLICY "codes_read_all" ON public.medical_codes FOR SELECT TO authenticated USING (true);
CREATE POLICY "codes_admin_write" ON public.medical_codes FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
