-- ============================================================
-- LIMIAR — Plan adjustment suggestions (readiness-driven, opt-in)
-- The app never changes the plan automatically; it proposes, the user decides.
-- ============================================================

create table if not exists plan_suggestions (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  date          date not null,                 -- the day the suggestion applies to
  kind          text not null default 'readiness_adjust',
  reason        text not null,                 -- why we suggest it (e.g. "Prontidão 38/100")
  message       text not null,                 -- human-readable proposal
  original_day  jsonb,                         -- the planned WeeklyPlanDay before change
  suggested_day jsonb,                         -- the proposed replacement WeeklyPlanDay
  status        text not null default 'pending' check (status in ('pending','accepted','dismissed')),
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null,
  unique(user_id, date, kind)
);

create index if not exists plan_suggestions_user_pending
  on plan_suggestions(user_id, status, date desc);

alter table plan_suggestions enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='plan_suggestions' and policyname='users manage own suggestions') then
    create policy "users manage own suggestions" on plan_suggestions for all
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

drop trigger if exists set_updated_at on plan_suggestions;
create trigger set_updated_at before update on plan_suggestions
  for each row execute procedure set_updated_at();
