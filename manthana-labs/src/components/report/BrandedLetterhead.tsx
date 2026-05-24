import { useEffect, useState } from "react";
import type { DoctorBranding } from "@/lib/branding";
import { getBrandingAssetUrl } from "@/lib/branding";
import { BadgeCheck } from "lucide-react";

interface Props {
  branding: DoctorBranding;
  editedByDoctor?: boolean;
}

/**
 * PDF-only letterhead that renders inside the report capture root.
 * Hidden in the live UI (display:none) — only exposed during the PDF
 * capture pass via the [data-pdf-only="true"] CSS rule already present
 * in ReportViewer's print stylesheet.
 */
export function BrandedLetterhead({ branding, editedByDoctor }: Props) {
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getBrandingAssetUrl(branding.logo_url).then((u) => alive && setLogoSrc(u));
    return () => { alive = false; };
  }, [branding.logo_url]);

  const accent = branding.accent_color ?? "#0ea5e9";
  const tpl = branding.template;

  const Header = (
    <div style={{ background: "white", color: "#0a0a0a", borderRadius: 12, overflow: "hidden", border: "1px solid #e5e7eb" }}>
      {tpl === "modern" && <div style={{ height: 6, background: accent }} />}
      <div
        style={{
          padding: tpl === "compact" ? "12px 16px" : "20px 24px",
          display: "flex",
          alignItems: tpl === "classic" ? "stretch" : "center",
          gap: 16,
          flexDirection: tpl === "classic" ? "column" : "row",
          textAlign: tpl === "classic" ? "center" : "left",
        }}
      >
        {logoSrc && (
          <img
            src={logoSrc}
            crossOrigin="anonymous"
            alt=""
            style={{
              height: tpl === "compact" ? 36 : tpl === "classic" ? 56 : 64,
              width: "auto",
              objectFit: "contain",
              margin: tpl === "classic" ? "0 auto" : 0,
            }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: tpl === "compact" ? 16 : 22,
              fontWeight: 800,
              letterSpacing: "-0.01em",
              color: tpl === "classic" ? accent : "#0a0a0a",
            }}
          >
            {branding.clinic_name || "Clinic"}
          </div>
          {branding.address && (
            <div style={{ fontSize: 11, color: "#525252", marginTop: 2 }}>{branding.address}</div>
          )}
          {(branding.phone || branding.email) && (
            <div style={{ fontSize: 11, color: "#525252", marginTop: 2 }}>
              {branding.phone}
              {branding.phone && branding.email ? " · " : ""}
              {branding.email}
            </div>
          )}
        </div>
        {tpl !== "classic" && (
          <div style={{ textAlign: "right", fontSize: 11, color: "#404040", lineHeight: 1.4 }}>
            <div style={{ fontWeight: 700 }}>{branding.doctor_name}</div>
            {branding.credentials && <div>{branding.credentials}</div>}
          </div>
        )}
      </div>
      {tpl === "classic" && (branding.doctor_name || branding.credentials) && (
        <div style={{ borderTop: "1px solid #e5e7eb", padding: "8px 16px", fontSize: 11, textAlign: "center", color: "#404040" }}>
          <span style={{ fontWeight: 700 }}>{branding.doctor_name}</span>
          {branding.credentials && <span style={{ color: "#737373" }}> · {branding.credentials}</span>}
        </div>
      )}
      {editedByDoctor && (
        <div
          style={{
            background: "#f0f9ff",
            color: "#0c4a6e",
            borderTop: "1px solid #bae6fd",
            padding: "6px 16px",
            fontSize: 10,
            display: "flex",
            alignItems: "center",
            gap: 6,
            justifyContent: "center",
          }}
        >
          <BadgeCheck size={12} /> Doctor-reviewed report — edited and finalised by the signing clinician
        </div>
      )}
    </div>
  );

  return (
    <section data-pdf-only="true" className="hidden" style={{ marginBottom: 20 }}>
      {Header}
    </section>
  );
}
