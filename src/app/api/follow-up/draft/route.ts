import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { draftFollowUpEmail } from "@/lib/anthropic";

export const runtime = "nodejs";

const DraftSchema = z.object({
  quizTitle: z.string().max(200),
  outcomeName: z.string().max(200),
  outcomeDescription: z.string().max(2000),
  ownerName: z.string().max(200),
});

// POST /api/follow-up/draft: authenticated, non-guest owners only. Drafts
// per-outcome follow-up copy.
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const parsed = DraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 422 });
  }
  try {
    const draft = await draftFollowUpEmail(parsed.data);
    return NextResponse.json(draft);
  } catch (err) {
    console.error("[follow-up/draft] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not draft" }, { status: 500 });
  }
}
