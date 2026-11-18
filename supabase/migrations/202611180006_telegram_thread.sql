alter table public.posts add column if not exists telegram_thread text check (telegram_thread is null or char_length(telegram_thread) <= 120);
