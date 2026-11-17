-- Run this once in Supabase SQL Editor after replacing the two placeholders.
-- The schedule is UTC. Every 5 minutes gives an accurate one-hour reminder.
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'content_calendar_project_url');
select vault.create_secret('PASTE_A_LONG_RANDOM_CRON_SECRET', 'content_calendar_cron_secret');

select cron.schedule(
  'content-calendar-notifications',
  '*/5 * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'content_calendar_project_url') || '/functions/v1/notifications-dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'content_calendar_cron_secret')
      ),
      body := jsonb_build_object('source', 'supabase-cron'),
      timeout_milliseconds := 10000
    );
  $$
);

select cron.schedule(
  'content-calendar-cron-history-cleanup',
  '15 1 * * 0',
  $$ delete from cron.job_run_details where end_time < now() - interval '14 days' $$
);
