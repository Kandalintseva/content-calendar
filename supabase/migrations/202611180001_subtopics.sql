create table public.content_subtopics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  destination_id uuid not null references public.content_destinations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now(),
  unique (destination_id, name)
);

alter table public.posts
  add column subtopic_id uuid references public.content_subtopics(id) on delete set null;

create index content_subtopics_user_idx on public.content_subtopics (user_id, destination_id);
create index posts_subtopic_idx on public.posts (subtopic_id);

alter table public.content_subtopics enable row level security;
create policy "Users read own subtopics" on public.content_subtopics
for select using (auth.uid() = user_id);
create policy "Users create own subtopics" on public.content_subtopics
for insert with check (auth.uid() = user_id);
create policy "Users update own subtopics" on public.content_subtopics
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete own subtopics" on public.content_subtopics
for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.content_subtopics to authenticated;
