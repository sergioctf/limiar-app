-- One explicit choice per planned slot. Existing records remain unchanged.
create table if not exists public.session_activity_links (
  user_id uuid not null references auth.users(id) on delete cascade,
  session_date date not null,
  sport text not null check (char_length(sport) between 1 and 32),
  session_type text not null check (char_length(session_type) between 1 and 32),
  run_id uuid references public.runs(id) on delete cascade,
  activity_id uuid references public.activities(id) on delete cascade,
  planned jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, session_date, sport),
  check (num_nonnulls(run_id, activity_id) = 1),
  check ((sport = 'corrida') = (run_id is not null))
);
create index if not exists session_activity_links_run_idx on public.session_activity_links(run_id) where run_id is not null;
create index if not exists session_activity_links_activity_idx on public.session_activity_links(activity_id) where activity_id is not null;
alter table public.session_activity_links enable row level security;
revoke all on public.session_activity_links from anon, authenticated;
grant select on public.session_activity_links to authenticated;
grant select, insert, update, delete on public.session_activity_links to service_role;
drop policy if exists "Athletes read their session links" on public.session_activity_links;
create policy "Athletes read their session links" on public.session_activity_links
  for select to authenticated using (user_id = auth.uid());

-- Check ownership and date again while holding the selected record against
-- concurrent edits/deletion. The API validates the sport and saved plan slot.
create or replace function public.validate_session_activity_link()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.run_id is not null then
    perform 1 from public.runs r
      where r.id = new.run_id and r.user_id = new.user_id
        and r.date = new.session_date and r.deleted_at is null for share;
  else
    perform 1 from public.activities a
      where a.id = new.activity_id and a.user_id = new.user_id
        and a.date = new.session_date and a.deleted_at is null for share;
  end if;
  if not found then
    raise exception 'Activity no longer belongs to this athlete and date';
  end if;
  return new;
end;
$$;
drop trigger if exists validate_session_activity_link on public.session_activity_links;
create trigger validate_session_activity_link before insert or update on public.session_activity_links
  for each row execute function public.validate_session_activity_link();
