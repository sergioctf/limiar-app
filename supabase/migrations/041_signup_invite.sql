-- The seeded legacy invite was shipped in the repository. Revoke that row
-- before enabling database-enforced signup; generated invites remain active.
--
-- CORRIGIDO EM 09/11, ANTES DE APLICAR. A condição original era
--
--   where label = 'Código original (migrado do cliente)' and max_uses = 0
--
-- e **não casava com linha nenhuma**: no banco o rótulo está sem acento e sem
-- parênteses — `Codigo original migrado do cliente`. A migration teria rodado
-- com sucesso, relatado sucesso, e deixado o convite legado ativo com
-- `max_uses = 0`, que nesta tabela significa **usos ilimitados**. Ou seja: o
-- código que vazou no bundle do cliente continuaria abrindo contas para sempre.
--
-- A condição agora é semântica em vez de textual. Só existe uma linha
-- ilimitada, e nenhum convite gerado para uma pessoa tem `max_uses = 0`.
update public.invite_codes set active = false
where max_uses = 0 and active;

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

-- TOLERANTE AO CLIENTE PUBLICADO. Ver a nota no fim do arquivo.
create or replace function public.consume_signup_invite()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  supplied text := btrim(coalesce(new.raw_user_meta_data->>'signup_invite', ''));
  candidate uuid;
  redeemed uuid;
begin
  -- O cliente do redesign manda o convite aqui. O que está no ar valida na
  -- rota e chama signUp() sem metadado — exigir o campo bloquearia 100% dos
  -- cadastros até o deploy. Trocar por `raise exception` quando publicar.
  if supplied = '' then
    return new;
  end if;

  select id into candidate from public.invite_codes
    where lower(code) = lower(supplied)
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

-- ───────────────────────────────────────────────────────────────────────────
-- APLICADA EM PRODUÇÃO: 09/11/2026, e o que aprendi aplicando.
--
-- Rodei esta migration com o **código antigo ainda publicado** e quebrei o
-- cadastro por alguns minutos. O gatilho, como estava escrito, exigia
-- `signup_invite` em `raw_user_meta_data` — campo que só o cliente do
-- redesign envia. A produção valida o convite na rota `/api/auth/invite` e
-- depois chama `signUp()` limpo, então toda criação de conta passou a morrer
-- com "Invalid signup invite".
--
-- A função acima é a versão tolerante: **exige o convite quando ele vem** e
-- aceita quando não vem, preservando exatamente o comportamento que a
-- produção já tinha. Verificado no banco, numa transação desfeita no fim:
--
--   cliente antigo cria conta ........ SIM
--   convite inválido é barrado ....... SIM
--
-- NO DEPLOY DO REDESIGN: trocar o `return new` do caminho vazio por
--
--   raise exception 'Invalid signup invite';
--
-- e aí o banco passa a ser a única autoridade sobre convites, que era a
-- intenção original.
--
-- A lição geral: migration que assume código novo não pode ser aplicada antes
-- dele. Ou ela é compatível com os dois lados, ou vai junto com o deploy.
