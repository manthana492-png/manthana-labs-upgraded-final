import { useEffect, useState } from "react";
import { z } from "zod";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const schema = z.object({
  applicant_kind: z.enum(["clinic", "institution"], {
    errorMap: () => ({ message: "Select an applicant type" }),
  }),
  organisation_name: z.string().trim()
    .min(2, "Organisation name is required (min 2 characters)")
    .max(200, "Keep organisation name under 200 characters"),
  registration_number: z.string().trim()
    .min(3, "Registration number is required (min 3 characters)")
    .max(80, "Keep registration number under 80 characters"),
  doctor_council_number: z.string().trim().max(80).optional().or(z.literal("")),
  contact_name: z.string().trim()
    .min(2, "Contact name is required")
    .max(120, "Keep contact name under 120 characters"),
  contact_email: z.string().trim()
    .email("Enter a valid email address")
    .max(255, "Email too long"),
  contact_phone: z.string().trim().max(40).optional().or(z.literal("")),
  city: z.string().trim().max(100).optional().or(z.literal("")),
  state: z.string().trim().max(100).optional().or(z.literal("")),
  expected_patients: z.string().trim().optional().or(z.literal("")),
  expected_scans_per_month: z.string().trim().optional().or(z.literal("")),
  camp_dates: z.string().trim().max(120).optional().or(z.literal("")),
  purpose: z.string().trim()
    .min(20, "Please describe the purpose in at least 20 characters")
    .max(2000, "Keep the description under 2000 characters"),
});

type FormErrors = Partial<Record<keyof z.infer<typeof schema>, string>>;

const FIELD_LABELS: Record<string, string> = {
  applicant_kind: "Applicant type",
  organisation_name: "Organisation name",
  registration_number: "Registration number",
  contact_name: "Contact name",
  contact_email: "Contact email",
  purpose: "Purpose",
};

