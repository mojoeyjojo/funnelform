-- =============================================================================
-- Funnelform — monetization (build spec §5.8 + §5.9).
--
-- 1. quiz_events.outcome_id: which outcome a visitor landed on when they
--    completed the quiz. Sent by the player on the `completed` event so we
--    capture ALL finishers, not just the ones who became leads
--    (leads.outcome_id remains the lead-scoped view of the same fact).
-- 2. Indexes for the analytics + billing read paths.
-- 3. Aggregation RPCs for the owner analytics page. All are SECURITY INVOKER:
--    the existing quiz_events_owner_read / leads_owner RLS policies decide
--    what the caller may aggregate, so these add no new exposure.
-- =============================================================================

alter table quiz_events add column if not exists outcome_id text;

create index if not exists quiz_events_quiz_type_idx on quiz_events (quiz_id, event_type);
create index if not exists leads_owner_created_idx on leads (owner_id, created_at);
create index if not exists profiles_stripe_customer_idx on profiles (stripe_customer_id);

-- Event counts per type for one quiz (views, starts, completed, ...).
create or replace function quiz_event_counts(p_quiz_id uuid)
returns table (event_type text, count bigint)
language sql stable security invoker
as $$
  select event_type, count(*)::bigint
  from quiz_events
  where quiz_id = p_quiz_id
  group by event_type;
$$;

-- Per-question answer counts: the drop-off funnel.
create or replace function quiz_question_funnel(p_quiz_id uuid)
returns table (question_id text, count bigint)
language sql stable security invoker
as $$
  select question_id, count(*)::bigint
  from quiz_events
  where quiz_id = p_quiz_id
    and event_type = 'question_answered'
    and question_id is not null
  group by question_id;
$$;

-- Outcome distribution among completed visitors.
create or replace function quiz_outcome_distribution(p_quiz_id uuid)
returns table (outcome_id text, count bigint)
language sql stable security invoker
as $$
  select outcome_id, count(*)::bigint
  from quiz_events
  where quiz_id = p_quiz_id
    and event_type = 'completed'
    and outcome_id is not null
  group by outcome_id;
$$;
