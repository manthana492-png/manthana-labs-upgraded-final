// Centralised audit-log writer.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export interface AuditEntry {
  userId: string | null;
  actorEmail?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function writeAudit(admin: SupabaseClient, entry: AuditEntry) {
  try {
    await admin.from("audit_log").insert({
      user_id: entry.userId,
      actor_email: entry.actorEmail ?? null,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      metadata: entry.metadata ?? null,
      ip_address: entry.ipAddress ?? null,
      user_agent: entry.userAgent ?? null,
    });
  } catch (err) {
    console.error("audit-log insert failed", err);
  }
}
