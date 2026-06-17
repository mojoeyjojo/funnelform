import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { verifyResendDomain, getResendDomain, mapDomainStatus } from "@/lib/email-domains";

export const runtime = "nodejs";

// Resolve the owner + their domain row, or an early NextResponse to return.
async function resolveDomainRow() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous)
    return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const { data: row } = await supabase
    .from("sending_domains")
    .select("resend_domain_id")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!row) return { error: NextResponse.json({ error: "No domain to verify." }, { status: 404 }) };
  return { supabase, userId: user.id, resendId: row.resend_domain_id as string };
}

// Read Resend's current view of the domain, mirror status + per-record DNS
// statuses onto the row, and return them. Shared by POST and GET.
async function syncFromResend(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  resendId: string,
) {
  const d = await getResendDomain(resendId);
  const status = mapDomainStatus(d.status);
  await supabase
    .from("sending_domains")
    .update({ status, dns_records: d.records, updated_at: new Date().toISOString() })
    .eq("owner_id", userId);
  return NextResponse.json({ status, dnsRecords: d.records });
}

// POST /api/sending-domain/verify: TRIGGER a fresh DNS check, then sync.
//
// Order matters: Resend's POST /domains/{id}/verify RESETS the domain to
// "pending" while it re-runs DNS checks asynchronously. Reading right after a
// verify therefore catches that transient "pending" and would clobber an
// already-verified row. So read the current status FIRST and only trigger a
// re-verify when it isn't verified yet. The client triggers this ONCE, then
// polls GET (which never re-triggers) so we don't keep resetting the timer.
export async function POST() {
  const r = await resolveDomainRow();
  if (r.error) return r.error;
  try {
    const current = await getResendDomain(r.resendId);
    if (current.status !== "verified") {
      await verifyResendDomain(r.resendId);
    }
    return await syncFromResend(r.supabase, r.userId, r.resendId);
  } catch (err) {
    console.error("[sending-domain/verify] POST failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not verify yet. Check your DNS records and try again." }, { status: 502 });
  }
}

// GET /api/sending-domain/verify: READ-ONLY status check (no re-trigger). Used
// by the client poller and the on-load self-heal of a stale "pending" row.
export async function GET() {
  const r = await resolveDomainRow();
  if (r.error) return r.error;
  try {
    return await syncFromResend(r.supabase, r.userId, r.resendId);
  } catch (err) {
    console.error("[sending-domain/verify] GET failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not check status right now." }, { status: 502 });
  }
}
