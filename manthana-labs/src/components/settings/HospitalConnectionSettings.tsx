import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useDicomEntitlement } from "@/lib/useDicomEntitlement";
import {
  listHospitalConnections,
  saveHospitalConnection,
  deleteHospitalConnection,
  verifyHospitalConnection,
  inboundStowUrl,
  type HospitalConnection,
} from "@/lib/dicom/api";
import { Hospital, Lock, Plus, Trash2, Copy, Check, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { DICOM_FEATURES_ENABLED } from "@/lib/featureFlags";

export function HospitalConnectionSettings() {
  if (!DICOM_FEATURES_ENABLED) return null;
  const ent = useDicomEntitlement();
  const [conns, setConns] = useState<HospitalConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Partial<HospitalConnection> | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const refresh = async () => {
    if (!ent.allowed) return;
    setLoading(true);
    try {
      setConns(await listHospitalConnections());
    } catch {
      /* no-op */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ent.allowed) void refresh();
  }, [ent.allowed]);

  if (ent.loading) return null;

  if (!ent.allowed) {
    return (
      <section className="surface-clinical p-6 mt-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-tier-nvidia/5 pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
            <Lock className="h-3.5 w-3.5" /> Locked
          </div>
          <h2 className="font-display text-xl tracking-tight mt-2 flex items-center gap-2">
            <Hospital className="h-5 w-5 text-primary" />
            Hospital connection (PACS / RIS)
          </h2>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
            {ent.reason} Connect your PACS once and reports flow back as DICOM SR
            + encapsulated PDF + FHIR DiagnosticReport — no manual export.
          </p>
        </div>
      </section>
    );
  }

  const save = async () => {
    if (!editing?.name) {
      toast.error("Name is required");
      return;
    }
    try {
      await saveHospitalConnection(editing as HospitalConnection & { name: string });
      toast.success("Connection saved");
      setEditing(null);
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const test = async (id: string) => {
    try {
      const r = await verifyHospitalConnection(id);
      if (r.ok) toast.success("Connection verified");
      else toast.error(r.message ?? "Verification failed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verify failed");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this hospital connection?")) return;
    try {
      await deleteHospitalConnection(id);
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <section className="surface-clinical p-6 mt-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl tracking-tight flex items-center gap-2">
            <Hospital className="h-5 w-5 text-primary" />
            Hospital connection (PACS / RIS)
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure DICOMweb STOW-RS + FHIR endpoints. Studies auto-route in,
            reports auto-route out.
          </p>
        </div>
        {!editing && (
          <Button size="sm" onClick={() => setEditing({ name: "", enabled: true })}>
            <Plus className="h-4 w-4 mr-1.5" /> Add
          </Button>
        )}
      </div>

      {loading && (
        <div className="text-sm text-muted-foreground mt-4 flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      )}

      {!loading && conns.length === 0 && !editing && (
        <p className="text-sm text-muted-foreground mt-4">
          No hospital connections yet.
        </p>
      )}

      <ul className="mt-4 space-y-3">
        {conns.map((c) => (
          <li key={c.id} className="rounded-xl border border-border bg-background/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">{c.name}</span>
                  {c.verified_at && (
                    <Badge className="bg-tier-nvidia-soft text-tier-nvidia-foreground border-tier-nvidia-border">
                      <ShieldCheck className="h-3 w-3 mr-1" /> Verified
                    </Badge>
                  )}
                  {!c.enabled && <Badge variant="outline">Disabled</Badge>}
                </div>
                <div className="text-xs text-muted-foreground mt-1 break-all">
                  STOW: {c.pacs_stow_url ?? "—"}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 break-all">
                  FHIR: {c.ris_fhir_base_url ?? "—"}
                </div>
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-muted/40 px-2 py-1.5">
                  <code className="text-[0.7rem] font-mono break-all flex-1">
                    {inboundStowUrl(c.inbound_token)}
                  </code>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => {
                      void navigator.clipboard.writeText(inboundStowUrl(c.inbound_token));
                      setCopiedId(c.id);
                      setTimeout(() => setCopiedId(null), 1500);
                    }}
                  >
                    {copiedId === c.id ? (
                      <Check className="h-3.5 w-3.5 text-tier-nvidia-foreground" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
                <p className="text-[0.7rem] text-muted-foreground mt-1">
                  Paste this URL into your PACS auto-routing rule. Studies forwarded
                  here appear in your worklist within seconds.
                </p>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <Button size="sm" variant="outline" onClick={() => test(c.id)}>
                  Test
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(c)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-warning-critical-foreground"
                  onClick={() => remove(c.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {editing && (
        <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Name">
              <Input
                value={editing.name ?? ""}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="Apollo Bangalore PACS"
              />
            </Field>
            <Field label="AE title (optional)">
              <Input
                value={editing.ae_title ?? ""}
                onChange={(e) => setEditing({ ...editing, ae_title: e.target.value })}
                placeholder="MANTHANA_AI"
              />
            </Field>
            <Field label="PACS STOW-RS URL">
              <Input
                value={editing.pacs_stow_url ?? ""}
                onChange={(e) => setEditing({ ...editing, pacs_stow_url: e.target.value })}
                placeholder="https://pacs.hospital.org/dicom-web/studies"
              />
            </Field>
            <Field label="PACS QIDO-RS URL (optional)">
              <Input
                value={editing.pacs_qido_url ?? ""}
                onChange={(e) => setEditing({ ...editing, pacs_qido_url: e.target.value })}
                placeholder="https://pacs.hospital.org/dicom-web"
              />
            </Field>
            <Field label="PACS auth header (optional)">
              <Input
                type="password"
                value={editing.pacs_auth_header ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, pacs_auth_header: e.target.value })
                }
                placeholder="Bearer …"
              />
            </Field>
            <Field label="RIS FHIR base URL">
              <Input
                value={editing.ris_fhir_base_url ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, ris_fhir_base_url: e.target.value })
                }
                placeholder="https://ris.hospital.org/fhir"
              />
            </Field>
            <Field label="RIS auth header (optional)">
              <Input
                type="password"
                value={editing.ris_auth_header ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, ris_auth_header: e.target.value })
                }
                placeholder="Bearer …"
              />
            </Field>
            <Field label="Open-in-PACS URL template (optional)">
              <Input
                value={editing.pacs_open_url_template ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, pacs_open_url_template: e.target.value })
                }
                placeholder="https://pacs.hospital.org/viewer?study={studyInstanceUID}"
              />
            </Field>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} className="bg-primary hover:bg-primary/90">
              Save connection
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
