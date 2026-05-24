-- ============ ENUMS ============
CREATE TYPE public.plan_code AS ENUM ('free', 'pro', 'pro_plus', 'enterprise');
CREATE TYPE public.subscription_status AS ENUM ('active', 'past_due', 'cancelled', 'pending');
CREATE TYPE public.emergency_request_status AS ENUM ('auto_granted', 'pending_review', 'approved', 'rejected');
CREATE TYPE public.camp_application_status AS ENUM ('submitted', 'in_review', 'approved', 'rejected');
CREATE TYPE public.applicant_kind AS ENUM ('clinic', 'institution');

-- ============ subscription_plans ============
CREATE TABLE public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code public.plan_code NOT NULL UNIQUE,
  name text NOT NULL,
  price_inr_monthly integer NOT NULL DEFAULT 0,
  monthly_scan_quota integer NOT NULL DEFAULT 0,
  daily_scan_addon integer NOT NULL DEFAULT 0,
  emergency_pool integer NOT NULL DEFAULT 0,
  chat_msgs_per_scan integer NOT NULL DEFAULT 2,
  max_tokens_per_reply integer NOT NULL DEFAULT 800,
  context_window_msgs integer NOT NULL DEFAULT 6,
  priority_queue boolean NOT NULL DEFAULT false,
  description text,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_public boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY plans_read_all ON public.subscription_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY plans_admin_write ON public.subscription_plans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_plans_updated BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ user_subscriptions ============
CREATE TABLE public.user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  plan_code public.plan_code NOT NULL DEFAULT 'free',
  status public.subscription_status NOT NULL DEFAULT 'active',
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz NOT NULL DEFAULT (now() + interval '100 years'),
  razorpay_subscription_id text,
  razorpay_customer_id text,
  razorpay_mode text,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY subs_self_select ON public.user_subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY subs_admin_select ON public.user_subscriptions FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY subs_admin_update ON public.user_subscriptions FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY subs_self_insert ON public.user_subscriptions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_subs_updated BEFORE UPDATE ON public.user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ usage_counters ============
CREATE TABLE public.usage_counters (
  user_id uuid PRIMARY KEY,
  period_start date NOT NULL DEFAULT (date_trunc('month', now())::date),
  scans_this_month integer NOT NULL DEFAULT 0,
  scans_today integer NOT NULL DEFAULT 0,
  day_marker date NOT NULL DEFAULT (now()::date),
  free_emergency_used integer NOT NULL DEFAULT 0,        -- lifetime, max 3
  free_emergency_auto_grants integer NOT NULL DEFAULT 0, -- lifetime, max 2
  emergency_requests_pending integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY usage_self_select ON public.usage_counters FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY usage_admin_select ON public.usage_counters FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY usage_self_insert ON public.usage_counters FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_usage_updated BEFORE UPDATE ON public.usage_counters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ chat_quotas (per study) ============
CREATE TABLE public.chat_quotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  study_id uuid NOT NULL,
  messages_used integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, study_id)
);
ALTER TABLE public.chat_quotas ENABLE ROW LEVEL SECURITY;
CREATE POLICY chatq_self_select ON public.chat_quotas FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY chatq_self_insert ON public.chat_quotas FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY chatq_self_update ON public.chat_quotas FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY chatq_admin_select ON public.chat_quotas FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_chatq_updated BEFORE UPDATE ON public.chat_quotas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ emergency_scan_requests ============
CREATE TABLE public.emergency_scan_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  reason text NOT NULL,
  patient_ref_short text,
  status public.emergency_request_status NOT NULL DEFAULT 'pending_review',
  decided_at timestamptz,
  decided_by uuid,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.emergency_scan_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY esr_self_select ON public.emergency_scan_requests FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY esr_self_insert ON public.emergency_scan_requests FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY esr_admin_select ON public.emergency_scan_requests FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY esr_admin_update ON public.emergency_scan_requests FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_esr_updated BEFORE UPDATE ON public.emergency_scan_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ camp_applications ============
CREATE TABLE public.camp_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  applicant_kind public.applicant_kind NOT NULL,
  organisation_name text NOT NULL,
  registration_number text NOT NULL,
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text,
  state text,
  city text,
  expected_patients integer,
  expected_scans_per_month integer,
  camp_dates text,
  purpose text NOT NULL,
  doctor_council_number text,
  status public.camp_application_status NOT NULL DEFAULT 'submitted',
  decision_note text,
  decided_at timestamptz,
  decided_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.camp_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY camp_self_select ON public.camp_applications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY camp_self_insert ON public.camp_applications FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY camp_admin_select ON public.camp_applications FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY camp_admin_update ON public.camp_applications FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_camp_updated BEFORE UPDATE ON public.camp_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ SEED PLANS ============
INSERT INTO public.subscription_plans
(code, name, price_inr_monthly, monthly_scan_quota, daily_scan_addon, emergency_pool,
 chat_msgs_per_scan, max_tokens_per_reply, context_window_msgs, priority_queue,
 description, features, display_order)
VALUES
('free','Free',0,0,0,3,2,800,6,false,
 '3 emergency scans free for life. Daily fair-use AI chat after each scan.',
 '["3 lifetime emergency scans","2 messages per scan in AI chat","Standard GPU queue","All medical systems supported"]'::jsonb, 1),
('pro','Pro',299,50,1,3,10,2000,16,false,
 '~80 scans / month + 10 chat messages per scan. Standard queue.',
 '["50 monthly scans + 1/day add-on (~80/mo)","10 chat messages per scan","3 emergency scans on demand","Standard GPU queue","Domain chat: Allopathy, Ayurveda, Homeo, Siddha, Unani"]'::jsonb, 2),
('pro_plus','Pro Plus',599,100,2,6,20,4000,30,true,
 'Double the Pro quota + priority GPU queue and 20 chat messages per scan.',
 '["100 monthly scans + 2/day add-on (~160/mo)","20 chat messages per scan","6 emergency scans on demand","Priority GPU queue","Highest context window for AI chat"]'::jsonb, 3),
('enterprise','Enterprise',0,0,0,0,0,0,0,true,
 'Custom volumes, dedicated GPU lane, SLAs, on-prem options. Talk to sales.',
 '["Custom monthly volumes","Dedicated GPU lane","SLAs and on-prem options","Priority support","Volume discounts"]'::jsonb, 4);

-- ============ Update signup trigger to seed Free plan + counters ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Seed Free subscription
  INSERT INTO public.user_subscriptions (user_id, plan_code, status)
  VALUES (NEW.id, 'free', 'active')
  ON CONFLICT (user_id) DO NOTHING;

  -- Seed usage counters
  INSERT INTO public.usage_counters (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

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

-- Backfill existing users: give them Free plan + counters
INSERT INTO public.user_subscriptions (user_id, plan_code, status)
SELECT id, 'free', 'active' FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.usage_counters (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;