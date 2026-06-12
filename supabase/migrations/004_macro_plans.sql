-- ============================================================
-- LIMIAR — Long-term periodized training plans (macro plans)
-- Safe to run multiple times.
-- ============================================================

create table if not exists training_macro_plans (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  race_type     text not null,           -- '5k','10k','half','marathon','ultra','triathlon','other'
  race_label    text not null,           -- display name, e.g. "Maratona de SP"
  target_month  text not null,           -- 'YYYY-MM' (estimated — user can change)
  status        text not null default 'active' check (status in ('active','completed','cancelled')),
  plan_json     jsonb not null,          -- { weeks:[], phases_summary:[], rationale, adaptation_note? }
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null
);

create index if not exists macro_plans_user_active
  on training_macro_plans(user_id, status, created_at desc);

alter table training_macro_plans enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='training_macro_plans' and policyname='users manage own macro plans') then
    create policy "users manage own macro plans" on training_macro_plans for all
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

drop trigger if exists set_updated_at on training_macro_plans;
create trigger set_updated_at before update on training_macro_plans
  for each row execute procedure set_updated_at();
