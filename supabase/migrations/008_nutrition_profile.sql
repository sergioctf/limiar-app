-- ============================================================
-- LIMIAR — Profile fields needed for BMR/TDEE (Mifflin-St Jeor)
-- Safe to run multiple times.
-- ============================================================

alter table profiles add column if not exists height_cm  numeric(4,1);
alter table profiles add column if not exists sex        text;
alter table profiles add column if not exists birth_date date;
alter table profiles add column if not exists calorie_goal text;  -- 'maintain' | 'cut' | 'gain'

-- guard the sex values without failing if the constraint already exists
do $$ begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'profiles' and constraint_name = 'profiles_sex_check'
  ) then
    alter table profiles add constraint profiles_sex_check check (sex in ('M','F') or sex is null);
  end if;
end $$;
