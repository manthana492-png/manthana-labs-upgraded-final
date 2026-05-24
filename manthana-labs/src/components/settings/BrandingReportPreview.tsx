import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, BadgeCheck, ShieldCheck, Activity, FileText, Stethoscope, AlertTriangle, Sparkles } from "lucide-react";
import type { DoctorBranding } from "@/lib/branding";
import { getBrandingAssetUrl } from "@/lib/branding";
import { cn } from "@/lib/utils";

interface Props {
  branding: DoctorBranding;
}

/**
 * Premium full-page mock PDF preview for the branding settings panel.
 * Shows clinicians exactly how a finalised, signed report will look on
 * paper with their letterhead, accent, signature and footer applied.
 *
 * Pure presentation — uses fully realistic, but fictional, sample data
 * (CT chest abnormal study). Renders at A4 proportions inside a
 * scrollable dialog so the layout matches the real PDF generator.
 */
export function BrandingReportPreview({ branding }: Props) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Eye className="h-4 w-4" /> Preview full report
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-w-5xl w-[95vw] max-h-[92vh] overflow-y-auto p-0 gap-0"
        // Force light surface so the mock paper always reads correctly
        // regardless of the active app theme.
      >
        <DialogHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-6 py-3 flex-row items-center justify-between space-y-0">
          <div>
            <DialogTitle className="inline-flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary" /> Report preview
              <Badge variant="secondary" className="ml-1 text-[0.65rem] uppercase tracking-wider">
                Mock data
              </Badge>
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Exactly how your branded PDF will look. Your real reports will use this layout with
              the live study data.
            </p>
          </div>
        </DialogHeader>

        <div className="p-4 sm:p-8 bg-muted/40">
          <MockReportPaper branding={branding} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────  Mock report  ───────────────────────── */

