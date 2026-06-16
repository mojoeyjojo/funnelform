-- Transactional outbox for lead delivery. Every channel (follow-up email,
-- owner notification, webhook, and later ESP pushes) becomes a job row so each
-- gets retries and observability. The lead row itself is written separately and
-- is authoritative; this table only governs delivery.
create table if not exists public.delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('follow_up_email', 'owner_notify', 'webhook', 'esp_push')),
  target text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'done', 'failed', 'dead')),
  attempts int not null default 0,
  max_attempts int not null default 6,
  send_after timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists delivery_jobs_due_idx
  on public.delivery_jobs (status, send_after)
  where status in ('pending', 'failed');

-- Service-role only: the outbox is written and processed exclusively by the
-- admin client. No user-facing policies; RLS on with no policy denies all
-- access to anon/authenticated roles.
alter table public.delivery_jobs enable row level security;
