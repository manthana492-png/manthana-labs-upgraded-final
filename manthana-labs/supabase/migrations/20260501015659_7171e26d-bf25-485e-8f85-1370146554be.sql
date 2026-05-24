-- Restructure Pro and Pro+ plans: remove daily add-on, set fixed monthly quotas.
UPDATE public.subscription_plans
SET
  monthly_scan_quota = 60,
  daily_scan_addon = 0,
  chat_msgs_per_scan = 10,
  max_tokens_per_reply = 2000,
  context_window_msgs = 16,
  emergency_pool = 3,
  priority_queue = false,
  description = '60 scans / month + 10 chat messages per scan. Standard GPU queue.',
  features = '["60 monthly scans", "10 chat messages per scan", "3 emergency scans on demand", "Standard GPU queue", "Domain chat: Allopathy, Ayurveda, Homeo, Siddha, Unani"]'::jsonb
WHERE code = 'pro';

UPDATE public.subscription_plans
SET
  monthly_scan_quota = 120,
  daily_scan_addon = 0,
  chat_msgs_per_scan = 10,
  max_tokens_per_reply = 2000,
  context_window_msgs = 30,
  emergency_pool = 6,
  priority_queue = true,
  description = '120 scans / month + 10 chat messages per scan. Priority GPU queue.',
  features = '["120 monthly scans", "10 chat messages per scan", "6 emergency scans on demand", "Priority GPU queue", "Highest context window for AI chat"]'::jsonb
WHERE code = 'pro_plus';