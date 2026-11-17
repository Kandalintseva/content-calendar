insert into storage.buckets (id, name, public)
values ('post-attachments', 'post-attachments', false)
on conflict (id) do nothing;

create table public.post_attachments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 255),
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  created_at timestamptz not null default now()
);

create index post_attachments_post_idx on public.post_attachments (post_id, created_at);
alter table public.post_attachments enable row level security;
create policy "Users read own post attachments" on public.post_attachments
for select using (auth.uid() = user_id);
create policy "Users create own post attachments" on public.post_attachments
for insert with check (auth.uid() = user_id);
create policy "Users delete own post attachments" on public.post_attachments
for delete using (auth.uid() = user_id);
grant select, insert, delete on public.post_attachments to authenticated;

create policy "Users upload own post attachments" on storage.objects
for insert to authenticated
with check (bucket_id = 'post-attachments' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "Users read own post attachments" on storage.objects
for select to authenticated
using (bucket_id = 'post-attachments' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "Users delete own post attachments" on storage.objects
for delete to authenticated
using (bucket_id = 'post-attachments' and (storage.foldername(name))[1] = (select auth.uid()::text));
