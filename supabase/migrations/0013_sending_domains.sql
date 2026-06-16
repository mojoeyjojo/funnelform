-- Account-level custom sending domain for follow-up emails (Pro feature).
-- resend_domain_id ties to the Resend Domains API; status mirrors Resend's.
create table if not exists public.sending_domains (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  domain text not null,
  from_local text not null default 'hello',
  resend_domain_id text not null,
  status text not null default 'pending' check (status in ('pending', 'verified', 'failed')),
  dns_records jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id)
);

alter table public.sending_domains enable row level security;

create policy "own sending_domain select" on public.sending_domains
  for select using (owner_id = auth.uid());
create policy "own sending_domain insert" on public.sending_domains
  for insert with check (owner_id = auth.uid());
create policy "own sending_domain update" on public.sending_domains
  for update using (owner_id = auth.uid());
create policy "own sending_domain delete" on public.sending_domains
  for delete using (owner_id = auth.uid());
