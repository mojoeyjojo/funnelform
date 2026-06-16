-- Widen the integrations.provider check to include the Phase 3 providers.
alter table public.integrations drop constraint if exists integrations_provider_check;
alter table public.integrations add constraint integrations_provider_check
  check (provider in ('kit', 'mailchimp', 'mailerlite', 'brevo'));
