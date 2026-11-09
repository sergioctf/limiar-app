-- One activity represents the strength log for a given athlete and date.
-- The old sets still use the same key, preserving their history.
alter table public.activities
  add column if not exists strength_log_date date,
  add column if not exists strength_started_at timestamptz,
  add column if not exists strength_finished_at timestamptz;

create unique index if not exists activities_strength_log
  on public.activities(user_id, strength_log_date)
  where strength_log_date is not null and deleted_at is null;

create or replace function public.strava_strength_overlaps(
  raw jsonb, started timestamptz, finished timestamptz, seconds integer
) returns boolean language plpgsql stable set search_path = '' as $$
declare imported_start timestamptz;
begin
  if started is null or finished is null or raw->>'start_date' is null
    or seconds is null or seconds < 60 then return false; end if;
  imported_start := (raw->>'start_date')::timestamptz;
  return abs(extract(epoch from imported_start - started)) <= 1200
    and least(finished, imported_start + make_interval(secs => seconds))
        - greatest(started, imported_start) >= interval '1 minute';
exception when invalid_datetime_format or datetime_field_overflow then
  return false;
end;
$$;

create or replace function public.record_strength_session(
  athlete uuid, day date, series jsonb, started timestamptz, finished timestamptz
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  activity uuid;
  candidates uuid[];
begin
  perform pg_advisory_xact_lock(hashtextextended(athlete::text || ':' || day::text, 0));

  insert into public.strength_logs (user_id, date, exercise_id, set_index, weight_kg, reps, rir)
    select athlete, day, s.exercise_id, s.set_index, s.weight_kg, s.reps, s.rir
    from jsonb_to_recordset(series) as s(
      exercise_id text, set_index integer, weight_kg numeric, reps integer, rir integer
    )
    on conflict (user_id, date, exercise_id, set_index) do update
    set weight_kg = excluded.weight_kg, reps = excluded.reps, rir = excluded.rir;

  select id into activity from public.activities where user_id = athlete
    and strength_log_date = day and deleted_at is null;
  if activity is not null then return activity; end if;

  select array_agg(id) into candidates from public.activities
    where user_id = athlete and date = day and source = 'strava' and deleted_at is null
      and sport_type in ('WeightTraining', 'Workout')
      and public.strava_strength_overlaps(strava_raw_json::jsonb, started, finished, duration_seconds::integer);

  if cardinality(candidates) = 1 then
    update public.activities set strength_log_date = day,
      strength_started_at = started, strength_finished_at = finished
      where id = candidates[1] returning id into activity;
  else
    insert into public.activities (user_id, date, sport_type, name, source, duration_seconds,
      strength_log_date, strength_started_at, strength_finished_at)
      values (athlete, day, 'WeightTraining', 'Musculação', 'manual',
        extract(epoch from finished - started)::integer, day, started, finished)
      returning id into activity;
  end if;
  return activity;
end;
$$;

revoke all on function public.record_strength_session(uuid, date, jsonb, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_strength_session(uuid, date, jsonb, timestamptz, timestamptz) to service_role;

-- An import can arrive while a session is being saved. Both paths take the
-- same per-athlete, per-day lock so the second writer sees the first.
create or replace function public.link_imported_strength_session()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  logged record;
begin
  if new.source <> 'strava' or new.sport_type not in ('WeightTraining', 'Workout') then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || ':' || new.date::text, 0));
  select id, strength_started_at, strength_finished_at into logged
    from public.activities where user_id = new.user_id and strength_log_date = new.date
      and source = 'manual' and deleted_at is null;
  if found and public.strava_strength_overlaps(
    new.strava_raw_json::jsonb, logged.strength_started_at, logged.strength_finished_at, new.duration_seconds::integer
  ) then
    update public.activities set deleted_at = now() where id = logged.id;
    new.strength_log_date := new.date;
    new.strength_started_at := logged.strength_started_at;
    new.strength_finished_at := logged.strength_finished_at;
  end if;
  return new;
end;
$$;

revoke all on function public.link_imported_strength_session() from public, anon, authenticated;
drop trigger if exists link_imported_strength_session on public.activities;
create trigger link_imported_strength_session before insert on public.activities
  for each row execute function public.link_imported_strength_session();
