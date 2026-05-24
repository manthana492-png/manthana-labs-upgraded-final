// Medical code search (ICD-10 + SNOMED) — full-text + prefix
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const system = url.searchParams.get("system"); // "icd10" | "snomed" | null
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 50);

    if (q.length < 1) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Build a tsquery: every token becomes a prefix match
    const tokens = q.split(/\s+/).filter(Boolean).map((t) =>
      t.replace(/[^A-Za-z0-9.]/g, "")
    ).filter(Boolean);
    const tsq = tokens.length ? tokens.map((t) => `${t}:*`).join(" & ") : null;

    let query = supabase
      .from("medical_codes")
      .select("system, code, label, category")
      .limit(limit);

    if (system === "icd10" || system === "snomed") query = query.eq("system", system);

    // Prefer text search, fall back to ilike on code/label
    if (tsq) {
      query = query.or(
        `search_tsv.fts.${tsq},code.ilike.${q}%,label.ilike.%${q}%`,
      );
    } else {
      query = query.or(`code.ilike.${q}%,label.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return new Response(JSON.stringify({ results: data ?? [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("search-medical-codes error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
