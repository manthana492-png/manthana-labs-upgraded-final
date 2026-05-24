
-- 1. Doctor branding table
CREATE TABLE public.doctor_branding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  clinic_name text,
  doctor_name text,
  credentials text,
  address text,
  phone text,
  email text,
  accent_color text DEFAULT '#0ea5e9',
  footer_disclaimer text,
  template text NOT NULL DEFAULT 'classic',
  logo_url text,
  signature_url text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT doctor_branding_template_check CHECK (template IN ('classic','modern','compact'))
);

ALTER TABLE public.doctor_branding ENABLE ROW LEVEL SECURITY;

CREATE POLICY brand_self_select ON public.doctor_branding FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY brand_self_insert ON public.doctor_branding FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY brand_self_update ON public.doctor_branding FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY brand_self_delete ON public.doctor_branding FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY brand_admin_select ON public.doctor_branding FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER trg_doctor_branding_updated_at
BEFORE UPDATE ON public.doctor_branding
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Studies: original_report snapshot + edit metadata
ALTER TABLE public.studies
  ADD COLUMN IF NOT EXISTS original_report jsonb,
  ADD COLUMN IF NOT EXISTS edited_by_doctor boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS report_locked boolean NOT NULL DEFAULT false;

-- 3. Public storage bucket for doctor branding assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('doctor-branding', 'doctor-branding', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "doctor_branding_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'doctor-branding');

CREATE POLICY "doctor_branding_owner_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'doctor-branding' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "doctor_branding_owner_update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'doctor-branding' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "doctor_branding_owner_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'doctor-branding' AND auth.uid()::text = (storage.foldername(name))[1]);
