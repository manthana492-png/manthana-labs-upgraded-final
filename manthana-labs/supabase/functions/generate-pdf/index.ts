// generate-pdf — GET /functions/v1/generate-pdf?id={study_id}
// Returns a clean, programmatic PDF of a reviewed study using pdf-lib.
// Refuses to generate (403) if the study is not yet review-confirmed.
//
// Design choices:
//   • pdf-lib (not WeasyPrint/puppeteer) — works in Deno without external services.
//   • All studies → neutral "AI-ASSISTED ANALYSIS · CLINICIAN-REVIEWED" banner.
//   • Watermark on every page: "REVIEWED BY DR. {name} ON {date}".
//   • Disclaimer footer on every page.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "https://esm.sh/pdf-lib@1.17.1";
import { corsHeaders } from "../_shared/cors.ts";
import { getAuthCtx } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/audit.ts";

const SEVERITY_COLOR: Record<string, [number, number, number]> = {
  critical: [0.78, 0.05, 0.10],
  high:     [0.92, 0.42, 0.05],
  medium:   [0.85, 0.66, 0.10],
  low:      [0.20, 0.55, 0.20],
};

const DISCLAIMER =
  "AI-assisted analysis. Reviewed by a licensed clinician. Not a substitute for professional medical judgment. " +
  "For research and clinical-decision-support use only.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ctx = await getAuthCtx(req);
  if (!ctx) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return new Response(JSON.stringify({ error: "missing_id" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: study, error } = await ctx.admin
    .from("studies").select("*").eq("id", id).maybeSingle();
  if (error || !study) {
    return new Response(JSON.stringify({ error: error?.message ?? "not_found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (study.user_id !== ctx.userId) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!study.review_confirmed_at) {
    return new Response(JSON.stringify({ error: "review_required" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: findings } = await ctx.admin
    .from("findings").select("*").eq("study_id", id)
    .order("display_order", { ascending: true });

  const { data: profile } = await ctx.admin
    .from("profiles").select("full_name, council_number, specialty, council_body")
    .eq("id", ctx.userId).maybeSingle();

  const doctorName = profile?.full_name ?? ctx.email ?? "Reviewing Clinician";
  const reviewedDate = new Date(study.review_confirmed_at).toLocaleString("en-IN", {
    dateStyle: "medium", timeStyle: "short",
  });

  // ── Build PDF ───────────────────────────────────────────────────────────
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Manthana Report — ${study.modality_label}`);
  pdf.setAuthor("Manthana Imaging Studio");
  pdf.setProducer("Manthana / pdf-lib");
  pdf.setCreator("Quaasx108 Pvt Ltd");

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const PAGE_W = 595.28; // A4
  const PAGE_H = 841.89;
  const MARGIN = 48;
  const tier = study.tier as "A" | "B" | "C";
  const isResearch = tier === "C";
  const bannerColor = rgb(0.10, 0.45, 0.55);
  const bannerText = "AI-ASSISTED ANALYSIS · CLINICIAN-REVIEWED";

  // State threaded through draw calls
  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN + 80) {
      drawFooter(page, font, doctorName, reviewedDate);
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
      drawHeader(page, fontBold, font, study, bannerColor, bannerText);
      y -= 90;
    }
  }

  function drawText(text: string, opts: { size?: number; bold?: boolean; italic?: boolean; color?: [number,number,number]; indent?: number; lineHeight?: number } = {}) {
    const size = opts.size ?? 10;
    const f = opts.bold ? fontBold : opts.italic ? fontItalic : font;
    const color = opts.color ? rgb(...opts.color) : rgb(0.1, 0.1, 0.12);
    const indent = opts.indent ?? 0;
    const lineHeight = opts.lineHeight ?? size * 1.35;
    const maxWidth = PAGE_W - MARGIN * 2 - indent;
    const lines = wrapText(text, f, size, maxWidth);
    for (const line of lines) {
      ensureSpace(lineHeight);
      page.drawText(line, { x: MARGIN + indent, y: y - size, size, font: f, color });
      y -= lineHeight;
    }
  }

  function divider() {
    ensureSpace(12);
    page.drawLine({
      start: { x: MARGIN, y: y - 4 },
      end:   { x: PAGE_W - MARGIN, y: y - 4 },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.88),
    });
    y -= 14;
  }

  // Page 1 header
  drawHeader(page, fontBold, font, study, bannerColor, bannerText);
  y -= 90;

  // Title
  drawText(study.modality_label, { size: 16, bold: true });
  drawText(`${study.modality_category} • Tier ${tier}`, { size: 10, color: [0.4, 0.4, 0.45] });
  y -= 6;
  divider();

  // Metadata block
  drawText("Study details", { size: 12, bold: true });
  const meta: Array<[string, string]> = [
    ["Patient reference",  study.patient_ref_short || "—"],
    ["Images / videos",    `${study.images_count} image(s), ${study.videos_count} video(s)`],
    ["Created",            new Date(study.created_at).toLocaleString("en-IN")],
    ["Reviewed by",        `Dr. ${doctorName}${profile?.specialty ? " · " + profile.specialty : ""}`],
    ["Council number",     profile?.council_number || "—"],
    ["Reviewed at",        reviewedDate],
  ];
  for (const [k, v] of meta) {
    ensureSpace(14);
    page.drawText(`${k}:`, { x: MARGIN, y: y - 10, size: 10, font: fontBold, color: rgb(0.3, 0.3, 0.36) });
    page.drawText(v,        { x: MARGIN + 130, y: y - 10, size: 10, font, color: rgb(0.1, 0.1, 0.12) });
    y -= 14;
  }
  y -= 6;
  divider();

  // Narrative
  drawText("Clinical narrative", { size: 12, bold: true });
  drawText(study.narrative ?? "—", { size: 10, lineHeight: 14 });
  y -= 8;

  // Information gaps + caveat (Tier C)
  const gaps = (study.information_gaps as string[] | null) ?? [];
  if (gaps.length) {
    drawText("Information gaps", { size: 11, bold: true });
    for (const g of gaps) drawText("• " + g, { size: 10, indent: 8 });
    y -= 4;
  }
  if (study.foundation_model_caveat) {
    drawText("Foundation-model caveat", { size: 11, bold: true, color: [0.65, 0.30, 0.10] });
    drawText(study.foundation_model_caveat, { size: 10, italic: true });
    y -= 4;
  }
  divider();

  // Findings
  drawText(`Findings (${(findings ?? []).length})`, { size: 12, bold: true });
  if (!findings?.length) {
    drawText("No discrete findings reported.", { size: 10, italic: true });
  } else {
    for (let i = 0; i < findings.length; i++) {
      const f = findings[i];
      ensureSpace(60);
      const sevColor = SEVERITY_COLOR[f.severity] ?? [0.4, 0.4, 0.4];
      // Severity pill
      const pillW = 60;
      page.drawRectangle({
        x: MARGIN, y: y - 14, width: pillW, height: 14,
        color: rgb(...sevColor),
      });
      page.drawText(f.severity.toUpperCase(), {
        x: MARGIN + 6, y: y - 11, size: 8, font: fontBold, color: rgb(1, 1, 1),
      });
      // Title
      page.drawText(`${i + 1}. ${truncate(f.title, 70)}`, {
        x: MARGIN + pillW + 8, y: y - 11, size: 11, font: fontBold, color: rgb(0.1, 0.1, 0.12),
      });
      // Confidence right-aligned
      const confText = `Confidence ${(Number(f.confidence) * 100).toFixed(0)}%`;
      const confW = font.widthOfTextAtSize(confText, 9);
      page.drawText(confText, {
        x: PAGE_W - MARGIN - confW, y: y - 11, size: 9, font, color: rgb(0.4, 0.4, 0.45),
      });
      y -= 20;

      if (f.anatomical_region || f.region) {
        drawText(`Region: ${f.anatomical_region ?? f.region}`, { size: 9, indent: 8, color: [0.4, 0.4, 0.45] });
      }
      if (f.observation)    drawText(`Observation: ${f.observation}`,       { size: 10, indent: 8 });
      if (f.impression)     drawText(`Impression: ${f.impression}`,         { size: 10, indent: 8, bold: true });
      if (f.description && f.description !== f.observation) {
        drawText(f.description, { size: 10, indent: 8 });
      }
      if (f.recommendation) drawText(`Recommendation: ${f.recommendation}`, { size: 10, indent: 8, color: [0.10, 0.40, 0.65] });
      const codes: string[] = [];
      if (f.icd10_code)  codes.push(`ICD-10 ${f.icd10_code}${f.icd10_label ? " — " + f.icd10_label : ""}`);
      if (f.snomed_code) codes.push(`SNOMED ${f.snomed_code}${f.snomed_label ? " — " + f.snomed_label : ""}`);
      if (codes.length)  drawText(codes.join("  ·  "), { size: 9, indent: 8, color: [0.35, 0.35, 0.40] });
      if (f.urgency && f.urgency !== "routine") {
        drawText(`Urgency: ${f.urgency.toUpperCase()}`, { size: 9, indent: 8, bold: true, color: f.urgency === "stat" ? [0.78, 0.05, 0.10] : [0.85, 0.45, 0.05] });
      }
      const diffs = (f.differentials as Array<{ dx: string; likelihood: number }> | null) ?? [];
      if (diffs.length) {
        drawText("Differentials:", { size: 9, indent: 8, bold: true });
        for (const d of diffs.slice(0, 5)) {
          drawText(`• ${d.dx} (${(d.likelihood * 100).toFixed(0)}%)`, { size: 9, indent: 16 });
        }
      }
      y -= 6;
    }
  }
  divider();

  // Reviewing doctor's note
  if (study.reviewing_doctor_note) {
    drawText("Reviewing clinician's note", { size: 12, bold: true });
    drawText(study.reviewing_doctor_note, { size: 10, italic: true });
    y -= 6;
  }

  // Reference link footer
  drawText("Reference: PubMed Central — https://www.ncbi.nlm.nih.gov/pmc/", { size: 9, color: [0.3, 0.4, 0.7] });

  // Footers + watermarks across all pages
  for (const p of pdf.getPages()) {
    drawFooter(p, font, doctorName, reviewedDate);
    drawWatermark(p, fontBold, doctorName, reviewedDate);
  }

  const bytes = await pdf.save();

  await writeAudit(ctx.admin, {
    userId: ctx.userId,
    actorEmail: ctx.email,
    action: "study.pdf_generated",
    entityType: "study",
    entityId: id,
    metadata: { tier, findings_count: findings?.length ?? 0 },
  });

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="manthana-${id.slice(0, 8)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
});

// ── Helpers ────────────────────────────────────────────────────────────────
function drawHeader(
  page: PDFPage, fontBold: PDFFont, font: PDFFont,
  study: Record<string, unknown>, bannerColor: ReturnType<typeof rgb>, bannerText: string,
) {
  const w = page.getWidth();
  // Brand strip
  page.drawRectangle({ x: 0, y: page.getHeight() - 36, width: w, height: 36, color: rgb(0.06, 0.09, 0.16) });
  page.drawText("Manthana Imaging Studio", {
    x: 48, y: page.getHeight() - 24, size: 13, font: fontBold, color: rgb(1, 1, 1),
  });
  page.drawText("A product of Quaasx108 Pvt Ltd", {
    x: 48, y: page.getHeight() - 36 + 4, size: 8, font, color: rgb(0.7, 0.75, 0.85),
  });
  // Banner
  page.drawRectangle({
    x: 0, y: page.getHeight() - 60, width: w, height: 24, color: bannerColor,
  });
  page.drawText(bannerText, {
    x: 48, y: page.getHeight() - 53, size: 11, font: fontBold, color: rgb(1, 1, 1),
  });
}

function drawFooter(page: PDFPage, font: PDFFont, doctorName: string, reviewedDate: string) {
  const w = page.getWidth();
  page.drawLine({
    start: { x: 48, y: 48 }, end: { x: w - 48, y: 48 },
    thickness: 0.5, color: rgb(0.85, 0.85, 0.88),
  });
  const lines = wrapText(DISCLAIMER, font, 8, w - 96);
  let yy = 36;
  for (const line of lines) {
    page.drawText(line, { x: 48, y: yy, size: 8, font, color: rgb(0.4, 0.4, 0.45) });
    yy -= 10;
  }
  // Reviewed line
  page.drawText(`Reviewed by Dr. ${doctorName} · ${reviewedDate}`, {
    x: 48, y: 14, size: 7, font, color: rgb(0.5, 0.5, 0.55),
  });
}

function drawWatermark(page: PDFPage, fontBold: PDFFont, doctorName: string, reviewedDate: string) {
  const w = page.getWidth();
  const h = page.getHeight();
  const text = `REVIEWED BY DR. ${doctorName.toUpperCase()} ON ${reviewedDate}`;
  const size = 36;
  const textWidth = fontBold.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: (w - textWidth) / 2,
    y: h / 2,
    size,
    font: fontBold,
    color: rgb(0.92, 0.92, 0.95),
    opacity: 0.25,
    rotate: { type: "degrees", angle: 35 } as unknown as never,
  });
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    const words = para.split(/\s+/);
    let line = "";
    for (const w of words) {
      const candidate = line ? line + " " + w : w;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        out.push(line);
        line = w;
      } else {
        line = candidate;
      }
    }
    if (line) out.push(line);
    if (!para) out.push("");
  }
  return out;
}

function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }
