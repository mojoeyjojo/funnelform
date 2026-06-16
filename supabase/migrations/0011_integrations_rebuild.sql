-- A legacy `integrations` table (access_token/config, no status) pre-existed, so
-- the create-if-not-exists in 0010 silently no-op'd and the real columns were
-- never added. The table was empty and unreferenced; drop and recreate with the
-- correct schema (encrypted_credentials + status + last_error + the unique
-- owner+provider constraint the upsert relies on).
drop table if exists public.integrations cascade;

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('kit', 'mailchimp')),
  encrypted_credentials text not null,
  config jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'needs_reconnect')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, provider)
);

alter table public.integrations enable row level security;

create policy "own integrations select" on public.integrations
  for select using (owner_id = auth.uid());
create policy "own integrations insert" on public.integrations
  for insert with check (owner_id = auth.uid());
create policy "own integrations update" on public.integrations
  for update using (owner_id = auth.uid());
create policy "own integrations delete" on public.integrations
  for delete using (owner_id = auth.uid());
