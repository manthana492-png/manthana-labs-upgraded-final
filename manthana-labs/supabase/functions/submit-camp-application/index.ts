// Receives free-camp application submissions from clinics / institutions.
// Stores to `camp_applications`. Notification delivery (email) happens via the
// Quaasx108 review team mailbox info@quaasx108.com (manual review).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  applicant_kind: "clinic" | "institution";
  organisation_name: string;
  registration_number: string;
  doctor_council_number?: string;
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
  city?: string;
  state?: string;
  expected_patients?: number;
  expected_scans_per_month?: number;
  camp_dates?: string;
  purpose: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "unauthorized" }, 401);
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: userRes } = await sb.auth.getUser();
    const user = userRes?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const b = (await req.json()) as Body;
    if (!b.organisation_name || !b.registration_number || !b.purpose ||
        !b.contact_name || !b.contact_email) {
      return json({ error: "missing required fields" }, 400);
    }

    const { data, error } = await sb.from("camp_applications").insert({
      user_id: user.id,
      applicant_kind: b.applicant_kind,
      organisation_name: b.organisation_name,
      registration_number: b.registration_number,
      doctor_council_number: b.doctor_council_number,
      contact_name: b.contact_name,
      contact_email: b.contact_email,
      contact_phone: b.contact_phone,
      city: b.city,
      state: b.state,
      expected_patients: b.expected_patients,
      expected_scans_per_month: b.expected_scans_per_month,
      camp_dates: b.camp_dates,
      purpose: b.purpose,
    }).select().single();
    if (error) throw error;

    return json({ id: data.id, status: data.status });
  } catch (err) {
    console.error("submit-camp-application:", err);
    return json({ error: "An unexpected error occurred. Please try again." }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
