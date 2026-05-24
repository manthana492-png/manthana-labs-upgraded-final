import { supabase } from "@/integrations/supabase/client";

export type BrandingTemplate = "classic" | "modern" | "compact";

export interface DoctorBranding {
  id?: string;
  user_id?: string;
  clinic_name: string | null;
  doctor_name: string | null;
  credentials: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  accent_color: string | null;
  footer_disclaimer: string | null;
  template: BrandingTemplate;
  logo_url: string | null;
  signature_url: string | null;
  enabled: boolean;
}

export const DEFAULT_BRANDING: DoctorBranding = {
  clinic_name: "",
  doctor_name: "",
  credentials: "",
  address: "",
  phone: "",
  email: "",
  accent_color: "#0ea5e9",
  footer_disclaimer: "",
  template: "classic",
  logo_url: null,
  signature_url: null,
  enabled: true,
};

export async function fetchMyBranding(): Promise<DoctorBranding | null> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) return null;
  const { data, error } = await supabase
    .from("doctor_branding")
    .select("*")
    .eq("user_id", uid)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as DoctorBranding) ?? null;
}

export async function saveMyBranding(b: Partial<DoctorBranding>): Promise<DoctorBranding> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) throw new Error("Not authenticated");
  const payload = { ...b, user_id: uid };
  const { data, error } = await supabase
    .from("doctor_branding")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as DoctorBranding;
}

/**
 * Upload a branding asset (logo / signature) to the private bucket.
 * Returns the storage path (e.g. "<uid>/logo-1234.png"). Use
 * `getBrandingAssetUrl(path)` to obtain a short-lived signed URL for display.
 */
export async function uploadBrandingAsset(
  file: File,
  kind: "logo" | "signature",
): Promise<string> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) throw new Error("Not authenticated");
  const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
  const path = `${uid}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("doctor-branding")
    .upload(path, file, { upsert: true, cacheControl: "3600", contentType: file.type });
  if (error) throw error;
  return path;
}

/**
 * Resolve a stored branding asset reference (either a legacy public URL or a
 * storage path) into a usable URL. Private bucket paths get a 1-hour signed URL.
 */
export async function getBrandingAssetUrl(ref: string | null): Promise<string | null> {
  if (!ref) return null;
  // Legacy: full URL already (public bucket era) — return as-is.
  if (/^https?:\/\//i.test(ref)) return ref;
  const { data, error } = await supabase.storage
    .from("doctor-branding")
    .createSignedUrl(ref, 60 * 60);
  if (error || !data) return null;
  return data.signedUrl;
}
