import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAuthCtx } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  // DICOM / PACS / FHIR features are disabled. See src/lib/featureFlags.ts.
  return jsonResponse({ error: "feature_disabled", message: "DICOM/PACS/FHIR features are disabled." }, 410);

  const ctx = await getAuthCtx(req);
  if (!ctx) return jsonResponse({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const id = body?.connection_id;
  if (!id) return jsonResponse({ error: "connection_id_required" }, 400);

  const { data: conn } = await ctx.admin
    .from("hospital_connections")
    .select("*")
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!conn) return jsonResponse({ error: "not_found" }, 404);

  const probe = async (url: string | null, header: string | null): Promise<boolean> => {
    if (!url) return false;
    try {
      const res = await fetch(url, {
        method: "HEAD",
        headers: header ? { Authorization: header } : {},
        signal: AbortSignal.timeout(5000),
      });
      return res.status < 500;
    } catch {
      return false;
    }
  };

  const pacs_ok = await probe(conn.pacs_stow_url, conn.pacs_auth_header);
  const ris_ok = await probe(conn.ris_fhir_base_url, conn.ris_auth_header);
  const ok = pacs_ok || ris_ok;

  if (ok) {
    await ctx.admin
      .from("hospital_connections")
      .update({ verified_at: new Date().toISOString() })
      .eq("id", id);
  }

  return jsonResponse({
    ok,
    pacs_ok,
    ris_ok,
    message: ok ? "Endpoint reachable" : "Could not reach PACS or RIS endpoint",
  });
});
