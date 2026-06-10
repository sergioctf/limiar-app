-- ============================================================
-- LIMIAR — Schema Supabase
-- Execute este arquivo no SQL Editor do Supabase
-- ============================================================

-- Extensões
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";

-- ─────────────────────────────────────────────────────────────
-- PROFILES
-- ─────────────────────────────────────────────────────────────
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  name        text,
  created_at  timestamptz default now() not null
);

alter table profiles enable row level security;

create policy "Users can view own profile"
  on profiles for select using (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- STRAVA CONNECTIONS
-- ─────────────────────────────────────────────────────────────
create table if not exists strava_connections (
  id            uuid default uuid_generate_v4() primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  athlete_id    bigint not null,
  access_token  text not null,
  refresh_token text not null,
  expires_at    bigint not null,
  scope         text,
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null,
  unique(user_id)
);

alter table strava_connections enable row level security;

create policy "Users can view own strava connection"
  on strava_connections for select using (auth.uid() = user_id);

create policy "Users can insert own strava connection"
  on strava_connections for insert with check (auth.uid() = user_id);

create policy "Users can update own strava connection"
  on strava_connections for update using (auth.uid() = user_id);

create policy "Users can delete own strava connection"
  on strava_connections for delete using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- RUNS
-- ─────────────────────────────────────────────────────────────
create table if not exists runs (
  id                      uuid default uuid_generate_v4() primary key,
  user_id                 uuid not null references auth.users(id) on delete cascade,
  strava_activity_id      bigint unique,
  source                  text not null default 'manual'
                            check (source in ('strava','manual','imported_ai','strava+ai')),
  name                    text not null,
  date                    date not null,
  type                    text not null default 'easy'
                            check (type in ('easy','long_run','tempo','intervals','race','recovery','steady','progression','other')),
  distance_km             numeric(6,2) not null,
  duration_seconds        integer not null,
  moving_time_seconds     integer,
  elapsed_time_seconds    integer,
  avg_pace_seconds_per_km integer,
  avg_speed_mps           numeric(5,3),
  max_speed_mps           numeric(5,3),
  avg_hr                  integer,
  max_hr                  integer,
  elevation_gain_m        numeric(7,1),
  avg_cadence             integer,
  calories                integer,
  suffer_score            integer,
  map_polyline            text,
  device_name             text,
  temperature_c           numeric(4,1),
  conditions              text,
  perceived_effort        integer check (perceived_effort between 1 and 10),
  hydration               text,
  gel_usage               text,
  notes                   text,
  relevance               integer check (relevance between 1 and 10),
  raw_text                text,
  coach_feedback          text,
  strava_raw_json         jsonb,
  workout_score           numeric(4,1),
  synced_at               timestamptz,
  deleted_at              timestamptz,
  created_at              timestamptz default now() not null,
  updated_at              timestamptz default now() not null
);

create index if not exists runs_user_id_date on runs(user_id, date desc);
create index if not exists runs_user_source on runs(user_id, source);
create index if not exists runs_strava_id on runs(strava_activity_id) where strava_activity_id is not null;

alter table runs enable row level security;

create policy "Users can view own runs"
  on runs for select using (auth.uid() = user_id);

create policy "Users can insert own runs"
  on runs for insert with check (auth.uid() = user_id);

create policy "Users can update own runs"
  on runs for update using (auth.uid() = user_id);

create policy "Users can delete own runs"
  on runs for delete using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- RUN TAGS
-- ─────────────────────────────────────────────────────────────
create table if not exists run_tags (
  id      uuid default uuid_generate_v4() primary key,
  run_id  uuid not null references runs(id) on delete cascade,
  tag     text not null,
  unique(run_id, tag)
);

create index if not exists run_tags_run_id on run_tags(run_id);
create index if not exists run_tags_tag on run_tags(tag);

alter table run_tags enable row level security;

create policy "Users can manage tags of own runs"
  on run_tags for all
  using (exists (select 1 from runs where runs.id = run_tags.run_id and runs.user_id = auth.uid()));

-- ─────────────────────────────────────────────────────────────
-- GOALS
-- ─────────────────────────────────────────────────────────────
create table if not exists goals (
  id                        uuid default uuid_generate_v4() primary key,
  user_id                   uuid not null references auth.users(id) on delete cascade,
  race_name                 text not null,
  distance_km               numeric(6,2) not null,
  race_date                 date,
  target_time_seconds       integer,
  target_pace_seconds_per_km integer,
  conservative_time_seconds integer,
  likely_time_seconds       integer,
  optimistic_time_seconds   integer,
  status                    text not null default 'upcoming'
                              check (status in ('upcoming','active','completed','cancelled')),
  strategy                  text,
  notes                     text,
  created_at                timestamptz default now() not null,
  updated_at                timestamptz default now() not null
);

create index if not exists goals_user_id on goals(user_id);

alter table goals enable row level security;

create policy "Users can manage own goals"
  on goals for all using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- RACE STRATEGIES
-- ─────────────────────────────────────────────────────────────
create table if not exists race_strategies (
  id                          uuid default uuid_generate_v4() primary key,
  user_id                     uuid not null references auth.users(id) on delete cascade,
  goal_id                     uuid references goals(id) on delete set null,
  title                       text not null,
  scenario                    text not null check (scenario in ('conservative','balanced','aggressive')),
  target_time_seconds         integer,
  target_pace_seconds_per_km  integer,
  strategy_text               text,
  hydration_plan              text,
  gel_plan                    text,
  splits_json                 jsonb,
  created_at                  timestamptz default now() not null,
  updated_at                  timestamptz default now() not null
);

alter table race_strategies enable row level security;

create policy "Users can manage own race strategies"
  on race_strategies for all using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- COACH REPORTS
-- ─────────────────────────────────────────────────────────────
create table if not exists coach_reports (
  id              uuid default uuid_generate_v4() primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  title           text not null,
  report_date     date not null,
  period_type     text not null default 'general'
                    check (period_type in ('run','week','month','cycle','general')),
  period_start    date,
  period_end      date,
  summary         text,
  full_report     text,
  strengths       text,
  weaknesses      text,
  projections     text,
  recommendations text,
  created_at      timestamptz default now() not null,
  updated_at      timestamptz default now() not null
);

alter table coach_reports enable row level security;

create policy "Users can manage own coach reports"
  on coach_reports for all using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- TRAINING CYCLES
-- ─────────────────────────────────────────────────────────────
create table if not exists training_cycles (
  id                uuid default uuid_generate_v4() primary key,
  user_id           uuid not null references auth.users(id) on delete cascade,
  name              text not null,
  start_date        date not null,
  end_date          date,
  objective         text,
  planned_volume_km numeric(7,2),
  actual_volume_km  numeric(7,2),
  notes             text,
  final_assessment  text,
  created_at        timestamptz default now() not null,
  updated_at        timestamptz default now() not null
);

alter table training_cycles enable row level security;

create policy "Users can manage own training cycles"
  on training_cycles for all using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- PROJECTIONS
-- ─────────────────────────────────────────────────────────────
create table if not exists projections (
  id                          uuid default uuid_generate_v4() primary key,
  user_id                     uuid not null references auth.users(id) on delete cascade,
  distance_km                 numeric(6,2) not null,
  scenario                    text not null check (scenario in ('conservative','likely','optimistic')),
  projected_time_seconds      integer not null,
  projected_pace_seconds_per_km integer not null,
  confidence                  text,
  assumptions                 text,
  created_at                  timestamptz default now() not null,
  updated_at                  timestamptz default now() not null
);

alter table projections enable row level security;

create policy "Users can manage own projections"
  on projections for all using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- SYNC LOGS
-- ─────────────────────────────────────────────────────────────
create table if not exists sync_logs (
  id                   uuid default uuid_generate_v4() primary key,
  user_id              uuid not null references auth.users(id) on delete cascade,
  source               text not null default 'strava',
  status               text not null check (status in ('success','error','partial')),
  message              text,
  activities_imported  integer default 0,
  activities_updated   integer default 0,
  activities_ignored   integer default 0,
  created_at           timestamptz default now() not null
);

create index if not exists sync_logs_user_id on sync_logs(user_id, created_at desc);

alter table sync_logs enable row level security;

create policy "Users can view own sync logs"
  on sync_logs for select using (auth.uid() = user_id);

create policy "Service can insert sync logs"
  on sync_logs for insert with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- AUTO-UPDATE updated_at
-- ─────────────────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$ declare
  t text;
begin
  foreach t in array array['runs','goals','race_strategies','coach_reports','training_cycles','projections','strava_connections'] loop
    execute format('
      drop trigger if exists set_updated_at on %I;
      create trigger set_updated_at before update on %I
        for each row execute procedure set_updated_at();
    ', t, t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- COACH CHAT MESSAGES  (Phase 3 — Coach Memory)
-- ─────────────────────────────────────────────────────────────
create table if not exists coach_chat_messages (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  report_id   uuid references coach_reports(id) on delete set null,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  created_at  timestamptz default now() not null
);

create index if not exists chat_messages_user_report
  on coach_chat_messages(user_id, report_id, created_at);

alter table coach_chat_messages enable row level security;

create policy "Users can manage own chat messages"
  on coach_chat_messages for all using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- ATHLETE NOTES  (Phase 3 — Coach Memory)
-- ─────────────────────────────────────────────────────────────
create table if not exists athlete_notes (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  category    text not null
                check (category in ('injury','preference','availability','goal','observation')),
  content     text not null,
  source      text not null default 'chat',
  active      boolean not null default true,
  created_at  timestamptz default now() not null,
  updated_at  timestamptz default now() not null
);

create index if not exists athlete_notes_user_active
  on athlete_notes(user_id, active, created_at desc);

alter table athlete_notes enable row level security;

create policy "Users can manage own athlete notes"
  on athlete_notes for all using (auth.uid() = user_id);

-- updated_at trigger for athlete_notes
drop trigger if exists set_updated_at on athlete_notes;
create trigger set_updated_at before update on athlete_notes
  for each row execute procedure set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- PUSH NOTIFICATIONS
-- ─────────────────────────────────────────────────────────────
create table if not exists push_subscriptions (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null,
  p256dh_key  text not null,
  auth_key    text not null,
  user_agent  text,
  created_at  timestamptz default now() not null,
  updated_at  timestamptz default now() not null,
  unique(user_id, endpoint)
);

create index if not exists push_subscriptions_user_created
  on push_subscriptions(user_id, created_at desc);

alter table push_subscriptions enable row level security;

create policy "Users can manage own push subscriptions"
  on push_subscriptions for all using (auth.uid() = user_id);

-- updated_at trigger for push_subscriptions
drop trigger if exists set_updated_at on push_subscriptions;
create trigger set_updated_at before update on push_subscriptions
  for each row execute procedure set_updated_at();
