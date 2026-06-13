import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Generator from "@/components/Generator";

export const runtime = "nodejs";

// In-workspace builder. Same generator stepper as the public landing page, but
// gated behind a session and rendered in `inApp` mode (no marketing hero, a
// "← Workspace" return link). Guests with no session stay on `/`; signed-in
// owners and anonymous workspace sessions both land here from "+ New quiz".
export default async function NewQuizPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/new");
  return <Generator inApp />;
}
