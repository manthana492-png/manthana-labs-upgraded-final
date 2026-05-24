ALTER TABLE public.studies
  ADD COLUMN IF NOT EXISTS live_capture_kind text NOT NULL DEFAULT 'video',
  ADD COLUMN IF NOT EXISTS live_photo_paths jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.studies
  DROP CONSTRAINT IF EXISTS studies_live_capture_kind_chk;
ALTER TABLE public.studies
  ADD CONSTRAINT studies_live_capture_kind_chk
  CHECK (live_capture_kind IN ('video','photos'));