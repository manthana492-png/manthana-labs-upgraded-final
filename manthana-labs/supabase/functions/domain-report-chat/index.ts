// Domain-aware report chat: interprets a finalized report through the lens of
// a chosen medical system (Allopathy / Ayurveda / Homeopathy / Siddha / Unani).
// Streams responses through the shared cloud-AI cascade. Honours per-plan
// quota / context / token limits.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runChatCascade, type ChatMessage } from "../_shared/aiCascade.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ChatMsg = { role: "user" | "assistant" | "system"; content: string };

interface FindingIn {
  title: string;
  severity: string;
  impression?: string;
  recommendation?: string;
  anatomicalRegion?: string;
  icd10Code?: string;
}

interface Body {
  domain: "allopathy" | "ayurveda" | "homeopathy" | "siddha" | "unani";
  language?: string;
  modality: string;
  narrative?: string;
  findings: FindingIn[];
  messages: ChatMsg[];
  studyId?: string;
  suggest_differentials?: boolean;
}

const DOMAIN_PROMPTS: Record<Body["domain"], string> = {
  allopathy: `You are a senior MD physician (modern medicine).
- Reason from the imaging report using evidence-based modern medicine.
- Cite guideline bodies where relevant (ACR, RSNA, BTS, NICE, ICMR).
- Suggest next investigations or management steps that the treating clinician should consider.
- Always remind that final clinical decisions remain with the treating doctor.`,

  ayurveda: `You are a senior BAMS Ayurvedacharya with deep knowledge of classical texts.
- Interpret findings through Tridosha (Vata/Pitta/Kapha), Dhatu, Srotas, and Agni.
- For EVERY response include 2-3 authentic shlokas from CLASSICAL texts ONLY.
  Use Charaka Samhita, Sushruta Samhita, Ashtanga Hridaya, Madhava Nidana,
  Bhavaprakasha, Sharangadhara Samhita, Yogaratnakara.
- Format each citation precisely: "— Charaka Samhita, Sutrasthana 17/62"
  with the Sanskrit (Devanagari) shloka, then a one-line English meaning.
- After shlokas, give Nidana (causes), Samprapti (pathogenesis) and a brief Chikitsa direction
  (herbs / Panchakarma / Pathya-Apathya).
- Never invent verses. If unsure of a verse, say "I cannot verify the exact reference"
  and quote the classical principle in plain Sanskrit + English instead.`,

  homeopathy: `You are a senior BHMS homeopath grounded in classical Materia Medica.
- Interpret findings via miasms (Psora, Sycosis, Syphilis, Tubercular) and constitutional types.
- For every response cite at least one reference from: Hahnemann's Organon (with aphorism §),
  Kent's Repertory, Boericke's Materia Medica, Allen's Keynotes, or Clarke's Dictionary.
  Format: "— Boericke, Materia Medica: Bryonia alba" or "— Organon §153".
- Suggest 2-3 candidate remedies with potency considerations and key totality of symptoms.
- Emphasise individualisation; the prescriber must take the full case.`,

  siddha: `You are a senior BSMS Siddha vaidyar.
- Interpret findings via Mukkutram (Vatham/Pitham/Kapham), Ezhu Udal Thathukkal, and Naadi.
- Cite at least one reference per response from: Agathiyar 2000, Theraiyar Vagadam,
  Yugi Vaithiya Chinthamani, Bogar 7000, Pulipani Vaithiyam.
  Use Tamil script for the verse, then English meaning.
- Suggest classical Siddha formulations (Chooranam / Parpam / Chenduram / Kashayam) and Pathiyam.`,

  unani: `You are a senior BUMS Hakim grounded in Tibb-e-Yunani.
- Interpret findings via Akhlat (humours: Dam, Balgham, Safra, Sauda) and Mizaj (temperament).
- Cite at least one reference per response from: Al-Qanun fi'l-Tibb (Ibn Sina),
  Kitab al-Hawi (Razi), Kamil-us-Sana (Ali ibn al-Abbas), Firdaus-ul-Hikmat.
  Format: "— Al-Qanun, Book III, Fen 1, Maqala 2" with Arabic phrase + English meaning.
- Suggest Ilaj-bil-Tadbeer, Ilaj-bil-Ghiza, Ilaj-bil-Dawa with classical formulations
  (Joshanda / Sharbat / Itrifal / Majoon).`,
};

const SAFETY = `
SAFETY RULES (apply to every response):
- This is a clinical decision support tool. Always defer the final decision to the treating clinician.
- Never claim to diagnose. Use phrases like "the imaging suggests" or "consistent with".
- For STAT or critical findings, urge immediate referral to allopathic emergency care
  regardless of system selected.
- Be honest about uncertainty. Do not invent references, dosages, or studies.
- Flag dangerous drug-herb interactions when relevant.
`;

