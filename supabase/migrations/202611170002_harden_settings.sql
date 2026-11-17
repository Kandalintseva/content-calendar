-- Prevent browser clients from changing the Telegram identity columns directly.
revoke update on public.notification_settings from authenticated;
grant update (reminder_hour_enabled, daily_digest_enabled, overdue_enabled) on public.notification_settings to authenticated;
grant select on public.notification_settings to authenticated;
grant insert (user_id) on public.notification_settings to authenticated;
grant select, insert, update, delete on public.posts to authenticated;
