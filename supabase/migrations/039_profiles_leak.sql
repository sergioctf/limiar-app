-- 039 — Fecha a leitura de todas as colunas de todos os perfis
--
-- O PROBLEMA (dívida C3, aberta desde 002_social.sql)
--
--   create policy "Authenticated can search profiles"
--     on profiles for select
--     using (auth.role() = 'authenticated');
--
-- O comentário ao lado dela dizia "Only id/name/username are exposed via the
-- API layer". Só que **RLS filtra linhas, não colunas**: a policy liberava a
-- tabela inteira. Qualquer usuário logado, com a anon key que vai no
-- navegador, podia fazer
--
--   select * from profiles
--
-- e ler e-mail, data de nascimento, altura, sexo e o `wellness_token` de todo
-- mundo. O token autentica o endpoint público /api/ingest/wellness: com ele dá
-- para gravar dados de saúde no nome de outra pessoa.
--
-- O QUE ENTRA NO LUGAR
--
--   1. `public_profiles` — uma view com as três colunas que um atleta pode
--      saber de outro. Ela roda com os privilégios da dona e por isso atravessa
--      o RLS de `profiles`; o que ela NÃO pode fazer é devolver uma coluna que
--      não está escrita aqui. É a diferença entre confiar na disciplina de cada
--      rota e não ter o que vazar.
--
--   2. A policy larga sai, e cada um passa a ler o seu próprio perfil.
--
-- ANTES DE RODAR: a primeira consulta lista as policies atuais. `profiles` foi
-- criada fora das migrations (dívida C4), então não há como saber daqui quais
-- existem. Confira que há uma de SELECT sobrando além da que vamos remover —
-- a de baixo cria, mas só se faltar.

-- ── 0. O retrato de antes ──────────────────────────────────────────────────
select policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'profiles'
order by cmd, policyname;

-- ── 1. A view com o que é público entre atletas ────────────────────────────
drop view if exists public.public_profiles;

create view public.public_profiles
with (security_invoker = off) as
  select id, name, username
  from public.profiles;

comment on view public.public_profiles is
  'O que um atleta pode saber de outro: id, nome e @username. Existe para que '
  'a busca de amigos não precise de uma policy que libere profiles inteira.';

revoke all on public.public_profiles from anon, authenticated;
grant select on public.public_profiles to authenticated;

-- ── 2. Cada um lê o seu ────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and cmd = 'SELECT' and qual like '%auth.uid()%'
  ) then
    create policy "Users read own profile"
      on public.profiles for select
      using (auth.uid() = id);
  end if;
end $$;

-- ── 3. E a larga sai ───────────────────────────────────────────────────────
drop policy if exists "Authenticated can search profiles" on public.profiles;

-- ── 4. O retrato de depois ─────────────────────────────────────────────────
select policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'profiles'
order by cmd, policyname;
