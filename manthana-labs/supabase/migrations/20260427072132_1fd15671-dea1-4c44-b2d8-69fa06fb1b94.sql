ALTER TABLE public.studies
  ADD COLUMN IF NOT EXISTS dynamic_questions jsonb;

-- web_citations already exists; alias-like report_references not needed.
-- Use existing web_citations column for clinical-trial / research-paper links.