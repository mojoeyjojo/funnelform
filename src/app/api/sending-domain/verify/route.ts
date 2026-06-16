import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { verifyResendDomain, getResendDomain } from "@/lib/email-domains";

export const runtime = "nodejs";

// POST /api/sending-domain/verify: ask Resend to re-check DNS, then mirror the
// resulting status onto the owner's sending_domains row.
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { data: row } = await supabase
    .from("sending_domains")
    .select("resend_domain_id")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "No domain to verify." }, { status: 404 });
  try {
    await verifyResendDomain(row.resend_domain_id as string);
    const d = await getResendDomain(row.resend_domain_id as string);
    const status = d.status === "verified" ? "verified" : "pending";
    await supabase
      .from("sending_domains")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("owner_id", user.id);
    return NextResponse.json({ status });
  } catch (err) {
    console.error("[sending-domain/verify] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not verify yet. Check your DNS records and try again." }, { status: 502 });
  }
}
