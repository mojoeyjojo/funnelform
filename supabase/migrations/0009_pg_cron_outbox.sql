-- Per-minute outbox sweeper. pg_cron triggers an HTTP POST (via pg_net) to the
-- deploy's cron endpoint, which retries due delivery jobs. Free on all Supabase
-- plans, so the sweeper does not depend on Vercel cron cadence.
--
-- PREREQUISITE (run once in the SQL editor, NOT committed, because it carries the
-- secret): store the base URL and the CRON_SECRET in Vault:
--   select vault.create_secret('https://treeflow.tech', 'app_base_url');
--   select vault.create_secret('<CRON_SECRET value>', 'cron_secret');
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'deliver-outbox',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/cron/deliver-outbox',
    headers := jsonb_build_object(
      'authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    )
  );
  $$
);
