import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { effectivePlan, fetchPlanProfile, hasProFeatures } from "@/lib/plan";
import { createResendDomain, mapDomainStatus } from "@/lib/email-domains";

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
    const domain = await createResendDomain(parsed.data.domain);
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
    console.error("[sending-domain] resend create failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not register the domain. Please try again shortly." }, { status: 502 });
  }
}

// DELETE /api/sending-domain: disconnect the custom domain (RLS scopes to owner).
export async function DELETE() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { error } = await supabase.from("sending_domains").delete().eq("owner_id", user.id);
  if (error) return NextResponse.json({ error: "Could not remove the domain." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
