create extension if not exists pgcrypto;

create type public.post_status as enum ('planned', 'published');
create type public.notification_kind as enum ('hour_before', 'daily_digest', 'overdue', 'test');
create type public.notification_delivery_status as enum ('sending', 'sent', 'failed');

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  content text not null default '',
  scheduled_at timestamptz not null,
  status public.post_status not null default 'planned',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint published_time_matches_status check (
    (status = 'published' and published_at is not null) or status = 'planned'
  )
);

create index posts_user_schedule_idx on public.posts (user_id, scheduled_at);
create index posts_pending_idx on public.posts (scheduled_at) where status = 'planned';

create table public.notification_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  telegram_chat_id text,
  telegram_username text,
  telegram_connected boolean not null default false,
  reminder_hour_enabled boolean not null default true,
  daily_digest_enabled boolean not null default true,
  overdue_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint telegram_connection_complete check (
    (telegram_connected = false) or (telegram_chat_id is not null)
  )
);

create table public.telegram_link_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index telegram_link_user_idx on public.telegram_link_tokens (user_id, created_at desc);

create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  kind public.notification_kind not null,
  dedupe_key text not null unique,
  status public.notification_delivery_status not null default 'sending',
  telegram_message_id bigint,
  attempt_count integer not null default 1 check (attempt_count between 1 and 3),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notification_log_user_idx on public.notification_log (user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger posts_set_updated_at before update on public.posts
for each row execute function public.set_updated_at();
create trigger settings_set_updated_at before update on public.notification_settings
for each row execute function public.set_updated_at();
create trigger notification_log_set_updated_at before update on public.notification_log
for each row execute function public.set_updated_at();

create or replace function public.create_default_notification_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notification_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger auth_user_create_settings
after insert on auth.users
for each row execute function public.create_default_notification_settings();

-- Atomically consumes a one-time Telegram link. Callable only with the server key.
create or replace function public.claim_telegram_link(
  link_hash text,
  chat_id text,
  chat_username text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_user_id uuid;
begin
  update public.telegram_link_tokens
  set used_at = now()
  where token_hash = link_hash
    and used_at is null
    and expires_at > now()
  returning user_id into claimed_user_id;

  if claimed_user_id is null then return null; end if;

  insert into public.notification_settings (
    user_id, telegram_chat_id, telegram_username, telegram_connected
  ) values (
    claimed_user_id, chat_id, nullif(chat_username, ''), true
  )
  on conflict (user_id) do update set
    telegram_chat_id = excluded.telegram_chat_id,
    telegram_username = excluded.telegram_username,
    telegram_connected = true,
    updated_at = now();

  return claimed_user_id;
end;
$$;

-- A lock/claim prevents Supabase Cron and the GitHub fallback from double-sending.
create or replace function public.claim_notification(
  claim_user_id uuid,
  claim_post_id uuid,
  claim_kind public.notification_kind,
  claim_dedupe_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.notification_log;
  claimed_id uuid;
begin
  select * into existing from public.notification_log
  where dedupe_key = claim_dedupe_key for update;

  if found then
    if existing.status = 'sent' or existing.attempt_count >= 3 then return null; end if;
    if existing.status = 'sending' and existing.updated_at > now() - interval '10 minutes' then return null; end if;
    update public.notification_log set
      status = 'sending', attempt_count = attempt_count + 1, error_message = null
    where id = existing.id returning id into claimed_id;
    return claimed_id;
  end if;

  insert into public.notification_log (user_id, post_id, kind, dedupe_key)
  values (claim_user_id, claim_post_id, claim_kind, claim_dedupe_key)
  returning id into claimed_id;
  return claimed_id;
exception when unique_violation then
  return null;
end;
$$;

revoke all on function public.claim_telegram_link(text, text, text) from public, anon, authenticated;
revoke all on function public.claim_notification(uuid, uuid, public.notification_kind, text) from public, anon, authenticated;
grant execute on function public.claim_telegram_link(text, text, text) to service_role;
grant execute on function public.claim_notification(uuid, uuid, public.notification_kind, text) to service_role;

alter table public.posts enable row level security;
alter table public.notification_settings enable row level security;
alter table public.telegram_link_tokens enable row level security;
alter table public.notification_log enable row level security;

create policy "Users read own posts" on public.posts for select using (auth.uid() = user_id);
create policy "Users create own posts" on public.posts for insert with check (auth.uid() = user_id);
create policy "Users update own posts" on public.posts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete own posts" on public.posts for delete using (auth.uid() = user_id);

create policy "Users read own notification settings" on public.notification_settings for select using (auth.uid() = user_id);
create policy "Users create own notification settings" on public.notification_settings for insert with check (auth.uid() = user_id);
create policy "Users update safe notification settings" on public.notification_settings for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Token and delivery tables contain server-only data; RLS intentionally has no client policies.

-- Ensure settings exist for users created before this migration.
insert into public.notification_settings (user_id)
select id from auth.users on conflict (user_id) do nothing;
