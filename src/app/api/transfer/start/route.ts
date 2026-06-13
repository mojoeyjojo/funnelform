import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mintTransferToken } from "@/lib/transferToken";

export const runtime = "nodejs";

// POST /api/transfer/start — mint a quiz-transfer token for the CURRENT guest.
//
// Called by the client right before an auth flow that may land on a different
// user (sign-in to an existing account, or a Google round-trip). Only an
// anonymous session can start a transfer: permanent users have nothing to
// transfer out of, and minting for them would be meaningless.
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous !== true) {
    return NextResponse.json({ error: "No guest session" }, { status: 401 });
  }
  return NextResponse.json({ token: mintTransferToken(user.id) });
}
