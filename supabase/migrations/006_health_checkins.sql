-- ============================================================
-- LIMIAR — Daily health check-in (sleep / soreness / energy / RPE)
-- One row per user per day. Feeds the readiness score (Phase 2.4).
-- Safe to run multiple times.
-- ============================================================

create table if not exists health_checkins (
  id             uuid default gen_random_uuid() primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  date           date not null,
  sleep_hours    numeric(3,1),          -- e.g. 7.5
  sleep_quality  smallint,              -- 1 (péssimo) … 5 (ótimo)
  energy         smallint,              -- 1 … 5
  soreness       smallint,              -- 1 (nenhuma) … 5 (intensa)
  soreness_areas jsonb,                 -- ["joelho_dir","canela_esq", ...]
  rpe            smallint,              -- 1 … 10 (esforço percebido do treino de ontem)
  notes          text,
  created_at     timestamptz default now() not null,
  updated_at     timestamptz default now() not null,
  unique(user_id, date)
);

create index if not exists health_checkins_user_date
  on health_checkins(user_id, date desc);

alter table health_checkins enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='health_checkins' and policyname='users manage own checkins') then
    create policy "users manage own checkins" on health_checkins for all
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

drop trigger if exists set_updated_at on health_checkins;
create trigger set_updated_at before update on health_checkins
  for each row execute procedure set_updated_at();
