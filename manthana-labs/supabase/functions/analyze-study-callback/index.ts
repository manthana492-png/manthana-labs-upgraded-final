// analyze-study-callback — retired. The product no longer dispatches to an
// external GPU service; all analysis runs through the cloud-AI path inside
// `analyze-study`. This function is kept deployed as a 200 no-op so any
// in-flight legacy callbacks resolve cleanly instead of 404-ing.

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  console.log("[analyze-study-callback] received legacy callback — ignoring");
  return jsonResponse({ ok: true, status: "noop_legacy_endpoint" });
});
