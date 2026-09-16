-- Notifications about friends: who gets them, and how often.
--
-- Two tables, because they answer two different questions.
--
-- `friend_mutes` is the athlete's choice: presence of a row means "do not tell
-- me when this person trains". Storing only the exceptions keeps the default
-- (notify) implicit and means adding a friend needs no extra write.
--
-- `friend_workout_notices` is the throttle. It exists because a workout can
-- reach the app by three routes — the Strava webhook, the nightly sync and a
-- manual entry — and without a record of what was already announced the same
-- run would buzz three phones three times. Making the key
-- (recipient, athlete, day) also caps a prolific friend at one notification a
-- day, which is the actual complaint behind the mute feature.

create table if not exists friend_mutes (
  user_id    uuid not null references auth.users(id) on delete cascade,
  friend_id  uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now() not null,
  primary key (user_id, friend_id)
);

alter table friend_mutes enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'friend_mutes' and policyname = 'users manage own mutes'
  ) then
    create policy "users manage own mutes" on friend_mutes
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

create table if not exists friend_workout_notices (
  user_id    uuid not null references auth.users(id) on delete cascade,
  friend_id  uuid not null references auth.users(id) on delete cascade,
  date       date not null,
  created_at timestamptz default now() not null,
  primary key (user_id, friend_id, date)
);

-- Written only by the service role from the notification path; the athlete has
-- no reason to read or change it, so no policy is granted.
alter table friend_workout_notices enable row level security;