function MockReportPaper({ branding }: Props) {
  const accent = branding.accent_color || "#0ea5e9";
  const clinicName = branding.clinic_name || "Your Clinic Name";
  const doctorName = branding.doctor_name || "Dr. Anuradha Rao";
  const credentials = branding.credentials || "MBBS, MD Radiology";
  const address = branding.address || "12, Jayanagar 4th Block, Bengaluru 560011";
  const phone = branding.phone || "+91 98456 12345";
  const email = branding.email || "reports@yourclinic.in";
  const footerDisclaimer =
    branding.footer_disclaimer ||
    "This report is generated with AI-assisted clinical decision support and finalised by the signing clinician for diagnostic guidance only.";

  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const [sigSrc, setSigSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getBrandingAssetUrl(branding.logo_url).then((u) => alive && setLogoSrc(u));
    getBrandingAssetUrl(branding.signature_url).then((u) => alive && setSigSrc(u));
    return () => { alive = false; };
  }, [branding.logo_url, branding.signature_url]);

  return (
    <article
      className="mx-auto bg-white text-neutral-900 shadow-2xl rounded-md overflow-hidden"
      style={{
        // A4 portrait proportion (1:1.414), capped width
        width: "min(840px, 100%)",
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
      }}
    >
      {/* ─── Letterhead ─── */}
      <Letterhead
        template={branding.template}
        accent={accent}
        clinicName={clinicName}
        doctorName={doctorName}
        credentials={credentials}
        address={address}
        phone={phone}
        email={email}
        logoUrl={logoSrc}
      />

      {/* Doctor-reviewed pill */}
      <div
        className="border-y px-6 py-1.5 text-[10.5px] flex items-center justify-center gap-1.5"
        style={{ background: "#f0f9ff", borderColor: "#bae6fd", color: "#0c4a6e" }}
      >
        <BadgeCheck className="h-3 w-3" /> Doctor-reviewed report — edited and finalised by the
        signing clinician
      </div>

      {/* Title bar */}
      <div className="px-6 pt-5 pb-3 flex items-end justify-between gap-4 border-b border-neutral-200">
        <div>
          <div
            className="text-[10px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: accent }}
          >
            Diagnostic Imaging Report
          </div>
          <h1 className="text-2xl font-bold tracking-tight mt-0.5">
            CT Chest — Contrast enhanced
          </h1>
          <p className="text-xs text-neutral-500 mt-1">
            Indication: Persistent dry cough × 6 weeks, low-grade fever, weight loss 4 kg
          </p>
        </div>
        <div className="text-right text-[11px] text-neutral-600 leading-relaxed shrink-0">
          <div>
            <span className="text-neutral-400">Report&nbsp;ID</span>{" "}
            <span className="font-mono">MNT-2026-04-29-0918</span>
          </div>
          <div>
            <span className="text-neutral-400">Issued</span> 29 Apr 2026, 14:32 IST
          </div>
        </div>
      </div>

      {/* ─── Patient + Study summary grid ─── */}
      <section className="px-6 py-5 grid grid-cols-2 sm:grid-cols-4 gap-4 border-b border-neutral-200">
        <SumCell label="Patient" value="Ananya R." sub="F · 42 y · MRN 4421" />
        <SumCell label="Modality" value="CT Chest" sub="64-slice MDCT · 1.0 mm" />
        <SumCell label="Referring" value="Dr. K. Iyer" sub="Pulmonology" />
        <SumCell
          label="Confidence"
          value="92%"
          sub="High — multimodel consensus"
          accent={accent}
        />
      </section>

      {/* ─── Critical / Urgency ribbon ─── */}
      <div
        className="mx-6 my-4 rounded-lg border px-4 py-3 flex items-start gap-3"
        style={{
          borderColor: "#fde68a",
          background: "#fffbeb",
          color: "#78350f",
        }}
      >
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="text-[12px] leading-snug">
          <div className="font-semibold mb-0.5">Urgency: Recommend follow-up within 7 days</div>
          One actionable finding flagged — see Impression for next-step guidance.
        </div>
      </div>

      {/* ─── Impression ─── */}
      <Section title="Impression" accent={accent} icon={<Stethoscope className="h-3.5 w-3.5" />}>
        <ol className="text-[13px] leading-relaxed text-neutral-800 list-decimal pl-5 space-y-1.5">
          <li>
            <strong>Spiculated 18 mm nodule</strong> in the right upper lobe (apico-posterior
            segment) with pleural tagging — <em>suspicious for primary malignancy.</em>
          </li>
          <li>
            Mild mediastinal lymphadenopathy (paratracheal node 11 mm) — likely reactive,
            correlate clinically.
          </li>
          <li>
            Tree-in-bud opacities, right lower lobe — features of post-infective bronchiolitis.
          </li>
        </ol>
      </Section>

      {/* ─── Findings ─── */}
      <Section title="Findings" accent={accent} icon={<Activity className="h-3.5 w-3.5" />}>
        <div className="space-y-3">
          <FindingRow
            id="F-01"
            severity="high"
            title="Right upper lobe spiculated nodule"
            body="A 17.8 × 16.2 mm spiculated soft-tissue nodule is seen in the apico-posterior segment of the right upper lobe (series 4, image 38). Pleural tagging is noted. No cavitation. Lung-RADS 4B."
            tags={["Lung-RADS 4B", "Spiculated margins", "Pleural tagging"]}
            accent={accent}
          />
          <FindingRow
            id="F-02"
            severity="medium"
            title="Right paratracheal lymphadenopathy"
            body="A right paratracheal node measures 11 × 8 mm. No necrosis. Likely reactive but warrants correlation with the primary lesion above."
            tags={["Mediastinal", "Reactive"]}
            accent={accent}
          />
          <FindingRow
            id="F-03"
            severity="low"
            title="Tree-in-bud opacities, right lower lobe"
            body="Centrilobular nodules with branching pattern in the right lower lobe — classic tree-in-bud morphology. Likely post-infective bronchiolitis; consider follow-up CT in 6–8 weeks."
            tags={["Bronchiolitis", "Follow-up 6–8 wk"]}
            accent={accent}
          />
        </div>
      </Section>

      {/* ─── Recommendations ─── */}
      <Section title="Recommendations" accent={accent} icon={<Sparkles className="h-3.5 w-3.5" />}>
        <ul className="text-[13px] leading-relaxed text-neutral-800 space-y-1.5">
          <li>
            • <strong>PET-CT</strong> within 7 days for metabolic characterisation of the RUL
            nodule.
          </li>
          <li>
            • <strong>Pulmonology referral</strong> for bronchoscopy ± EBUS-TBNA biopsy
            consideration.
          </li>
          <li>• Repeat HRCT chest at 6–8 weeks to reassess RLL bronchiolitis.</li>
          <li>• Sputum AFB ×3 and Mantoux to exclude active mycobacterial infection.</li>
        </ul>
      </Section>

      {/* ─── Differentials ─── */}
      <Section title="Differential considerations" accent={accent} icon={<FileText className="h-3.5 w-3.5" />}>
        <div className="grid grid-cols-3 gap-2 text-[12px]">
          <DiffPill name="Primary lung carcinoma" prob="High" tone="high" />
          <DiffPill name="Granulomatous disease (TB)" prob="Moderate" tone="medium" />
          <DiffPill name="Post-infective sequela" prob="Low" tone="low" />
        </div>
      </Section>

      {/* ─── Image gallery (mock) ─── */}
      <Section title="Selected images" accent={accent} icon={<Activity className="h-3.5 w-3.5" />}>
        <div className="grid grid-cols-3 gap-2">
          {["IMG 01", "IMG 02", "IMG 03"].map((label, i) => (
            <figure
              key={label}
              className="rounded-md overflow-hidden border border-neutral-200 bg-neutral-950 flex flex-col"
            >
              <div className="aspect-[4/3] flex items-center justify-center text-neutral-500 text-[10px]">
                {/* Synthetic radiological "thumbnail" — pure CSS so we never need real PHI */}
                <div
                  className="w-full h-full"
                  style={{
                    background:
                      i === 0
                        ? "radial-gradient(ellipse at 60% 40%, #cbd5e1 0%, #1f2937 35%, #0a0a0a 70%)"
                        : i === 1
                        ? "radial-gradient(ellipse at 40% 55%, #94a3b8 0%, #334155 30%, #0a0a0a 75%)"
                        : "radial-gradient(ellipse at 50% 50%, #e5e7eb 0%, #475569 25%, #0a0a0a 80%)",
                  }}
                />
              </div>
              <figcaption className="px-2 py-1 text-[9px] uppercase tracking-wider text-neutral-600 bg-white border-t border-neutral-200 flex items-center justify-between">
                <span className="font-mono">{label}</span>
                <span>CT axial</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </Section>

      {/* ─── Signature block ─── */}
      <section className="px-6 pt-4 pb-5 border-t border-neutral-200 mt-2">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="text-[11px] text-neutral-600 leading-relaxed max-w-md">
            <div className="inline-flex items-center gap-1.5 font-semibold text-neutral-800 mb-0.5">
              <ShieldCheck className="h-3.5 w-3.5" style={{ color: accent }} />
              Digitally signed &amp; verified
            </div>
            Cryptographic hash:{" "}
            <span className="font-mono">9f3e…b71c</span> · Verified against signing clinician's
            council registration.
          </div>
          <div className="text-right">
            {sigSrc ? (
              <img
                src={sigSrc}
                alt="signature"
                className="h-12 object-contain ml-auto"
              />
            ) : (
              <div
                className="italic text-2xl mb-0.5"
                style={{ fontFamily: "'Brush Script MT', 'Snell Roundhand', cursive", color: "#1e293b" }}
              >
                {doctorName}
              </div>
            )}
            <div className="border-t border-neutral-300 pt-1 mt-0.5 min-w-[200px]">
              <div className="text-[12px] font-semibold">{doctorName}</div>
              <div className="text-[10.5px] text-neutral-500">{credentials}</div>
              <div className="text-[10px] text-neutral-400 mt-0.5">Reg. No. KMC-78214</div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer
        className="px-6 py-3 text-[9.5px] leading-relaxed border-t"
        style={{ background: "#fafafa", borderColor: "#e5e7eb", color: "#525252" }}
      >
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="max-w-2xl">{footerDisclaimer}</div>
          <div className="text-right shrink-0">
            <div className="font-semibold text-neutral-700">{clinicName}</div>
            <div>Powered by Manthana-Labs · Page 1 of 1</div>
          </div>
        </div>
      </footer>
    </article>
  );
}

/* ─────────────────────────  Building blocks  ───────────────────────── */

function Letterhead({
  template,
  accent,
  clinicName,
  doctorName,
  credentials,
  address,
  phone,
  email,
  logoUrl,
}: {
  template: DoctorBranding["template"];
  accent: string;
  clinicName: string;
  doctorName: string;
  credentials: string;
  address: string;
  phone: string;
  email: string;
  logoUrl: string | null;
}) {
  if (template === "compact") {
    return (
      <header className="px-6 py-3 flex items-center gap-3 border-b border-neutral-200">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="h-9 w-9 object-contain" />
        ) : (
          <div className="h-9 w-9 rounded bg-neutral-100" />
        )}
        <div className="text-base font-bold tracking-tight flex-1 truncate">{clinicName}</div>
        <div className="text-[11px] text-neutral-600 truncate">
          {doctorName} · {credentials}
        </div>
        <div className="h-1.5 w-14 rounded-full" style={{ background: accent }} />
      </header>
    );
  }

  if (template === "modern") {
    return (
      <header>
        <div className="h-1.5" style={{ background: accent }} />
        <div className="px-6 py-4 flex items-center gap-4">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-14 w-14 object-contain" />
          ) : (
            <div className="h-14 w-14 rounded bg-neutral-100" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-xl font-bold tracking-tight truncate">{clinicName}</div>
            <div className="text-[11px] text-neutral-500 truncate">{address}</div>
          </div>
          <div className="text-right text-[11px] text-neutral-700 leading-relaxed">
            <div className="font-semibold">{doctorName}</div>
            <div>{credentials}</div>
            <div>
              {phone} · {email}
            </div>
          </div>
        </div>
      </header>
    );
  }

  // classic
  return (
    <header className="px-6 py-5 text-center border-b border-neutral-200">
      {logoUrl && <img src={logoUrl} alt="" className="h-14 mx-auto object-contain mb-2" />}
      <div className="text-2xl font-bold tracking-tight" style={{ color: accent }}>
        {clinicName}
      </div>
      <div className="text-[11px] text-neutral-600 mt-0.5">{address}</div>
      <div className="text-[11px] text-neutral-600">
        {phone} · {email}
      </div>
      <div className="mt-2 pt-2 border-t border-neutral-200 text-[11px]">
        <span className="font-semibold">{doctorName}</span>
        {credentials && <span className="text-neutral-500"> · {credentials}</span>}
      </div>
    </header>
  );
}

