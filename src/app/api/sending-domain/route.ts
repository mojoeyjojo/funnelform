import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { effectivePlan, fetchPlanProfile, hasProFeatures } from "@/lib/plan";
import { ensureResendDomain, deleteResendDomain, mapDomainStatus } from "@/lib/email-domains";

export const runtime = "nodejs";

// GET /api/sending-domain: the owner's custom sending domain (or null).
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { data } = await supabase
    .from("sending_domains")
    .select("id, domain, from_local, status, dns_records")
    .eq("owner_id", user.id)
    .maybeSingle();
  return NextResponse.json({ sendingDomain: data ?? null });
}

const AddSchema = z.object({
  domain: z.string().min(3).max(253).regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i),
});

// POST /api/sending-domain: register a custom sending domain (Pro only). Calls
// the Resend Domains API, stores the row + the DNS records the owner must add.
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const plan = effectivePlan(await fetchPlanProfile(supabase, user.id));
  if (!hasProFeatures(plan)) {
    await supabase.from("builder_events").insert({
      owner_id: user.id,
      event_type: "paywall_hit",
      metadata: { trigger: "custom_domain" },
    });
    return NextResponse.json(
      { error: "A custom sending domain is a Pro feature.", reason: "plan_required" },
      { status: 403 },
    );
  }

  const parsed = AddSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid domain." }, { status: 422 });

  try {
    // Idempotent: reuses the domain if Resend already has it (e.g. re-adding
    // the same domain, or a prior Remove that left it in Resend).
    const domain = await ensureResendDomain(parsed.data.domain);
    const status = mapDomainStatus(domain.status);
    const { data, error } = await supabase
      .from("sending_domains")
      .upsert(
        {
          owner_id: user.id,
          domain: parsed.data.domain,
          resend_domain_id: domain.id,
          status,
          dns_records: domain.records,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "owner_id" },
      )
      .select("id, domain, from_local, status, dns_records")
      .single();
    if (error) {
      console.error("[sending-domain] save failed:", error.message);
      return NextResponse.json({ error: "Could not save the domain." }, { status: 500 });
    }
    return NextResponse.json({ sendingDomain: data });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[sending-domain] resend create failed:", detail);
    // The domain-count cap is on our Resend account, not the customer's plan, so
    // don't leak Resend's wording; surface a support-style message instead.
    const capReached = /plan includes|upgrade to add more|domain limit|too many domains/i.test(detail);
    return capReached
      ? NextResponse.json(
          { error: "Custom sending domains are temporarily unavailable. Please contact support." },
          { status: 503 },
        )
      : NextResponse.json(
          { error: "Could not register the domain. Please try again shortly." },
          { status: 502 },
        );
  }
}

// DELETE /api/sending-domain: disconnect the custom domain. Removes it from
// Resend too (so it stops consuming an account domain slot), then drops the row.
export async function DELETE() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { data: row } = await supabase
    .from("sending_domains")
    .select("resend_domain_id")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (row?.resend_domain_id) {
    // Best-effort: if Resend deletion fails we still drop our row. The next add
    // recovers via ensureResendDomain rather than orphaning the slot forever.
    try {
      await deleteResendDomain(row.resend_domain_id as string);
    } catch (err) {
      console.error("[sending-domain] resend delete failed:", err instanceof Error ? err.message : err);
    }
  }
  const { error } = await supabase.from("sending_domains").delete().eq("owner_id", user.id);
  if (error) return NextResponse.json({ error: "Could not remove the domain." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
