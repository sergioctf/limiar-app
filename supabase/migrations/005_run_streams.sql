-- ============================================================
-- LIMIAR — Cache of Strava activity streams (fetched on-demand)
-- One row per run; avoids re-hitting Strava's rate limit.
-- Safe to run multiple times.
-- ============================================================

create table if not exists run_streams (
  run_id      uuid primary key references runs(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  streams     jsonb not null,        -- { time, distance, heartrate, altitude, latlng, ... }
  analysis    jsonb,                 -- precomputed { splits, hrDrift, ... }
  fetched_at  timestamptz default now() not null
);

create index if not exists run_streams_user on run_streams(user_id);

alter table run_streams enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='run_streams' and policyname='users read own run streams') then
    create policy "users read own run streams" on run_streams for select
      using (auth.uid() = user_id);
  end if;
end $$;
