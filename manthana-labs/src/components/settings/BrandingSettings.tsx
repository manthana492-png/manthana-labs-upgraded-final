import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Upload, Crown, Sparkles, ImageIcon, PenTool, Save } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import {
  DEFAULT_BRANDING,
  fetchMyBranding,
  saveMyBranding,
  uploadBrandingAsset,
  getBrandingAssetUrl,
  type DoctorBranding,
  type BrandingTemplate,
} from "@/lib/branding";
import { usePlan, isProOrAbove } from "@/lib/usePlan";
import { BrandingReportPreview } from "@/components/settings/BrandingReportPreview";

const TEMPLATES: { value: BrandingTemplate; label: string; desc: string }[] = [
  { value: "classic", label: "Classic", desc: "Centred header, full letterhead, formal" },
  { value: "modern", label: "Modern", desc: "Left logo, accent stripe, condensed" },
  { value: "compact", label: "Compact", desc: "Single-line header, max content density" },
];

/** Resolve possibly-private storage paths into displayable signed URLs. */
function useResolvedUrls(branding: DoctorBranding) {
  const [logo, setLogo] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getBrandingAssetUrl(branding.logo_url).then((u) => alive && setLogo(u));
    getBrandingAssetUrl(branding.signature_url).then((u) => alive && setSig(u));
    return () => { alive = false; };
  }, [branding.logo_url, branding.signature_url]);
  return { logoSrc: logo, sigSrc: sig };
}

