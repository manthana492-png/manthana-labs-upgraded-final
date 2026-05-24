ALTER TABLE public.studies
  ADD COLUMN IF NOT EXISTS is_compare_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS compare_modality_slug text,
  ADD COLUMN IF NOT EXISTS compare_timepoints jsonb,
  ADD COLUMN IF NOT EXISTS compare_synthesis jsonb;

CREATE INDEX IF NOT EXISTS idx_studies_compare_mode ON public.studies(user_id) WHERE is_compare_mode = true;