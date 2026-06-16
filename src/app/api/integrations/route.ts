import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdapter } from "@/lib/integrations";
import { encryptSecret } from "@/lib/integrations/crypto";

export const runtime = "nodejs";

// GET /api/integrations: the signed-in owner's connections (no secrets).
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { data } = await supabase
    .from("integrations")
    .select("id, provider, status")
    .eq("owner_id", user.id);
  return NextResponse.json({ integrations: data ?? [] });
}

const ConnectSchema = z.object({
  provider: z.enum(["kit", "mailchimp"]),
  apiKey: z.string().min(8).max(500),
});

// POST /api/integrations: validate a pasted API key, store it encrypted, and
// return the connection id + the owner's target lists/forms to choose from.
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = ConnectSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid request" }, { status: 422 });

  const adapter = getAdapter(parsed.data.provider);
  const valid = await adapter.validateCredentials({ apiKey: parsed.data.apiKey });
  if (!valid.ok)
    return NextResponse.json(
      { error: valid.error ?? "Could not connect" },
      { status: 422 },
    );

  const { data, error } = await supabase
    .from("integrations")
    .upsert(
      {
        owner_id: user.id,
        provider: parsed.data.provider,
        encrypted_credentials: encryptSecret(parsed.data.apiKey),
        status: "active",
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id,provider" },
    )
    .select("id, provider, status")
    .single();

  if (error)
    return NextResponse.json(
      { error: "Could not save connection" },
      { status: 500 },
    );

  const targets = await adapter
    .listTargets({ apiKey: parsed.data.apiKey })
    .catch(() => []);
  return NextResponse.json({ integration: data, targets });
}
