import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// POST /api/quizzes/[id]/restore — bring a soft-deleted quiz back from the trash.
// It returns as a DRAFT (never silently re-published) so the owner re-publishes
// deliberately and the free plan's one-live-quiz gate is re-checked then. Posted
// as a form from the Recently deleted view; redirects back there. RLS scopes the
// update to the owner.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { origin } = new URL(request.url);
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login?next=/deleted", origin), { status: 303 });
  }

  await supabase
    .from("quizzes")
    .update({ deleted_at: null, status: "draft", updated_at: new Date().toISOString() })
    .eq("id", id)
    .not("deleted_at", "is", null);

  return NextResponse.redirect(new URL("/deleted", origin), { status: 303 });
}
