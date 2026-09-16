-- Whoop connection, and a home for the recovery score it produces.
--
-- Mirrors `strava_connections`: one row per athlete, tokens refreshed in place.
-- Whoop access tokens are short-lived (about an hour), so the refresh token is
-- the important half — it only arrives when the `offline` scope is requested.

create table if not exists whoop_connections (
  id            uuid default uuid_generate_v4() primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  whoop_user_id text,
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz not null,
  scope         text,
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null,
  unique(user_id)
);

alter table whoop_connections enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'whoop_connections' and policyname = 'users manage own whoop connection'
  ) then
    create policy "users manage own whoop connection" on whoop_connections
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

drop trigger if exists set_updated_at on whoop_connections;
create trigger set_updated_at before update on whoop_connections
  for each row execute procedure set_updated_at();

-- Whoop's own 0–100 recovery estimate.
--
-- Not folded into `body_battery`: that is Garmin's brand name for the same kind
-- of signal, and showing "Body Battery 67" to a Whoop user would be putting one
-- vendor's word on another vendor's number. The readiness engine treats the two
-- as the same *kind* of input and labels whichever one it got.
alter table wellness_data
  add column if not exists recovery_score smallint;
