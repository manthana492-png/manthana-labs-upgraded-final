
-- 1) Make doctor-branding bucket private and tighten storage policies
UPDATE storage.buckets SET public = false WHERE id = 'doctor-branding';

DROP POLICY IF EXISTS "doctor_branding_public_read" ON storage.objects;

-- Authenticated owners can read their own branding files (logos/signatures)
CREATE POLICY "doctor_branding_owner_read"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'doctor-branding' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 2) Remove privilege escalation: users may not insert their own subscription rows.
-- All subscription writes happen via edge functions using the service role.
DROP POLICY IF EXISTS subs_self_insert ON public.user_subscriptions;

-- 3) Realtime: restrict channel subscriptions to the owning user.
-- The convention used by clients should be channel topic = `user:<auth.uid()>` or starting with the user id.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS realtime_self_topic_read ON realtime.messages;
CREATE POLICY realtime_self_topic_read
ON realtime.messages FOR SELECT
TO authenticated
USING (
  topic = ('user:' || auth.uid()::text)
  OR topic LIKE (auth.uid()::text || ':%')
);

DROP POLICY IF EXISTS realtime_self_topic_write ON realtime.messages;
CREATE POLICY realtime_self_topic_write
ON realtime.messages FOR INSERT
TO authenticated
WITH CHECK (
  topic = ('user:' || auth.uid()::text)
  OR topic LIKE (auth.uid()::text || ':%')
);

-- 4) Revoke EXECUTE on internal SECURITY DEFINER helpers from public roles.
-- These are used only by triggers / admin contexts; has_role() is intentionally
-- left executable because it is referenced by many RLS policies.
REVOKE EXECUTE ON FUNCTION public.access_code_seats_used() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.medical_codes_tsv_trigger() FROM anon, authenticated, public;
