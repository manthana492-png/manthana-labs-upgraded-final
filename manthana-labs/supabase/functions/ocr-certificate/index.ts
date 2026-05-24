// OCR + structured extraction for medical registration certificates.
//
// Accepts: { imageBase64: string, mimeType: string }
// Returns: { ok: boolean, fields: {...}, confidence: number, rawText: string, warnings: string[] }
//
// Uses Kimi K2.6 (vision) with tool-calling for structured output.
// No third-party OCR dependency — single network hop.
//
// PUBLIC: verify_jwt = false (called from the public signup page before
// the user has an account).
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { runChatCascade } from "../_shared/aiCascade.ts";

const SYSTEM_PROMPT = `You are an OCR + entity-extraction engine specialised in Indian medical registration certificates.

You will be shown an image (or PDF page) of a medical practitioner's registration certificate issued by one of:
- NMC / Indian Medical Register (Allopathy)
- State Medical Councils (e.g. MMC, TNMC, KMC, DMC)
- NCISM (Ayurveda / Unani / Siddha)
- NCH (Homoeopathy)
- DCI (Dental)

Extract every field you can read. Be conservative — if a field is illegible or absent, return null and mention it in warnings.
Detect the medical 'system' from cues (issuing body, course name like MBBS / BAMS / BHMS / BUMS / BSMS / BDS).

Set confidence between 0 and 1 reflecting how confident you are this is a genuine, legible registration certificate. Lower confidence drastically (<0.4) if:
- the image is blurry / cropped / clearly a non-medical document
- registration number or issuing body is unreadable
- the document looks tampered or hand-edited

Never invent values. Prefer null over guessing.`;

const EXTRACT_TOOL = {
  type: "function",
  function: {
    name: "extract_certificate_fields",
    description: "Return structured fields read from the registration certificate.",
    parameters: {
      type: "object",
      properties: {
        fullName: { type: ["string", "null"], description: "Practitioner's full name as printed." },
        registrationNumber: { type: ["string", "null"], description: "Council registration / IMR number, exactly as printed." },
        registrationYear: { type: ["string", "null"], description: "4-digit year of registration." },
        councilBody: {
          type: ["string", "null"],
          description: "Issuing council label, e.g. 'NMC', 'Maharashtra Medical Council', 'NCISM', 'NCH', 'DCI'.",
        },
        councilState: { type: ["string", "null"], description: "Indian state (only if state-issued)." },
        system: {
          type: ["string", "null"],
          enum: ["allopathy", "ayurveda", "homeopathy", "siddha", "unani", "dental", null],
          description: "Medical system inferred from the certificate.",
        },
        qualification: { type: ["string", "null"], description: "e.g. MBBS, BAMS, BHMS, BDS." },
        specialty: { type: ["string", "null"], description: "Specialty if mentioned (e.g. Radiology, Panchakarma)." },
        confidence: { type: "number", description: "0..1 overall confidence this is a genuine, legible certificate." },
        documentLooksGenuine: { type: "boolean", description: "True if the image plausibly shows a real registration certificate." },
        warnings: {
          type: "array",
          items: { type: "string" },
          description: "Human-readable issues (blurry, missing seal, partial crop, suspicious edits, etc.).",
        },
        rawText: { type: "string", description: "All readable text from the document, line by line." },
      },
      required: ["confidence", "documentLooksGenuine", "warnings", "rawText"],
      additionalProperties: false,
    },
  },
};

interface Body {
  imageBase64?: string;
  mimeType?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON body." }, 400);
  }

  const { imageBase64, mimeType } = body;
  if (!imageBase64 || !mimeType) {
    return jsonResponse({ ok: false, error: "imageBase64 and mimeType are required." }, 400);
  }

  // Soft size guard — base64 inflates ~33%, cap raw payload around 8 MB.
  if (imageBase64.length > 12_000_000) {
    return jsonResponse({ ok: false, error: "Document too large. Please upload an image under 8 MB." }, 413);
  }

  const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp", "application/pdf"];
  if (!allowed.includes(mimeType)) {
    return jsonResponse({ ok: false, error: "Unsupported file type. Use PNG, JPG, WEBP or PDF." }, 415);
  }

  try {
    const result = await runChatCascade({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract every field from this registration certificate. Use the extract_certificate_fields tool." },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          ],
        },
      ],
      modelSlug: "kimi-k2.6",
      vision: true,
      tools: [EXTRACT_TOOL],
      toolChoice: { type: "function", function: { name: "extract_certificate_fields" } },
      complexity: "high",
      title: "Manthana — OCR Certificate",
    });

    if (!result.toolArgs) {
      return jsonResponse({ ok: false, error: "AI returned no structured output." }, 502);
    }

    return jsonResponse({ ok: true, fields: result.toolArgs });
  } catch (err) {
    console.error("ocr-certificate error", err);
    return jsonResponse({ ok: false, error: "Unexpected error during extraction." }, 500);
  }
});
