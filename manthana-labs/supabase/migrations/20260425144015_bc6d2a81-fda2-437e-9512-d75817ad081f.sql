-- Extend tier enum with 'H' for hybrid
ALTER TYPE public.tier ADD VALUE IF NOT EXISTS 'H';

-- Extend catalog enum
ALTER TYPE public.catalog ADD VALUE IF NOT EXISTS 'hybrid_nvidia_quaasx108';

-- Add live capture columns to studies
ALTER TABLE public.studies
  ADD COLUMN IF NOT EXISTS is_live_capture boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS live_capture_pass smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS live_capture_video_path text,
  ADD COLUMN IF NOT EXISTS live_holoscan_measurements jsonb,
  ADD COLUMN IF NOT EXISTS live_follow_up_questions jsonb,
  ADD COLUMN IF NOT EXISTS live_follow_up_answers jsonb,
  ADD COLUMN IF NOT EXISTS web_citations jsonb;

CREATE INDEX IF NOT EXISTS idx_studies_is_live_capture
  ON public.studies(user_id, created_at DESC)
  WHERE is_live_capture = true;