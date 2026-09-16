-- Per-run subjective feedback. No prescription is changed by this feature.
create table if not exists public.run_feedback (
  run_id uuid primary key references public.runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('answered', 'skipped')),
  effort smallint check (effort between 1 and 5),
  context text check (context in ('none','schedule','work','weather','fatigue','pain','other')),
  note text check (char_length(note) <= 300),
  planned jsonb,
  updated_at timestamptz not null default now(),
  check (status <> 'answered' or (effort is not null and context is not null))
);
create index if not exists run_feedback_user_idx on public.run_feedback(user_id);
alter table public.run_feedback enable row level security;
drop policy if exists "Read own run feedback" on public.run_feedback;
create policy "Read own run feedback" on public.run_feedback for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "Insert own run feedback" on public.run_feedback;
create policy "Insert own run feedback" on public.run_feedback for insert to authenticated
  with check (user_id = auth.uid() and exists (
    select 1 from public.runs r where r.id = run_id and r.user_id = auth.uid() and r.deleted_at is null
  ));
drop policy if exists "Update own run feedback" on public.run_feedback;
create policy "Update own run feedback" on public.run_feedback for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and exists (
    select 1 from public.runs r where r.id = run_id and r.user_id = auth.uid() and r.deleted_at is null
  ));
