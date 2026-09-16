-- Garmin health data through intervals.icu, and the day's energy from Apple Health.
--
-- Garmin paused new applications to its developer program in 2026 with no date
-- to reopen. intervals.icu is an existing Garmin partner, so its integration
-- keeps receiving sleep, HRV and resting heart rate from any Garmin device —
-- and it hands them back through a personal API key the athlete generates.

create table if not exists intervals_connections (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  athlete_id    text not null,
  api_key       text not null,
  athlete_name  text,
  last_sync_at  timestamptz,
  last_error    text,
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null,
  unique(user_id)
);

-- Row level security on, and deliberately no policy.
--
-- The API key opens the athlete's whole intervals.icu account, not just the
-- wellness it is used for here. Only the server, with the service role, ever
-- reads this table; the browser learns whether a connection exists through an
-- API route that never returns the key — not even to its own owner.
alter table intervals_connections enable row level security;

drop trigger if exists set_updated_at on intervals_connections;
create trigger set_updated_at before update on intervals_connections
  for each row execute procedure set_updated_at();

-- The day's energy, as the watch measured it (Garmin writes both to Apple Health).
--
-- Resting is the watch's own basal estimate for the day; active is everything
-- above it — training, walking, stairs. Together they replace a formula
-- (Mifflin × 1.2) with a measurement.
alter table wellness_data
  add column if not exists active_kcal  smallint,
  add column if not exists resting_kcal smallint;
