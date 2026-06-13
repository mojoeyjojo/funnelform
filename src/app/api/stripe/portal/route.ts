import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { fetchPlanProfile } from "@/lib/plan";

export const runtime = "nodejs";

// POST /api/stripe/portal — form POST → Stripe Customer Portal (the entire
// billing UI: payment method, invoices, plan switch, cancel). We build none of
// that ourselves. Requires the portal configuration to be saved once in the
// Stripe dashboard.
export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) {
    return NextResponse.redirect(`${origin}/login?next=/dashboard`, 303);
  }

  const profile = await fetchPlanProfile(supabase, user.id);
  if (!profile?.stripe_customer_id) {
    // Nothing to manage yet — send them to the pricing page instead.
    return NextResponse.redirect(`${origin}/pricing`, 303);
  }

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${origin}/dashboard`,
    });
    return NextResponse.redirect(session.url, 303);
  } catch (err) {
    console.error("[stripe/portal] failed:", err instanceof Error ? err.message : err);
    return NextResponse.redirect(`${origin}/dashboard`, 303);
  }
}
