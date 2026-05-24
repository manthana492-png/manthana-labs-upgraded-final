-- ───────────────────────────────────────────────────────────
-- Phase 1: Studies table additions
-- ───────────────────────────────────────────────────────────
ALTER TABLE public.studies
  ADD COLUMN IF NOT EXISTS storage_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS questionnaire_answers jsonb,
  ADD COLUMN IF NOT EXISTS progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS detected_modality_slug text,
  ADD COLUMN IF NOT EXISTS detection_confidence numeric,
  ADD COLUMN IF NOT EXISTS report jsonb,
  ADD COLUMN IF NOT EXISTS modal_job_id text;

-- Allow 'error' status for failed analyses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'error'
      AND enumtypid = 'public.study_status'::regtype
  ) THEN
    ALTER TYPE public.study_status ADD VALUE 'error';
  END IF;
END$$;

-- Helpful indexes for the new query patterns
CREATE INDEX IF NOT EXISTS idx_studies_user_status ON public.studies (user_id, status);
CREATE INDEX IF NOT EXISTS idx_studies_modal_job_id ON public.studies (modal_job_id) WHERE modal_job_id IS NOT NULL;

-- ───────────────────────────────────────────────────────────
-- Phase 1: Private storage bucket "studies"
-- ───────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'studies',
  'studies',
  false,
  524288000, -- 500 MB per file cap
  ARRAY[
    'image/jpeg','image/png','image/webp','image/tiff','image/bmp',
    'application/dicom','application/octet-stream',
    'video/mp4','video/webm','video/quicktime',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: owner CRUD on their own folder ({user_id}/...)
DROP POLICY IF EXISTS "studies_owner_select" ON storage.objects;
CREATE POLICY "studies_owner_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'studies'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "studies_owner_insert" ON storage.objects;
CREATE POLICY "studies_owner_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'studies'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "studies_owner_update" ON storage.objects;
CREATE POLICY "studies_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'studies'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "studies_owner_delete" ON storage.objects;
CREATE POLICY "studies_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'studies'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Admins can read all files in the bucket
DROP POLICY IF EXISTS "studies_admin_select" ON storage.objects;
CREATE POLICY "studies_admin_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'studies'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- ───────────────────────────────────────────────────────────
-- Phase 1: Realtime publication on studies (for progress streaming)
-- ───────────────────────────────────────────────────────────
ALTER TABLE public.studies REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'studies'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.studies';
  END IF;
END$$;