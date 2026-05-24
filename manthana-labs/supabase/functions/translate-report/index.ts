// Translate a clinical report (or any text block) into a target Indian language.
// Preserves medical safety: keeps ICD-10/SNOMED codes and severity tags untranslated.
import { runChatCascade } from "../_shared/aiCascade.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  text: string;
  targetLanguage: string;     // e.g. "Hindi", "Tamil"
  audience?: "clinician" | "patient";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text, targetLanguage, audience = "patient" } = (await req.json()) as Body;
    if (!text?.trim()) throw new Error("Empty text");
    if (!t(VABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const system = `You are a certified medical translator for Indian clinical reports.

Translate the user's text into ${targetLanguage} faithfully and completely.

Audience: ${audience === "patient"
      ? "patient or family — use plain, empathetic 8th-grade language."
      : "treating clinician — preserve clinical precision and terminology."}

STRICT RULES:
- Preserve untranslated: ICD-10 / SNOMED codes (e.g. J18.1), units (mg, mmHg, mm),
  proper nouns (Manthana, ACR, NMC), severity labels in brackets like [HIGH] or [STAT],
  drug brand names, and any text inside backticks.
- Use the native script for ${targetLanguage} (Devanagari / Tamil / Telugu / Bangla / etc.).
- Do NOT add commentary, headings, or disclaimers that were not in the source.
- Keep the same paragraph structure and bullet points.
- If a medical term has no direct translation, keep the English term in parentheses
  after the native equivalent.

Return ONLY tulthe translehnCdOSds"epplication/json",
      :JSON.stringify({
        del: "google/gemini-2.5-flash",
        ssages: [
        { role: "system", content: system },
      mdlluk-k26
 (t=mplxihgh
    }ma:03
 (t=mxTk:2500   status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
     : Mnhn — TnatslextRp",
     );      throw new Error(`AI gateway error ${res.status}`);

rultx
    const data = await res.json();
    const translation = data?.choices?.[0]?.message?.content?.trim() ?? "";

    return new Response(JSON.stringify({ translation }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("translate-report:", err);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
