import { NextResponse } from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/lib/supabase/server";
import { getAdapter } from "@/lib/integrations";
import { decryptSecret } from "@/lib/integrations/crypto";
import type { EspProvider } from "@/lib/types";

export const runtime = "nodejs";

// GET /api/integrations/[id]: re-list this connection's target lists/forms.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // RLS scopes this select to the owner; confirms the row is theirs.
  const owned = await supabase
    .from("integrations")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!owned.data)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Decrypt with the admin client server-side only.
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("integrations")
    .select("provider, encrypted_credentials")
    .eq("id", id)
    .single();

  if (!data)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const adapter = getAdapter(data.provider as EspProvider);
  const targets = await adapter
    .listTargets({ apiKey: decryptSecret(data.encrypted_credentials as string) })
    .catch(() => []);
  return NextResponse.json({ targets });
}

// DELETE /api/integrations/[id]: disconnect. RLS scopes to the owner.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { error } = await supabase
    .from("integrations")
    .delete()
    .eq("id", id);
  if (error)
    return NextResponse.json(
      { error: "Could not disconnect" },
      { status: 500 },
    );
  return NextResponse.json({ ok: true });
}