function Section({
  title,
  accent,
  icon,
  children,
}: {
  title: string;
  accent: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="px-6 py-4 border-b border-neutral-200 last:border-b-0">
      <h2
        className="text-[10px] font-bold uppercase tracking-[0.18em] mb-2.5 inline-flex items-center gap-1.5"
        style={{ color: accent }}
      >
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function SumCell({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: string;
}) {
  return (
    <div>
      <div className="text-[9.5px] uppercase tracking-[0.16em] text-neutral-400 font-semibold">
        {label}
      </div>
      <div
        className="text-[14px] font-semibold mt-0.5"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
      <div className="text-[10.5px] text-neutral-500 mt-0.5">{sub}</div>
    </div>
  );
}

function FindingRow({
  id,
  severity,
  title,
  body,
  tags,
  accent,
}: {
  id: string;
  severity: "low" | "medium" | "high";
  title: string;
  body: string;
  tags: string[];
  accent: string;
}) {
  const sev =
    severity === "high"
      ? { bg: "#fef2f2", border: "#fecaca", dot: "#dc2626", label: "High" }
      : severity === "medium"
      ? { bg: "#fffbeb", border: "#fde68a", dot: "#d97706", label: "Medium" }
      : { bg: "#f0fdf4", border: "#bbf7d0", dot: "#16a34a", label: "Low" };
  return (
    <div
      className="rounded-lg border p-3"
      style={{ background: sev.bg, borderColor: sev.border }}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: sev.dot }}
          />
          <span className="text-[11px] font-mono text-neutral-500">{id}</span>
          <h3 className="text-[13.5px] font-semibold text-neutral-900">{title}</h3>
        </div>
        <span
          className="text-[9.5px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded"
          style={{ background: sev.dot, color: "white" }}
        >
          {sev.label}
        </span>
      </div>
      <p className="text-[12px] text-neutral-700 leading-relaxed">{body}</p>
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span
              key={t}
              className="text-[9.5px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded border"
              style={{ borderColor: accent + "55", color: accent, background: "white" }}
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function DiffPill({
  name,
  prob,
  tone,
}: {
  name: string;
  prob: string;
  tone: "low" | "medium" | "high";
}) {
  const palette =
    tone === "high"
      ? { bg: "#fef2f2", border: "#fecaca", text: "#991b1b" }
      : tone === "medium"
      ? { bg: "#fffbeb", border: "#fde68a", text: "#854d0e" }
      : { bg: "#f0fdf4", border: "#bbf7d0", text: "#166534" };
  return (
    <div
      className={cn("rounded-md border px-2.5 py-2")}
      style={{ background: palette.bg, borderColor: palette.border }}
    >
      <div className="text-[12px] font-semibold" style={{ color: palette.text }}>
        {name}
      </div>
      <div className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: palette.text, opacity: 0.75 }}>
        Likelihood: {prob}
      </div>
    </div>
  );
}
