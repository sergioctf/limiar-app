-- 039 — Fecha a leitura de todas as colunas de todos os perfis
-- APLICADA EM PRODUÇÃO: 09/11/2026
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
-- navegador, podia fazer `select * from profiles` e ler e-mail, data de
-- nascimento, altura, sexo e o `wellness_token` de todo mundo.
--
-- (O `wellness_token` já tinha sido neutralizado em 18/10 — passou a ser
-- guardado como hash, ver `src/lib/wellness-token.ts` — porque o acesso ao
-- Supabase estava bloqueado e dava para fechar aquela parte sem DDL.)
--
-- O QUE ENTROU
--
--   1. `public_profiles` — uma view com as três colunas que um atleta pode
--      saber de outro. Roda com os privilégios da dona e por isso atravessa o
--      RLS de `profiles`; o que ela NÃO pode fazer é devolver uma coluna que
--      não está escrita aqui. É a diferença entre confiar na disciplina de
--      cada rota e não ter o que vazar.
--
--   2. A policy larga saiu.
--
-- O QUE EU CONFERI ANTES DE DERRUBAR
--
-- `profiles` nasceu fora das migrations (dívida C4), então não dava para saber
-- daqui quais policies existiam. As três em produção eram:
--
--   Authenticated can search profiles  SELECT  (auth.role() = 'authenticated')
--   Users can view own profile         SELECT  (auth.uid() = id)
--   Users can update own profile       UPDATE  (auth.uid() = id)
--
-- A de leitura própria já existia — por isso derrubar a larga não tranca
-- ninguém fora do próprio perfil, e por isso este arquivo não precisa criá-la.

-- ── 1. A view com o que é público entre atletas ────────────────────────────
drop view if exists public.public_profiles;

create view public.public_profiles
with (security_invoker = false) as
  select id, name, username
  from public.profiles;

comment on view public.public_profiles is
  'O que um atleta pode saber de outro: id, nome e @username. Existe para que a busca de amigos nao precise de uma policy que libere profiles inteira.';

revoke all on public.public_profiles from anon, authenticated;
grant select on public.public_profiles to authenticated;

-- ── 2. E a larga sai ───────────────────────────────────────────────────────
drop policy if exists "Authenticated can search profiles" on public.profiles;

-- ── 3. O resultado, medido de dentro do banco ──────────────────────────────
--
-- Repetindo o ataque com `set_config('role','authenticated')` e um `sub` de um
-- atleta, lendo a tabela:
--
--   perfis visíveis para um usuário logado   1       (era: todos os 8)
--   vê a linha de OUTRO atleta?              NÃO
--   vê wellness_token de outro?              NÃO
--   vê a view public_profiles                8 perfis   ← a busca de amigos vive
--
-- E em produção, com a sessão real do Sérgio: GET /api/friends → 200, três
-- amigos, os três com nome resolvido pela view.
