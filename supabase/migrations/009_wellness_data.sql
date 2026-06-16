-- ============================================================
-- LIMIAR — Wellness data (sleep / HRV / RHR / stress / body battery)
-- Ingested from the native app (Health Connect / Apple Health → Garmin),
-- or any future source. One row per user per day.
-- ============================================================

create table if not exists wellness_data (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  date            date not null,
  sleep_seconds   integer,          -- total sleep
  sleep_score     smallint,         -- 0-100 (Garmin sleep score, if available)
  hrv_ms          numeric(5,1),     -- overnight avg HRV (ms)
  hrv_status      text,             -- 'balanced' | 'unbalanced' | 'low' | 'poor'
  resting_hr      smallint,         -- bpm
  stress_avg      smallint,         -- 0-100
  body_battery    smallint,         -- 0-100 (morning value)
  source          text not null default 'manual_import',  -- healthconnect|healthkit|garmin|manual_import
  raw             jsonb,
  created_at      timestamptz default now() not null,
  updated_at      timestamptz default now() not null,
  unique(user_id, date)
);

create index if not exists wellness_data_user_date
  on wellness_data(user_id, date desc);

alter table wellness_data enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='wellness_data' and policyname='users manage own wellness') then
    create policy "users manage own wellness" on wellness_data for all
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

drop trigger if exists set_updated_at on wellness_data;
create trigger set_updated_at before update on wellness_data
  for each row execute procedure set_updated_at();
