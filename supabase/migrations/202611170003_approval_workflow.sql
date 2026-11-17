alter type public.notification_kind add value if not exists 'approval_request';
alter type public.notification_kind add value if not exists 'scheduled_post';

create table public.content_destinations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 180),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create unique index content_destinations_one_default_idx
on public.content_destinations (user_id) where is_default;

alter table public.posts
  add column destination_id uuid references public.content_destinations(id) on delete set null,
  add column approval_status text not null default 'draft'
    check (approval_status in ('draft', 'pending', 'approved', 'needs_changes')),
  add column review_requested_at timestamptz,
  add column approved_at timestamptz;

create index posts_destination_idx on public.posts (destination_id);
create index posts_approved_schedule_idx on public.posts (scheduled_at)
where status = 'planned' and approval_status = 'approved';

alter table public.content_destinations enable row level security;
create policy "Users read own destinations" on public.content_destinations
for select using (auth.uid() = user_id);
create policy "Users create own destinations" on public.content_destinations
for insert with check (auth.uid() = user_id);
create policy "Users update own destinations" on public.content_destinations
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete own destinations" on public.content_destinations
for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.content_destinations to authenticated;

insert into public.content_destinations (user_id, name, is_default)
select id, 'Чат | ИБ — класс | БАУМАНТЕХ.ДЕТИ | Пилот 26/27', true
from auth.users
on conflict (user_id, name) do nothing;

update public.posts p
set destination_id = d.id
from public.content_destinations d
where d.user_id = p.user_id and d.is_default and p.destination_id is null;

create or replace function public.create_default_notification_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notification_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  insert into public.content_destinations (user_id, name, is_default)
  values (new.id, 'Чат | ИБ — класс | БАУМАНТЕХ.ДЕТИ | Пилот 26/27', true)
  on conflict (user_id, name) do nothing;
  return new;
end;
$$;
