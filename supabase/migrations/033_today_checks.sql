-- The coach's check before today's session: when sleep, the watch, what the
-- athlete reported and the training load earn a question. One row per day,
-- written the first time the coach decides to ask or to note something, so the
-- next days know it already asked (see src/lib/today-check.ts).
create table if not exists public.today_checks (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  session_label text,
  action text not null check (action in ('ask', 'note')),
  score smallint not null default 0,
  signals jsonb not null default '[]'::jsonb,
  -- The pop-up shows at most once a day; after that the question lives on the Hoje card.
  prompted_at timestamptz,
  answer text check (answer in ('keep', 'shorter', 'easy', 'tomorrow')),
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, date)
);
alter table public.today_checks enable row level security;
drop policy if exists "Read own today checks" on public.today_checks;
create policy "Read own today checks" on public.today_checks for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "Insert own today checks" on public.today_checks;
create policy "Insert own today checks" on public.today_checks for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "Update own today checks" on public.today_checks;
create policy "Update own today checks" on public.today_checks for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
