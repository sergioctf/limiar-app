-- What the athlete actually lifted, set by set.
--
-- This is what turns the app from "here is a plan" into a coach: load
-- progression is decided from real performance, not from a formula applied
-- blindly week after week.

create table if not exists strength_logs (
  id           uuid default uuid_generate_v4() primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  date         date not null,
  exercise_id  text not null,
  set_index    int  not null,            -- 1-based
  weight_kg    numeric,                  -- null for bodyweight work
  reps         int,
  rir          int,                      -- reps left in reserve, as reported
  notes        text,
  created_at   timestamptz default now() not null
);

create index if not exists strength_logs_lookup
  on strength_logs (user_id, exercise_id, date desc);

create index if not exists strength_logs_user_date
  on strength_logs (user_id, date desc);

-- One row per set, per exercise, per day.
create unique index if not exists strength_logs_unique_set
  on strength_logs (user_id, date, exercise_id, set_index);

alter table strength_logs enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'strength_logs' and policyname = 'Users manage own strength logs'
  ) then
    create policy "Users manage own strength logs" on strength_logs
      for all using (auth.uid() = user_id);
  end if;
end $$;