export function BrandingSettings() {
  const { plan, loading: planLoading } = usePlan();
  const allowed = isProOrAbove(plan);
  const [branding, setBranding] = useState<DoctorBranding>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "signature" | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const sigInput = useRef<HTMLInputElement>(null);
  const { logoSrc, sigSrc } = useResolvedUrls(branding);

  useEffect(() => {
    (async () => {
      try {
        const b = await fetchMyBranding();
        if (b) setBranding(b);
      } catch (e) {
        console.warn("branding fetch failed", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = <K extends keyof DoctorBranding>(k: K, v: DoctorBranding[K]) =>
    setBranding((b) => ({ ...b, [k]: v }));

  const handleUpload = async (file: File, kind: "logo" | "signature") => {
    setUploading(kind);
    try {
      const url = await uploadBrandingAsset(file, kind);
      set(kind === "logo" ? "logo_url" : "signature_url", url);
      toast.success(`${kind === "logo" ? "Logo" : "Signature"} uploaded`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await saveMyBranding(branding);
      setBranding(saved);
      toast.success("Branding saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (planLoading || loading) {
    return (
      <section className="surface-clinical p-6 mt-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading branding…
        </div>
      </section>
    );
  }

  if (!allowed) {
    return (
      <section className="surface-clinical p-6 mt-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-display text-xl tracking-tight inline-flex items-center gap-2">
              <Crown className="h-5 w-5 text-primary" /> Report branding
            </h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-lg">
              Add your clinic name, logo, signature, and footer to every PDF. Choose from
              multiple letterhead templates. Available on <strong>Pro</strong> and{" "}
              <strong>Pro+</strong> plans.
            </p>
          </div>
          <Button asChild className="bg-primary hover:bg-primary/90">
            <Link to="/app/billing">
              <Sparkles className="h-4 w-4 mr-1.5" /> Upgrade to Pro
            </Link>
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="surface-clinical p-6 mt-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-xl tracking-tight inline-flex items-center gap-2">
            <Crown className="h-5 w-5 text-primary" /> Report branding
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Your letterhead appears on every signed PDF. Manthana‑Labs attribution remains in the footer.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm">Enable</Label>
          <Switch checked={branding.enabled} onCheckedChange={(v) => set("enabled", v)} />
        </div>
      </div>

      {/* Template */}
      <div className="mt-6 space-y-2">
        <Label>Layout template</Label>
        <Select value={branding.template} onValueChange={(v) => set("template", v as BrandingTemplate)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {TEMPLATES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                <span className="font-medium">{t.label}</span>
                <span className="text-xs text-muted-foreground ml-2">— {t.desc}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Logo + signature */}
      <div className="mt-6 grid sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5"><ImageIcon className="h-4 w-4" /> Clinic / lab logo</Label>
          <div className="rounded-xl border border-dashed border-border bg-surface p-4 flex items-center gap-3">
            {branding.logo_url ? (
              <img src={logoSrc ?? undefined} alt="logo" className="h-16 w-16 object-contain bg-white rounded-md p-1" />
            ) : (
              <div className="h-16 w-16 rounded-md bg-muted flex items-center justify-center text-xs text-muted-foreground">No logo</div>
            )}
            <div className="flex-1">
              <input
                ref={logoInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                hidden
                onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], "logo")}
              />
              <Button size="sm" variant="outline" onClick={() => logoInput.current?.click()} disabled={uploading === "logo"}>
                {uploading === "logo"
                  ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Uploading…</>
                  : <><Upload className="h-3.5 w-3.5 mr-1.5" /> Upload logo</>}
              </Button>
              {branding.logo_url && (
                <Button size="sm" variant="ghost" className="ml-1" onClick={() => set("logo_url", null)}>Remove</Button>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5"><PenTool className="h-4 w-4" /> Signature image</Label>
          <div className="rounded-xl border border-dashed border-border bg-surface p-4 flex items-center gap-3">
            {branding.signature_url ? (
              <img src={sigSrc ?? undefined} alt="signature" className="h-16 w-32 object-contain bg-white rounded-md p-1" />
            ) : (
              <div className="h-16 w-32 rounded-md bg-muted flex items-center justify-center text-xs text-muted-foreground">No signature</div>
            )}
            <div className="flex-1">
              <input
                ref={sigInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], "signature")}
              />
              <Button size="sm" variant="outline" onClick={() => sigInput.current?.click()} disabled={uploading === "signature"}>
                {uploading === "signature"
                  ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Uploading…</>
                  : <><Upload className="h-3.5 w-3.5 mr-1.5" /> Upload signature</>}
              </Button>
              {branding.signature_url && (
                <Button size="sm" variant="ghost" className="ml-1" onClick={() => set("signature_url", null)}>Remove</Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Letterhead fields */}
      <div className="mt-6 grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Clinic / lab name</Label>
          <Input value={branding.clinic_name ?? ""} onChange={(e) => set("clinic_name", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Doctor name</Label>
          <Input value={branding.doctor_name ?? ""} onChange={(e) => set("doctor_name", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Credentials (e.g. MBBS, MD Radiology)</Label>
          <Input value={branding.credentials ?? ""} onChange={(e) => set("credentials", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Phone</Label>
          <Input value={branding.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Address</Label>
          <Input value={branding.address ?? ""} onChange={(e) => set("address", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Contact email (shown on report)</Label>
          <Input value={branding.email ?? ""} onChange={(e) => set("email", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Accent color</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={branding.accent_color ?? "#0ea5e9"}
              onChange={(e) => set("accent_color", e.target.value)}
              className="h-10 w-14 rounded border border-border bg-transparent cursor-pointer"
            />
            <Input
              value={branding.accent_color ?? ""}
              onChange={(e) => set("accent_color", e.target.value)}
              className="font-mono"
            />
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-1.5">
        <Label>Footer disclaimer (custom)</Label>
        <Textarea
          rows={3}
          value={branding.footer_disclaimer ?? ""}
          onChange={(e) => set("footer_disclaimer", e.target.value)}
          placeholder="e.g. This report is generated by Dr. X for diagnostic guidance only."
        />
      </div>

      {/* Live preview */}
      <div className="mt-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Header preview
          </Label>
          <BrandingReportPreview branding={branding} />
        </div>
        <BrandingHeaderPreview branding={branding} logoSrc={logoSrc} />
        <p className="text-[11px] text-muted-foreground mt-2">
          Tap <strong>Preview full report</strong> to see a complete multi-section mock report —
          letterhead, impression, findings, recommendations, signature and footer — exactly how
          your branded PDF will look.
        </p>
      </div>

      <div className="mt-6 flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90">
          {saving
            ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…</>
            : <><Save className="h-4 w-4 mr-1.5" /> Save branding</>}
        </Button>
      </div>
    </section>
  );
}

function BrandingHeaderPreview({ branding, logoSrc }: { branding: DoctorBranding; logoSrc: string | null }) {
  const accent = branding.accent_color ?? "#0ea5e9";
  if (branding.template === "compact") {
    return (
      <div className="mt-2 rounded-xl border border-border bg-white text-black p-3 flex items-center gap-3">
        {logoSrc && <img src={logoSrc} className="h-8 w-8 object-contain" alt="" />}
        <div className="text-sm font-semibold flex-1 truncate">{branding.clinic_name || "Your Clinic Name"}</div>
        <div className="text-xs text-neutral-600 truncate">{branding.doctor_name} {branding.credentials && `· ${branding.credentials}`}</div>
        <div className="h-1 w-12 rounded-full" style={{ background: accent }} />
      </div>
    );
  }
  if (branding.template === "modern") {
    return (
      <div className="mt-2 rounded-xl border border-border bg-white text-black overflow-hidden">
        <div className="h-1.5" style={{ background: accent }} />
        <div className="p-4 flex items-center gap-4">
          {logoSrc
            ? <img src={logoSrc} className="h-14 w-14 object-contain" alt="" />
            : <div className="h-14 w-14 rounded bg-neutral-100" />}
          <div className="flex-1 min-w-0">
            <div className="text-lg font-bold tracking-tight truncate">{branding.clinic_name || "Your Clinic Name"}</div>
            <div className="text-xs text-neutral-600 truncate">{branding.address}</div>
          </div>
          <div className="text-right text-xs text-neutral-700">
            <div className="font-semibold">{branding.doctor_name}</div>
            <div>{branding.credentials}</div>
            <div>{branding.phone} · {branding.email}</div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-2 rounded-xl border border-border bg-white text-black p-5 text-center">
      {logoSrc && <img src={logoSrc} className="h-14 mx-auto object-contain mb-2" alt="" />}
      <div className="text-xl font-bold tracking-tight" style={{ color: accent }}>
        {branding.clinic_name || "Your Clinic Name"}
      </div>
      <div className="text-xs text-neutral-600 mt-0.5">{branding.address}</div>
      <div className="text-xs text-neutral-600">{branding.phone} · {branding.email}</div>
      <div className="mt-2 pt-2 border-t border-neutral-200 text-xs">
        <span className="font-semibold">{branding.doctor_name}</span>
        {branding.credentials && <span className="text-neutral-600"> · {branding.credentials}</span>}
      </div>
    </div>
  );
}
