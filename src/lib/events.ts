import { getSupabaseClient } from "./supabase/server";
import type { BuilderEventType } from "./types";

// builder_events writer/reader (build spec §3, §9). This is the Phase 1
// instrumentation that lets us read Claim 1 (is the AI good?) separately from
// publish rate. Phase 1 has no auth, so events are keyed by an anonymous
// `session_id` carried in metadata and owner_id is left null (the scoped anon
// RLS policy permits exactly these owner-less rows).

type RecordArgs = {
  sessionId: string;
  eventType: BuilderEventType;
  metadata?: Record<string, unknown>;
};

/** Insert one builder_event. Never throws — instrumentation must not break the
 *  user flow; if Supabase isn't configured we just no-op (and warn once). */
export async function recordBuilderEvent({
  sessionId,
  eventType,
  metadata = {},
}: RecordArgs): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.warn(
      `[builder_events] Supabase not configured — skipped "${eventType}"`,
    );
    return false;
  }
  const { error } = await supabase.from("builder_events").insert({
    owner_id: null, // no auth in Phase 1; backfilled when auth lands (Phase 2)
    quiz_id: null,
    event_type: eventType,
    metadata: { ...metadata, session_id: sessionId },
  });
  if (error) {
    console.error(`[builder_events] insert failed for "${eventType}":`, error.message);
    return false;
  }
  return true;
}

export type BuilderEventRow = {
  id: string;
  event_type: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

/** Read back the builder_events for one session (powers the "Events recorded"
 *  panel so the Phase 1 gate is directly demonstrable). */
export async function listBuilderEvents(
  sessionId: string,
): Promise<BuilderEventRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("builder_events")
    .select("id, event_type, metadata, created_at")
    .eq("metadata->>session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[builder_events] read failed:", error.message);
    return [];
  }
  return (data ?? []) as BuilderEventRow[];
}
