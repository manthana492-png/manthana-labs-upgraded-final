// Generate a plain-language (8th-grade) patient summary using Lovable AI Gateway.
// Authenticated users only — verified via JWT in code (verify_jwt = false at config layer).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { runChatCascade } from "../_shared/aiCascade.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface FindingIn {
  title: string;
  severity: string;
  impression?: string;
  recommendation?: string;
  anatomicalRegion?: string;
}

async function getUser(req: Request): Promise<{ id: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const user = await getUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { modality, findings, narrative } = await req.json() as {
      modality: string;
      findings: FindingIn[];
      narrative?: string;
    };

    const findingsTxt = (findings ?? []).map((f, i) =>
      `${i + 1}. [${f.severity.toUpperCase()}] ${f.title}` +
      (f.anatomicalRegion ? ` — ${f.anatomicalRegion}` : "") +
      (f.impression ? `\n   Impression: ${f.impression}` : "") +
      (f.recommendation ? `\n   Next step: ${f.recommendation}` : ""),
    ).join("\n");

    const system = `You write plain-language patient summaries for a ${modality} report.
Rules:
- Reading level: 8th grade. Short sentences. No medical jargon (translate every term).
- Tone: calm, empathetic, factual. Never alarm; never minimize.
- Always say this is a preliminary AI-assisted analysis that the doctor must review.
- Never give a diagnosis. Use "the report mentions" / "your doctor will discuss".
- 4-6 short paragraphs maximum. Use simple bullets only when listing next steps.
- End with: "Please discuss this report with your doctor before taking any action."
- Do not use markdown headers. Plain text only.`;

    const user_prompt = `Modality: ${modality}
Doctor's narrative:
${narrative ?? "(no narrative provided)"}

Findings:
${findingsTxt || "(no findings)"}

Write the patient summary now.`;
    const result = await runChatCascade({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user_prompt },
      ],
      modelSlug: "kimi-k2.6",
      complexity: "high",
      temperature: 0.3,
      maxTokens: 1500,
      title: "Manthana — Patient Summary",
    });

    const summary = result.text.trim();

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("generate-patient-summary:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
