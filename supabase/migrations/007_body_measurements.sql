-- ============================================================
-- LIMIAR — Body composition measurements (weight + bioimpedance)
-- Manual entry (mirrors the numbers the Xiaomi S400 shows in Mi Home).
-- One row per user per day. Safe to run multiple times.
-- ============================================================

create table if not exists body_measurements (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  date            date not null,
  weight_kg       numeric(5,2) not null,        -- required
  body_fat_pct    numeric(4,1),
  muscle_mass_kg  numeric(5,2),
  water_pct       numeric(4,1),
  visceral_fat    numeric(4,1),
  bone_mass_kg    numeric(4,2),
  bmi             numeric(4,1),
  basal_kcal      integer,                       -- basal metabolism from scale
  notes           text,
  created_at      timestamptz default now() not null,
  updated_at      timestamptz default now() not null,
  unique(user_id, date)
);

create index if not exists body_measurements_user_date
  on body_measurements(user_id, date desc);

alter table body_measurements enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='body_measurements' and policyname='users manage own measurements') then
    create policy "users manage own measurements" on body_measurements for all
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

drop trigger if exists set_updated_at on body_measurements;
create trigger set_updated_at before update on body_measurements
  for each row execute procedure set_updated_at();
