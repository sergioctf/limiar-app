-- ============================================================
-- LIMIAR — Kudos (reactions on friends' runs)
-- Safe to run multiple times.
-- ============================================================

create table if not exists kudos (
  id          uuid default gen_random_uuid() primary key,
  run_id      uuid not null references runs(id) on delete cascade,
  sender_id   uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz default now() not null,
  unique(run_id, sender_id)
);

create index if not exists kudos_run on kudos(run_id);
create index if not exists kudos_sender on kudos(sender_id, created_at desc);

alter table kudos enable row level security;

-- Inserts/deletes go through the API (service role) after verifying
-- friendship; senders can still read/remove their own kudos directly.
do $$ begin
  if not exists (select 1 from pg_policies where tablename='kudos' and policyname='sender manages own kudos') then
    create policy "sender manages own kudos" on kudos for all
      using (auth.uid() = sender_id) with check (auth.uid() = sender_id);
  end if;
end $$;
