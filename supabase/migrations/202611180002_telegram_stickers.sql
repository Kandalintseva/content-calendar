create table public.telegram_stickers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_id text not null,
  emoji text,
  set_name text,
  created_at timestamptz not null default now(),
  unique (user_id, file_id)
);

alter table public.posts
  add column sticker_id uuid references public.telegram_stickers(id) on delete set null;

create index telegram_stickers_user_idx on public.telegram_stickers (user_id, created_at desc);
alter table public.telegram_stickers enable row level security;
create policy "Users read own Telegram stickers" on public.telegram_stickers
for select using (auth.uid() = user_id);
grant select on public.telegram_stickers to authenticated;
