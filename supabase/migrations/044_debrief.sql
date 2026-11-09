-- Preserve the five-level run effort and its training rules. The new scale
-- and qualitative answers are additional observations.
alter table public.run_feedback
  add column if not exists rpe smallint check (rpe between 0 and 10),
  add column if not exists perception text check (perception in ('light','moderate','heavy')),
  add column if not exists adjusted_sessions text[];

-- Other sports have their own recorded-activity ID. Their feedback never
-- writes a running prescription.
create table if not exists public.activity_feedback (
  activity_id uuid primary key references public.activities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('answered', 'deferred', 'skipped')),
  perception text check (perception in ('light','moderate','heavy')),
  rpe smallint check (rpe between 0 and 10),
  reason text check (reason in ('as_expected','well','time','weather','sleep','fatigue','discomfort','intentional','other')),
  note text check (char_length(note) <= 300),
  planned jsonb,
  updated_at timestamptz not null default now(),
  check (status <> 'answered' or (perception is not null and reason is not null))
);
create index if not exists activity_feedback_user_idx on public.activity_feedback(user_id);
alter table public.activity_feedback enable row level security;
revoke all on public.activity_feedback from anon, authenticated;
grant select, insert, update on public.activity_feedback to authenticated;
drop policy if exists "Athletes manage feedback of own activity" on public.activity_feedback;
create policy "Athletes manage feedback of own activity"
  on public.activity_feedback for all to authenticated
  using (user_id = auth.uid() and exists (
    select 1 from public.activities a where a.id = activity_id and a.user_id = auth.uid() and a.deleted_at is null
  ))
  with check (user_id = auth.uid() and exists (
    select 1 from public.activities a where a.id = activity_id and a.user_id = auth.uid() and a.deleted_at is null
  ));

-- A slow dismissal from another tab cannot erase a completed Debrief.
create or replace function public.keep_answered_feedback()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'answered' and new.status <> 'answered' then
    raise exception 'Feedback is already answered';
  end if;
  return new;
end;
$$;

drop trigger if exists keep_answered_run_feedback on public.run_feedback;
create trigger keep_answered_run_feedback before update of status on public.run_feedback
  for each row execute function public.keep_answered_feedback();

drop trigger if exists keep_answered_activity_feedback on public.activity_feedback;
create trigger keep_answered_activity_feedback before update of status on public.activity_feedback
  for each row execute function public.keep_answered_feedback();

-- Keep a short history of meaningful edits. Snapshots are visible only to
-- their owner and are removed with the underlying activity or account.
create table if not exists public.debrief_revisions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid references public.run_feedback(run_id) on delete cascade,
  activity_id uuid references public.activity_feedback(activity_id) on delete cascade,
  answers jsonb not null,
  recorded_at timestamptz not null default now(),
  check (num_nonnulls(run_id, activity_id) = 1)
);
create index if not exists debrief_revisions_run_idx on public.debrief_revisions(run_id, id desc);
create index if not exists debrief_revisions_activity_idx on public.debrief_revisions(activity_id, id desc);
alter table public.debrief_revisions enable row level security;
revoke all on public.debrief_revisions from anon, authenticated;
grant select on public.debrief_revisions to authenticated;
drop policy if exists "Athletes read own Debrief history" on public.debrief_revisions;
create policy "Athletes read own Debrief history" on public.debrief_revisions for select to authenticated
  using (user_id = auth.uid() and (
    exists(select 1 from public.runs r where r.id = run_id and r.user_id = auth.uid() and r.deleted_at is null)
    or exists(select 1 from public.activities a where a.id = activity_id and a.user_id = auth.uid() and a.deleted_at is null)
  ));

create or replace function public.save_debrief_revision()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  fields text[] := array['user_id','run_id','activity_id','planned','updated_at'];
  previous jsonb := to_jsonb(old) - fields;
  current_answers jsonb := to_jsonb(new) - fields;
  prior_run uuid := (to_jsonb(old)->>'run_id')::uuid;
  prior_activity uuid := (to_jsonb(old)->>'activity_id')::uuid;
begin
  if old.status <> 'answered' or previous = current_answers then return new; end if;
  insert into public.debrief_revisions(user_id, run_id, activity_id, answers, recorded_at)
    values (old.user_id, prior_run, prior_activity, previous, old.updated_at);
  delete from public.debrief_revisions where id in (
    select rev.id from public.debrief_revisions rev
    where rev.run_id = prior_run or rev.activity_id = prior_activity
    order by rev.id desc offset 5
  );
  return new;
end;
$$;

revoke all on function public.save_debrief_revision() from public, anon, authenticated;
drop trigger if exists save_run_debrief_revision on public.run_feedback;
create trigger save_run_debrief_revision after update on public.run_feedback
  for each row execute function public.save_debrief_revision();
drop trigger if exists save_activity_debrief_revision on public.activity_feedback;
create trigger save_activity_debrief_revision after update on public.activity_feedback
  for each row execute function public.save_debrief_revision();
