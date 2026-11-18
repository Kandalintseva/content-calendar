alter type public.notification_kind add value if not exists 'quarter_before';
alter table public.notification_settings add column if not exists reminder_quarter_enabled boolean not null default true;
grant update (reminder_hour_enabled, reminder_quarter_enabled, daily_digest_enabled, overdue_enabled) on public.notification_settings to authenticated;
