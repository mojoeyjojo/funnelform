-- Account-level ESP/CRM connections. One row per (owner, provider). The API key
-- is stored encrypted (AES-256-GCM, app-side) in encrypted_credentials; it is
-- never returned to the client. Decryption happens server-side only.
create table if not exists public.integrations (
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

-- Owner-scoped RLS so a signed-in user can manage their own connections. The
-- encrypted blob is opaque without INTEGRATIONS_ENC_KEY (server-only), and the
-- API routes never select it into a client response.
alter table public.integrations enable row level security;

create policy "own integrations select" on public.integrations
  for select using (owner_id = auth.uid());
create policy "own integrations insert" on public.integrations
  for insert with check (owner_id = auth.uid());
create policy "own integrations update" on public.integrations
  for update using (owner_id = auth.uid());
create policy "own integrations delete" on public.integrations
  for delete using (owner_id = auth.uid());
