create table public.telegram_inbox_drafts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  body text,
  scheduled_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.telegram_inbox_drafts enable row level security;
-- This table is used only by the Telegram webhook with the service role.
