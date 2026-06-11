-- ============================================================
-- LIMIAR — Social (friends by username + aggregate leaderboard)
-- Run this in the Supabase SQL Editor.
-- Safe to run multiple times (IF NOT EXISTS / idempotent policies).
-- ============================================================

-- ── 1. Username on profiles ─────────────────────────────────
alter table profiles add column if not exists username text;

-- Case-insensitive uniqueness (only when username is set)
create unique index if not exists profiles_username_unique
  on profiles (lower(username))
  where username is not null;

-- Allow any authenticated user to look up a profile by username
-- (needed to send friend requests). Only id/name/username are exposed
-- via the API layer; this policy enables the lookup.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'profiles' and policyname = 'Authenticated can search profiles'
  ) then
    create policy "Authenticated can search profiles"
      on profiles for select
      using (auth.role() = 'authenticated');
  end if;
end $$;

-- ── 2. Friendships ──────────────────────────────────────────
create table if not exists friendships (
  id            uuid default gen_random_uuid() primary key,
  requester_id  uuid not null references auth.users(id) on delete cascade,
  addressee_id  uuid not null references auth.users(id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending','accepted')),
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null,
  unique(requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create index if not exists friendships_addressee on friendships(addressee_id, status);
create index if not exists friendships_requester on friendships(requester_id, status);

alter table friendships enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='friendships' and policyname='view own friendships') then
    create policy "view own friendships" on friendships for select
      using (auth.uid() = requester_id or auth.uid() = addressee_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='friendships' and policyname='create friend request') then
    create policy "create friend request" on friendships for insert
      with check (auth.uid() = requester_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='friendships' and policyname='update as addressee') then
    create policy "update as addressee" on friendships for update
      using (auth.uid() = addressee_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='friendships' and policyname='delete own friendship') then
    create policy "delete own friendship" on friendships for delete
      using (auth.uid() = requester_id or auth.uid() = addressee_id);
  end if;
end $$;

-- updated_at trigger
drop trigger if exists set_updated_at on friendships;
create trigger set_updated_at before update on friendships
  for each row execute procedure set_updated_at();
