-- ============================================================
-- LIMIAR — Advisor suggestions
--
-- The athlete configures, the engines build, and the advisor observes the
-- result and proposes changes. Nothing here is applied automatically: a row is
-- a proposal with an explicit patch, and it only takes effect when the athlete
-- presses "Aplicar".
--
-- Dismissals are remembered by `finding_key` so the app never re-argues a point
-- the athlete already rejected — it only comes back if the situation changes
-- and enough time has passed.
-- ============================================================

create table if not exists advisor_suggestions (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,

  -- Stable identity of the finding (e.g. "perna_antes_longao_Fri"), so the same
  -- observation across weeks is one conversation, not a new nag every Monday.
  finding_key   text not null,
  week_start    date not null,                 -- Monday the finding was raised for

  area          text not null,                 -- integracao | forca | corrida | recuperacao | teste
  severity      text not null default 'media' check (severity in ('alta','media','baixa')),

  title         text not null,
  evidence      text not null,                 -- what was measured
  proposal      text not null,                 -- what we suggest
  rationale     text not null,                 -- the rule behind it
  narrative     text,                          -- AI-written wording, optional
  action_label  text,                          -- button label when patch is not null
  patch         jsonb,                         -- null = advice only

  status        text not null default 'pending'
                check (status in ('pending','accepted','dismissed')),

  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null,

  unique(user_id, finding_key, week_start)
);

create index if not exists advisor_suggestions_user_status
  on advisor_suggestions(user_id, status, created_at desc);

-- Used to check whether a finding was dismissed recently, before raising it again.
create index if not exists advisor_suggestions_user_key
  on advisor_suggestions(user_id, finding_key, created_at desc);

alter table advisor_suggestions enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'advisor_suggestions' and policyname = 'users manage own advisor suggestions'
  ) then
    create policy "users manage own advisor suggestions" on advisor_suggestions
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

drop trigger if exists set_updated_at on advisor_suggestions;
create trigger set_updated_at before update on advisor_suggestions
  for each row execute procedure set_updated_at();
