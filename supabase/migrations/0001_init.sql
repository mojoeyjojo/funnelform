-- =============================================================================
-- Funnelform — initial schema (build spec §3). Full data model + RLS.
--
-- Phase 1 only WRITES to builder_events (the instrumentation), via the anon
-- role under a tightly-scoped RLS policy (owner_id IS NULL only). The other
-- tables are created now so the data model is the source of truth from the
-- start; auth + the quizzes/leads/quiz_events flows arrive in Phase 2. RLS is
-- enabled on every table per §8.
--
-- Phase 1 concession (documented): builder_events.owner_id is NULLABLE because
-- there is no auth yet — events are keyed by an anonymous session_id in
-- metadata. quizzes.owner_id stays NOT NULL per the spec's hard rule (no
-- nullable-owner quizzes); Phase 1 simply does not write quizzes rows.
-- =============================================================================

create extension if not exists pgcrypto;

-- profiles (extends auth.users) --------------------------------------------------
create table if not exists profiles (
  id                uuid primary key default gen_random_uuid(),
  email             text,
  full_name         text,
  business_name     text,
  plan              text default 'trial',          -- trial | free | pro | growth
  trial_started_at  timestamptz default now(),
  trial_ends_at     timestamptz,
  stripe_customer_id text,
  locale            text default 'en',             -- en | es | pt
  signup_source     text,                          -- free_tool | comparison | niche_page | founder | direct | other
  founder_assisted  boolean default false,
  created_at        timestamptz default now(),
  updated_at        timestamptz
);

-- quizzes -----------------------------------------------------------------------
create table if not exists quizzes (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references profiles(id) on delete cascade,
  slug             text unique,
  status           text default 'draft',           -- draft | published
  title            text,
  source_url       text,
  business_context text,
  config           jsonb,                           -- quiz_config (§3a), versioned
  branding_enabled boolean default true,
  lead_capture     jsonb,
  delivery         jsonb,
  published_at     timestamptz,
  created_at       timestamptz default now(),
  updated_at       timestamptz
);
create index if not exists quizzes_owner_id_idx on quizzes (owner_id);

-- leads -------------------------------------------------------------------------
create table if not exists leads (
  id         uuid primary key default gen_random_uuid(),
  quiz_id    uuid references quizzes(id) on delete cascade,
  owner_id   uuid references profiles(id) on delete cascade,  -- denormalized for RLS
  email      text,
  phone      text,
  answers    jsonb,
  outcome_id text,
  created_at timestamptz default now()
);
create index if not exists leads_owner_id_idx on leads (owner_id);

-- quiz_events (visitor journey) -------------------------------------------------
create table if not exists quiz_events (
  id          uuid primary key default gen_random_uuid(),
  quiz_id     uuid references quizzes(id) on delete cascade,
  event_type  text,                                -- view | start | question_answered | completed | lead_captured
  question_id text,
  session_id  text,
  created_at  timestamptz default now()
);
create index if not exists quiz_events_quiz_id_idx on quiz_events (quiz_id);

-- builder_events (owner journey — Claim 1 & 2 instrument) -----------------------
create table if not exists builder_events (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid references profiles(id) on delete cascade,  -- NULLABLE in Phase 1 (no auth yet)
  quiz_id    uuid references quizzes(id) on delete set null,  -- nullable until a quiz row exists
  event_type text not null,
  metadata   jsonb default '{}'::jsonb,            -- counts, field ids, ratings, session_id
  created_at timestamptz default now()
);
create index if not exists builder_events_session_idx
  on builder_events ((metadata->>'session_id'));
create index if not exists builder_events_type_idx on builder_events (event_type);

-- integrations ------------------------------------------------------------------
create table if not exists integrations (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid references profiles(id) on delete cascade,
  provider     text,                               -- kit | activecampaign | mailchimp | kajabi | hubspot
  access_token text,                               -- encrypted at rest (Phase 3)
  config       jsonb,
  created_at   timestamptz default now(),
  updated_at   timestamptz
);

-- =============================================================================
-- Row Level Security (§8). Enabled everywhere. Owner-scoped policies for the
-- authed tables (Phase 2), plus one tightly-scoped anon policy on builder_events
-- so Phase 1 can record instrumentation with no auth (see below).
-- =============================================================================
alter table profiles       enable row level security;
alter table quizzes        enable row level security;
alter table leads          enable row level security;
alter table quiz_events    enable row level security;
alter table builder_events enable row level security;
alter table integrations   enable row level security;

-- profiles: a user can see/manage only their own row.
drop policy if exists profiles_self on profiles;
create policy profiles_self on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- quizzes: owner-only.
drop policy if exists quizzes_owner on quizzes;
create policy quizzes_owner on quizzes
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- leads: owner-only (denormalized owner_id).
drop policy if exists leads_owner on leads;
create policy leads_owner on leads
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- quiz_events: readable by the quiz owner (writes happen via service role at
-- the public player in Phase 2).
drop policy if exists quiz_events_owner_read on quiz_events;
create policy quiz_events_owner_read on quiz_events
  for select using (
    exists (select 1 from quizzes q where q.id = quiz_id and q.owner_id = auth.uid())
  );

-- builder_events: owner-only once auth exists.
drop policy if exists builder_events_owner on builder_events;
create policy builder_events_owner on builder_events
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Phase 1 (no auth): allow the anon role to write/read ONLY owner-less events
-- (owner_id IS NULL), keyed by metadata.session_id. Scoped so anon can never
-- touch an owned row. Remove this policy when Phase 2 auth + server-role writes
-- land.
drop policy if exists builder_events_anon_phase1 on builder_events;
create policy builder_events_anon_phase1 on builder_events
  for all to anon
  using (owner_id is null)
  with check (owner_id is null);

-- integrations: owner-only.
drop policy if exists integrations_owner on integrations;
create policy integrations_owner on integrations
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
