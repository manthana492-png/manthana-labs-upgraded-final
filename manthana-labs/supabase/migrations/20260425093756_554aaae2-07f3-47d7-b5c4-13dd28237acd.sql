-- Track successful redemptions (cap = 20)
CREATE TABLE public.access_code_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  user_email text NOT NULL,
  code_label text NOT NULL DEFAULT 'developer_pro',
  ip_address text,
  fingerprint text,
  redeemed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.access_code_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acr_admin_select"
  ON public.access_code_redemptions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "acr_self_select"
  ON public.access_code_redemptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Track failed attempts (per IP + fingerprint) for 24h lockout
CREATE TABLE public.access_code_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text,
  fingerprint text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  succeeded boolean NOT NULL DEFAULT false,
  user_id uuid
);

CREATE INDEX idx_aca_ip_fp_time
  ON public.access_code_attempts (ip_address, fingerprint, attempted_at DESC);

ALTER TABLE public.access_code_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "aca_admin_select"
  ON public.access_code_attempts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Helper: count active redemptions
CREATE OR REPLACE FUNCTION public.access_code_seats_used()
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int FROM public.access_code_redemptions;
$$;