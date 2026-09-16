-- The athlete's own reading of a week that fell short. One row per week.
-- Only ever written by the athlete answering the question the coach asked.
create table if not exists public.week_feedback (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  reason text not null check (reason in ('life', 'body', 'too_much')),
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  primary key (user_id, week_start)
);
alter table public.week_feedback enable row level security;
drop policy if exists "Read own week feedback" on public.week_feedback;
create policy "Read own week feedback" on public.week_feedback for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "Insert own week feedback" on public.week_feedback;
create policy "Insert own week feedback" on public.week_feedback for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "Update own week feedback" on public.week_feedback;
create policy "Update own week feedback" on public.week_feedback for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
