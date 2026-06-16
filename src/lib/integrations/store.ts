import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { EspProvider } from "@/lib/types";
import { decryptSecret } from "./crypto";
import { getAdapter } from "./index";
import type { EspContact } from "./types";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

// Load a connection (admin), decrypt its key, and push the contact to targetId.
// Throws on any failure so the outbox records a retry. On an auth failure the
// connection is flagged needs_reconnect.
export async function pushToIntegration(
  admin: AdminClient,
  ownerId: string,
  integrationId: string,
  targetId: string,
  contact: EspContact,
): Promise<void> {
  const { data, error } = await admin
    .from("integrations")
    .select("provider, encrypted_credentials, status, owner_id")
    .eq("id", integrationId)
    .maybeSingle();
  if (error) throw new Error(`integration lookup failed: ${error.message}`);
  if (!data) throw new Error("integration not found");
  if (data.owner_id !== ownerId) throw new Error("integration owner mismatch");
  const provider = data.provider as EspProvider;
  const apiKey = decryptSecret(data.encrypted_credentials as string);
  try {
    await getAdapter(provider).upsertSubscriber({ apiKey }, targetId, contact);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/\b(401|403)\b/.test(msg)) {
      await admin
        .from("integrations")
        .update({ status: "needs_reconnect", last_error: msg.slice(0, 500), updated_at: new Date().toISOString() })
        .eq("id", integrationId);
    }
    throw err;
  }
}
