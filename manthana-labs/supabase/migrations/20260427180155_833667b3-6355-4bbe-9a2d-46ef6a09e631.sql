ALTER TABLE public.studies
  ADD COLUMN IF NOT EXISTS is_multi_modality boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS multi_modality_legs jsonb,
  ADD COLUMN IF NOT EXISTS multi_modality_combined_qa jsonb,
  ADD COLUMN IF NOT EXISTS multi_modality_synthesis jsonb;

CREATE INDEX IF NOT EXISTS idx_studies_is_multi_modality
  ON public.studies (user_id, created_at DESC)
  WHERE is_multi_modality = true;