-- Council/medical-system enums
CREATE TYPE public.medical_system AS ENUM (
  'allopathy',
  'ayurveda',
  'homeopathy',
  'siddha',
  'unani',
  'dental'
);

CREATE TYPE public.verification_status AS ENUM (
  'pending',
  'verified',
  'rejected',
  'manual_review'
);

-- Extend profiles with system + verification status
ALTER TABLE public.profiles
  ADD COLUMN system public.medical_system,
  ADD COLUMN verification_status public.verification_status NOT NULL DEFAULT 'pending',
  ADD COLUMN council_body text,
  ADD COLUMN council_state text,
  ADD COLUMN council_year integer;

-- Council verifications table (full audit history)
CREATE TABLE public.council_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  system public.medical_system NOT NULL,
  council_body text NOT NULL,
  registration_number text NOT NULL,
  registration_year integer,
  state text,
  full_name_submitted text NOT NULL,
  status public.verification_status NOT NULL DEFAULT 'pending',
  verification_source text,
  verification_payload jsonb,
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_council_verifications_user ON public.council_verifications(user_id);
CREATE INDEX idx_council_verifications_status ON public.council_verifications(status);

ALTER TABLE public.council_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY cv_self_select ON public.council_verifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY cv_self_insert ON public.council_verifications
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY cv_admin_select ON public.council_verifications
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY cv_admin_update ON public.council_verifications
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_cv_updated_at
  BEFORE UPDATE ON public.council_verifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- MFA enrollment tracking (TOTP via Supabase MFA API)
CREATE TABLE public.mfa_enrollments (
  user_id uuid PRIMARY KEY,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz,
  factor_id text,
  recovery_codes_generated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mfa_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY mfa_self_all ON public.mfa_enrollments
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY mfa_admin_select ON public.mfa_enrollments
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_mfa_updated_at
  BEFORE UPDATE ON public.mfa_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Update handle_new_user to capture system + initial verification row
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_system public.medical_system;
  v_council_body text;
BEGIN
  v_system := COALESCE((NEW.raw_user_meta_data->>'system')::public.medical_system, 'allopathy');
  v_council_body := NEW.raw_user_meta_data->>'council_body';

  INSERT INTO public.profiles (id, full_name, email, council_number, specialty, system, council_body, council_state, council_year)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    NEW.raw_user_meta_data->>'council_number',
    NEW.raw_user_meta_data->>'specialty',
    v_system,
    v_council_body,
    NEW.raw_user_meta_data->>'council_state',
    NULLIF(NEW.raw_user_meta_data->>'council_year','')::integer
  );

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'clinician')
  ON CONFLICT DO NOTHING;

  -- Queue verification record
  IF NEW.raw_user_meta_data->>'council_number' IS NOT NULL THEN
    INSERT INTO public.council_verifications (
      user_id, system, council_body, registration_number, registration_year, state, full_name_submitted, status
    ) VALUES (
      NEW.id,
      v_system,
      COALESCE(v_council_body, 'Unspecified'),
      NEW.raw_user_meta_data->>'council_number',
      NULLIF(NEW.raw_user_meta_data->>'council_year','')::integer,
      NEW.raw_user_meta_data->>'council_state',
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
      'pending'
    );
  END IF;

  RETURN NEW;
END $function$;