-- The athlete's running shoes, and which run was done in which.
--
-- Two things this enables that nothing else can: telling someone to save the
-- carbon plate for the day it matters, and telling them a shoe is done before
-- their shin does. Both need the shoes to be named, categorised and counted.
--
-- `initial_km` exists because nobody starts using an app on the day they buy
-- their shoes. Without it every pair reads as brand new and the replacement
-- warning never fires for the pair that most needs it.

create table if not exists shoes (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  brand       text,
  category    text not null default 'rodagem'
                check (category in ('placa','tempo','rodagem','trail')),
  -- Kilometres already on the shoe when it was registered.
  initial_km  numeric(7,1) not null default 0,
  -- Retired shoes keep their history but stop being suggested.
  retired     boolean not null default false,
  notes       text,
  created_at  timestamptz default now() not null
);

create index if not exists shoes_user on shoes (user_id, retired, category);

alter table shoes enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'shoes' and policyname = 'Users manage own shoes'
  ) then
    create policy "Users manage own shoes" on shoes
      for all using (auth.uid() = user_id);
  end if;
end $$;

-- Which shoe a run was done in. Nullable on purpose: every run recorded before
-- today has no answer, and guessing one would corrupt the mileage it feeds.
-- `on delete set null` so deleting a worn-out pair does not delete the runs.
alter table runs
  add column if not exists shoe_id uuid references shoes(id) on delete set null;

create index if not exists runs_shoe on runs (shoe_id) where shoe_id is not null;