export function CampApplicationDialog({ open, onOpenChange }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
    if (!open) {
      setErrors({});
      setSubmitAttempted(false);
    }
  }, [open]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitAttempted(true);

    if (!authed) {
      toast.error("Please sign in first to submit an application.");
      return;
    }

    const fd = new FormData(e.currentTarget);
    const raw = {
      applicant_kind: String(fd.get("applicant_kind") ?? ""),
      organisation_name: String(fd.get("organisation_name") ?? ""),
      registration_number: String(fd.get("registration_number") ?? ""),
      doctor_council_number: String(fd.get("doctor_council_number") ?? ""),
      contact_name: String(fd.get("contact_name") ?? ""),
      contact_email: String(fd.get("contact_email") ?? ""),
      contact_phone: String(fd.get("contact_phone") ?? ""),
      city: String(fd.get("city") ?? ""),
      state: String(fd.get("state") ?? ""),
      expected_patients: String(fd.get("expected_patients") ?? ""),
      expected_scans_per_month: String(fd.get("expected_scans_per_month") ?? ""),
      camp_dates: String(fd.get("camp_dates") ?? ""),
      purpose: String(fd.get("purpose") ?? ""),
    };

    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const fieldErrors: FormErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormErrors;
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      const missingLabels = Object.keys(fieldErrors)
        .map((k) => FIELD_LABELS[k] ?? k)
        .slice(0, 4)
        .join(", ");
      toast.error("Please fix the highlighted fields", {
        description: missingLabels
          ? `Check: ${missingLabels}${Object.keys(fieldErrors).length > 4 ? "…" : ""}`
          : "Some fields need your attention.",
      });
      // Focus first invalid field
      const first = parsed.error.issues[0]?.path[0];
      if (first) {
        const el = document.getElementById(String(first));
        el?.focus();
      }
      return;
    }
    setErrors({});

    const v = parsed.data;
    const payload = {
      applicant_kind: v.applicant_kind,
      organisation_name: v.organisation_name,
      registration_number: v.registration_number,
      doctor_council_number: v.doctor_council_number || undefined,
      contact_name: v.contact_name,
      contact_email: v.contact_email,
      contact_phone: v.contact_phone || undefined,
      city: v.city || undefined,
      state: v.state || undefined,
      expected_patients: v.expected_patients ? Number(v.expected_patients) : undefined,
      expected_scans_per_month: v.expected_scans_per_month ? Number(v.expected_scans_per_month) : undefined,
      camp_dates: v.camp_dates || undefined,
      purpose: v.purpose,
    };

    setSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke("submit-camp-application", {
        body: payload,
      });
      if (error) throw error;
      toast.success("Application submitted", {
        description: "Our evaluating team will review and respond by email.",
      });
      onOpenChange(false);
    } catch (err) {
      toast.error("Could not submit", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const errClass = (k: keyof FormErrors) =>
    errors[k] ? "border-destructive focus-visible:ring-destructive" : "";

  const FieldError = ({ k }: { k: keyof FormErrors }) =>
    errors[k] ? (
      <p className="text-[0.7rem] text-destructive mt-1 flex items-center gap-1">
        <AlertCircle className="h-3 w-3" /> {errors[k]}
      </p>
    ) : null;

  const errorCount = Object.keys(errors).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Free Camp Programme — Application</DialogTitle>
          <DialogDescription>
            Verified clinics &amp; institutions can apply for 50–70% concession or fully
            sponsored access up to 1,000 scans / month. Decisions by our evaluating team.
          </DialogDescription>
        </DialogHeader>

        {!authed && (
          <div className="rounded-lg border border-warn/30 bg-warn-soft/40 p-3 text-xs text-warn-foreground">
            Please sign in first — your application will be tied to your verified clinician account.
          </div>
        )}

        {submitAttempted && errorCount > 0 && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive flex items-start gap-2"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">
                {errorCount} field{errorCount === 1 ? "" : "s"} need{errorCount === 1 ? "s" : ""} attention
              </div>
              <div className="opacity-80 mt-0.5">
                Required fields are marked with <span aria-hidden>*</span>. Please correct the highlighted entries.
              </div>
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="applicant_kind">Applicant type <span className="text-destructive">*</span></Label>
              <Select name="applicant_kind" defaultValue="clinic" required>
                <SelectTrigger id="applicant_kind" className={cn(errClass("applicant_kind"))}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="clinic">Registered clinic</SelectItem>
                  <SelectItem value="institution">Medical-education institution</SelectItem>
                </SelectContent>
              </Select>
              <FieldError k="applicant_kind" />
            </div>
            <div>
              <Label htmlFor="organisation_name">
                Organisation name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="organisation_name"
                name="organisation_name"
                aria-invalid={!!errors.organisation_name}
                className={cn(errClass("organisation_name"))}
              />
              <FieldError k="organisation_name" />
            </div>
            <div>
              <Label htmlFor="registration_number">
                Clinic / institution registration # <span className="text-destructive">*</span>
              </Label>
              <Input
                id="registration_number"
                name="registration_number"
                aria-invalid={!!errors.registration_number}
                className={cn(errClass("registration_number"))}
              />
              <FieldError k="registration_number" />
            </div>
            <div>
              <Label htmlFor="doctor_council_number">Lead doctor council #</Label>
              <Input
                id="doctor_council_number"
                name="doctor_council_number"
                className={cn(errClass("doctor_council_number"))}
              />
              <FieldError k="doctor_council_number" />
            </div>
            <div>
              <Label htmlFor="contact_name">
                Contact name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="contact_name"
                name="contact_name"
                aria-invalid={!!errors.contact_name}
                className={cn(errClass("contact_name"))}
              />
              <FieldError k="contact_name" />
            </div>
            <div>
              <Label htmlFor="contact_email">
                Contact email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="contact_email"
                name="contact_email"
                type="email"
                aria-invalid={!!errors.contact_email}
                className={cn(errClass("contact_email"))}
              />
              <FieldError k="contact_email" />
            </div>
            <div>
              <Label htmlFor="contact_phone">Phone</Label>
              <Input id="contact_phone" name="contact_phone" className={cn(errClass("contact_phone"))} />
              <FieldError k="contact_phone" />
            </div>
            <div>
              <Label htmlFor="city">City</Label>
              <Input id="city" name="city" />
            </div>
            <div>
              <Label htmlFor="state">State</Label>
              <Input id="state" name="state" />
            </div>
            <div>
              <Label htmlFor="camp_dates">Camp dates</Label>
              <Input id="camp_dates" name="camp_dates" placeholder="e.g. 12–14 June 2026" />
            </div>
            <div>
              <Label htmlFor="expected_patients">Expected patients</Label>
              <Input id="expected_patients" name="expected_patients" type="number" min="0" />
            </div>
            <div>
              <Label htmlFor="expected_scans_per_month">Expected scans / month</Label>
              <Input id="expected_scans_per_month" name="expected_scans_per_month" type="number" min="0" />
            </div>
          </div>
          <div>
            <Label htmlFor="purpose">
              Purpose &amp; population served <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="purpose"
              name="purpose"
              placeholder="Brief description of who you serve and why this camp matters (min 20 characters)."
              rows={4}
              aria-invalid={!!errors.purpose}
              className={cn(errClass("purpose"))}
            />
            <FieldError k="purpose" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !authed} className="bg-primary hover:bg-primary/90">
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit application
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
