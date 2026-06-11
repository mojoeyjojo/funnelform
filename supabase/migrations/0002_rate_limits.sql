-- =============================================================================
-- Rate limiting for the public AI endpoints (cost/abuse protection, spec §8).
--
-- Generic fixed-window counter keyed by an opaque string. Keys are namespaced
-- by the caller, e.g. 'gen:ip:<sha256>' (anonymous, hashed IP; raw IPs are
-- never stored) and 'gen:user:<uuid>' (authed). Consumed atomically via
-- consume_rate_limit() in ONE round trip; the count resets when the window
-- has elapsed.
--
-- Access: service-role ONLY. RLS is enabled with no policies (deny anon/auth),
-- and EXECUTE on the function is revoked from public/anon/authenticated so it
-- cannot be called through the public RPC surface.
-- =============================================================================

create table if not exists rate_limits (
  key              text primary key,
  count            integer not null default 0,
  window_starts_at timestamptz not null default now()
);

alter table rate_limits enable row level security;
-- no policies: anon/authenticated can do nothing; service_role bypasses RLS.

create or replace function consume_rate_limit(
  p_key            text,
  p_window_seconds integer,
  p_max            integer
)
returns table (allowed boolean, current_count integer)
language plpgsql
as $$
declare
  v_count  integer;
begin
  insert into rate_limits as rl (key, count, window_starts_at)
  values (p_key, 1, now())
  on conflict (key) do update
    set count = case
          when now() - rl.window_starts_at > make_interval(secs => p_window_seconds)
            then 1
          else rl.count + 1
        end,
        window_starts_at = case
          when now() - rl.window_starts_at > make_interval(secs => p_window_seconds)
            then now()
          else rl.window_starts_at
        end
  returning rl.count into v_count;

  return query select v_count <= p_max, v_count;
end;
$$;

-- Lock down the RPC surface: only the service role may execute.
revoke execute on function consume_rate_limit(text, integer, integer) from public;
revoke execute on function consume_rate_limit(text, integer, integer) from anon;
revoke execute on function consume_rate_limit(text, integer, integer) from authenticated;
