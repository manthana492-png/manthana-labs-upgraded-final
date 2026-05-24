// audit-log — GET /functions/v1/audit-log?limit=50&before={iso}
// Returns the authenticated user's own audit entries, paginated newest-first.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAuthCtx } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return jsonResponse({ error: "method_not_allowed" }, 405);

  const ctx = await getAuthCtx(req);
  if (!ctx) return jsonResponse({ error: "unauthorized" }, 401);

  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? "50")));
  const before = url.searchParams.get("before");

  let q = ctx.admin
    .from("audit_log")
    .select("id, action, entity_type, entity_id, metadata, created_at, ip_address, user_agent")
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (before) q = q.lt("created_at", before);

  const { data, error } = await q;
  if (error) return jsonResponse({ error: error.message }, 500);

  return jsonResponse({
    entries: (data ?? []).map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      metadata: r.metadata,
      createdAt: r.created_at,
      ipAddress: r.ip_address,
      userAgent: r.user_agent,
    })),
    nextBefore: (data ?? []).length === limit ? data![data!.length - 1].created_at : null,
  });
});
