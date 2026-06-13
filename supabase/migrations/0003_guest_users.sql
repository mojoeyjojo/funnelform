-- =============================================================================
-- Guest (anonymous) users — Jotform-style guest sessions.
--
-- Anonymous sign-ins give visitors a real authenticated session, so the
-- existing owner-scoped RLS (auth.uid() = owner_id) already isolates their
-- quizzes. The ONE capability guests must never have is publishing: a live
-- /q/<slug> page collects leads, and lead capture stays behind a real account.
--
-- The app blocks guest publishing in the publish route, but RLS is the actual
-- boundary: without these policies a guest could set status='published' by
-- talking to PostgREST directly with the publishable key. RESTRICTIVE policies
-- AND with the permissive owner policy, per the Supabase anonymous-users guide.
-- =============================================================================

drop policy if exists quizzes_guest_no_publish_insert on quizzes;
create policy quizzes_guest_no_publish_insert on quizzes
  as restrictive for insert to authenticated
  with check (
    (select coalesce((auth.jwt()->>'is_anonymous')::boolean, false)) is false
    or status is distinct from 'published'
  );

drop policy if exists quizzes_guest_no_publish_update on quizzes;
create policy quizzes_guest_no_publish_update on quizzes
  as restrictive for update to authenticated
  with check (
    (select coalesce((auth.jwt()->>'is_anonymous')::boolean, false)) is false
    or status is distinct from 'published'
  );
