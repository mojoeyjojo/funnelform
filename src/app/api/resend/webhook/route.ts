import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { mapDomainStatus } from "@/lib/email-domains";
import { verifyResendWebhook, type ResendWebhookEvent } from "@/lib/resend-webhook";

export const runtime = "nodejs";

// POST /api/resend/webhook: Resend pushes domain status changes here so we never
// have to poll Resend from the client. On a domain event we mirror the status +
// per-record DNS states onto the matching sending_domains row. The editor then
// just watches our own DB, which removes the per-client polling load on Resend.
export async function POST(request: Request) {
  const rawBody = await request.text();
  const valid = verifyResendWebhook(
    rawBody,
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    process.env.RESEND_WEBHOOK_SECRET,
  );
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  let event: ResendWebhookEvent;
  try {
    event = JSON.parse(rawBody) as ResendWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if ((event.type === "domain.updated" || event.type === "domain.created") && event.data?.id) {
    const admin = createSupabaseAdminClient();
    const update: Record<string, unknown> = {
      status: mapDomainStatus(event.data.status ?? "pending"),
      updated_at: new Date().toISOString(),
    };
    if (event.data.records) update.dns_records = event.data.records;
    const { error } = await admin
      .from("sending_domains")
      .update(update)
      .eq("resend_domain_id", event.data.id);
    if (error) {
      // 200 anyway: a retry won't fix a DB error, and the on-load reconciliation
      // is the backstop. Avoid Svix hammering us with retries.
      console.error("[resend/webhook] update failed:", error.message);
    }
  }

  return NextResponse.json({ received: true });
}
