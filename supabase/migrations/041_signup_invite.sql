-- The seeded legacy invite was shipped in the repository. Revoke that row
-- before enabling database-enforced signup; generated invites remain active.
update public.invite_codes set active = false
where label = 'Código original (migrado do cliente)' and max_uses = 0;

-- The database checks the invite even when signup bypasses the web form.
-- The counter and redemption roll back if account creation fails.
create or replace function public.signup_invite_status(invite_code text)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when not active then 'invalid'
      when expires_at <= now() then 'expired'
      when max_uses > 0 and used_count >= max_uses then 'exhausted'
      else 'ok'
    end
    from public.invite_codes
    where lower(code) = lower(btrim(invite_code))
    order by created_at, id limit 1
  ), 'invalid');
$$;

revoke all on function public.signup_invite_status(text) from public, anon, authenticated;
grant execute on function public.signup_invite_status(text) to service_role;

create or replace function public.consume_signup_invite()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  candidate uuid;
  redeemed uuid;
begin
  select id into candidate from public.invite_codes
    where lower(code) = lower(btrim(new.raw_user_meta_data->>'signup_invite'))
    order by created_at, id limit 1;

  update public.invite_codes
    set used_count = used_count + 1
    where id = candidate and active and (expires_at is null or expires_at > now())
      and (max_uses = 0 or used_count < max_uses)
    returning id into redeemed;

  if redeemed is null then
    raise exception 'Invalid signup invite';
  end if;

  insert into public.invite_redemptions(invite_id, email) values (redeemed, new.email);
  new.raw_user_meta_data := new.raw_user_meta_data - 'signup_invite';
  return new;
end;
$$;

revoke all on function public.consume_signup_invite() from public, anon, authenticated;
drop trigger if exists require_signup_invite on auth.users;
create trigger require_signup_invite before insert on auth.users
  for each row execute function public.consume_signup_invite();
