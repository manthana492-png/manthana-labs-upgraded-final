// Shared auth helper — extracts user from JWT and returns a service-role
// Supabase client (so RLS can be bypassed for admin operations) plus the
// authenticated user's id/email. Returns null if unauthenticated.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export interface AuthCtx {
  userId: string;
  email: string | null;
  /** Service-role client — bypasses RLS. Use carefully. */
  admin: SupabaseClient;
  /** Caller's JWT (raw) — useful if you want to forward it. */
  jwt: string;
}

export async function getAuthCtx(req: Request): Promise<AuthCtx | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const jwt = authHeader.slice(7);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Use a user-scoped client just to validate the JWT and pull the user.
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return null;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return { userId: data.user.id, email: data.user.email ?? null, admin, jwt };
}

export function clientIp(req: Request): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ??
    null
  );
}