// Provider cascade is centralized in `_shared/aiCascade.ts`.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
if (body.suggest_differentials) {
      const lastMessage = body.messages?.[body.messages.length - 1]?.content ?? "";
      const system = `You are a senior clinical diagnostician. Suggest exactly 3 plausible alternative diagnoses (differentials) for the finding provided.
Return ONLY valid JSON matching this schema:
{
  "differentials": [
    { "dx": "diagnosis name", "likelihood": 0.5 }
  ]
}
Values for likelihood must be floats between 0.0 and 1.0. No prose, no markdown formatting.`;

      const result = await runChatCascade({
        messages: [
          { role: "system", content: system },
          { role: "user", content: lastMessage }
        ],
        modelSlug: "kimi-k2.6",
        complexity: "high",
        jsonObject: true,
        temperature: 0.2,
        maxTokens: 1000,
        title: "Manthana — Suggest Differentials",
      });

      return new Response(result.text, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "x-manthana-provider": result.provider,
        },
      });
    }

    
    // Resolve plan limits (best-effort; falls back to free defaults)
    let limits = {
      chat_msgs_per_scan: 2,
      context_window_msgs: 6,
      max_tokens_per_reply: 800,
    };
    let used = 0;
    let cap = 2;

    const auth = req.headers.get("Authorization");
    if (auth && body.studyId) {
      try {
        const sb = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
          { global: { headers: { Authorization: auth } } },
        );
        const { data: userRes } = await sb.auth.getUser();
        const user = userRes?.user;
        if (user) {
          const { data: sub } = await sb.from("user_subscriptions")
            .select("plan_code,status").eq("user_id", user.id).maybeSingle();
          const planCode = sub?.status === "active" ? (sub?.plan_code ?? "free") : "free";
          const { data: plan } = await sb.from("subscription_plans")
            .select("*").eq("code", planCode).maybeSingle();
          if (plan) {
            limits = {
              chat_msgs_per_scan: plan.chat_msgs_per_scan as number,
              context_window_msgs: plan.context_window_msgs as number,
              max_tokens_per_reply: plan.max_tokens_per_reply as number,
            };
            cap = limits.chat_msgs_per_scan;
          }
          // Quota check + consume
          const { data: cq } = await sb.from("chat_quotas")
            .select("*").eq("user_id", user.id).eq("study_id", body.studyId).maybeSingle();
          used = cq?.messages_used ?? 0;
          if (used >= cap) {
            return new Response(JSON.stringify({
              error: "chat_cap_reached",
              message: `You've used all ${cap} chat messages for this report. Upgrade for more.`,
              cap, used, plan: planCode,
            }), {
              status: 429,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          if (cq) {
            await sb.from("chat_quotas").update({ messages_used: used + 1 }).eq("id", cq.id);
          } else {
            await sb.from("chat_quotas").insert({
              user_id: user.id, study_id: body.studyId, messages_used: 1,
            });
          }
        }
      } catch (e) {
        console.warn("quota check failed (continuing as free):", e);
      }
    }

    const findingsTxt = (body.findings ?? []).slice(0, 30).map((f, i) =>
      `${i + 1}. [${f.severity.toUpperCase()}] ${f.title}` +
      (f.anatomicalRegion ? ` — ${f.anatomicalRegion}` : "") +
      (f.icd10Code ? ` (ICD-10 ${f.icd10Code})` : "") +
      (f.impression ? `\n   Impression: ${f.impression}` : "") +
      (f.recommendation ? `\n   Next step: ${f.recommendation}` : ""),
    ).join("\n");

    const language = (body.language ?? "English").trim();

    const system = `${DOMAIN_PROMPTS[body.domain] ?? DOMAIN_PROMPTS.allopathy}
${SAFETY}

REPORT CONTEXT (do not repeat verbatim — reason from it):
Modality: ${body.modality}
Doctor's narrative: ${body.narrative ?? "(none)"}
Findings:
${findingsTxt || "(no findings)"}

OUTPUT LANGUAGE: Respond in ${language}. If the language is not English, give ALL prose in
${language} but keep classical-text quotations in their original script (Devanagari / Tamil /
Arabic) followed by ${language} meaning.
Use clear short paragraphs. Use markdown headings sparingly.`;

    const ctx = (body.messages ?? []).slice(-limits.context_window_msgs);
    const messages: ChatMsg[] = [{ role: "system", content: system }, ...ctx];

    try {
      const result = await runChatCascade({
        messages: messages as ChatMessage[],
        modelSlug: "kimi-k2.6",
        vision: false,
        temperature: 0.4,
        maxTokens: limits.max_tokens_per_reply,
        stream: true,
        title: "Manthana — Report Chat",
      });
      if (!result.streamBody) {
        return new Response(JSON.stringify({ error: "no_stream_body" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(result.streamBody, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "x-manthana-provider": result.provider,
        },
      });
    } catch (cascadeErr) {
      const msg = cascadeErr instanceof Error ? cascadeErr.message : "unknown";
      console.error("domain-report-chat cascade failed:", msg);
      const status = msg.startsWith("no_ai_provider") ? 503 : 502;
      return new Response(JSON.stringify({ error: msg }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    console.error("domain-report-chat:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
