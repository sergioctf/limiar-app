-- The athlete's agenda for one week: the days they can run. Planning data, not
-- an excuse after the fact — a week generated after this was given is built on
-- these days, and a week already built is reorganised around them (see
-- src/lib/week-fit.ts). One row per week, written only by the athlete.
create table if not exists public.week_availability (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  run_days text[] not null check (run_days <@ array['Mon','Tue','Wed','Thu','Fri','Sat','Sun']),
  created_at timestamptz not null default now(),
  primary key (user_id, week_start)
);
alter table public.week_availability enable row level security;
drop policy if exists "Read own week availability" on public.week_availability;
create policy "Read own week availability" on public.week_availability for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "Insert own week availability" on public.week_availability;
create policy "Insert own week availability" on public.week_availability for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "Update own week availability" on public.week_availability;
create policy "Update own week availability" on public.week_availability for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Delete own week availability" on public.week_availability;
create policy "Delete own week availability" on public.week_availability for delete to authenticated
  using (user_id = auth.uid());
