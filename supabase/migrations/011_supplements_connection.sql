-- ============================================================
-- LIMIAR — Supplements tracker + health connection flag
-- Safe to run multiple times.
-- ============================================================

-- Flag: has the user connected a wearable / Apple Health source?
alter table profiles add column if not exists health_connected boolean not null default false;

-- Supplements the athlete takes
create table if not exists supplements (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  dosage      text,                 -- e.g. "5 g", "2 cápsulas"
  timing      text,                 -- e.g. "manhã", "pós-treino", "antes de dormir"
  notes       text,
  active      boolean not null default true,
  created_at  timestamptz default now() not null,
  updated_at  timestamptz default now() not null
);

create index if not exists supplements_user on supplements(user_id, active, created_at);

alter table supplements enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='supplements' and policyname='users manage own supplements') then
    create policy "users manage own supplements" on supplements for all
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

drop trigger if exists set_updated_at on supplements;
create trigger set_updated_at before update on supplements
  for each row execute procedure set_updated_at();
