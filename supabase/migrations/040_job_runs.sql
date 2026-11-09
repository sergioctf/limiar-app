-- 040 — Os crons passam a deixar recibo
-- APLICADA EM PRODUÇÃO: 09/11/2026
--
-- POR QUE (dívida A5)
--
-- Todo bug sério deste app falhou **calado**:
--
--   • o resumo semanal por IA ficou morto **meses** — a condição que o
--     procurava nunca batia, e ninguém recebeu um erro;
--   • a IA ficou quebrada **semanas** — 429 da Groq virava `null`, e `null`
--     virava "AI analysis failed or API key not set";
--   • o mapa ficou quebrado **um mês** — o CDN respondia 200 com uma imagem
--     escrita "API KEY REQUIRED";
--   • o envio pro relógio nunca funcionou: o arquivo era gerado certo e não
--     chegava a relógio nenhum.
--
-- Nenhum deles teria sido pego por um Sentry: não houve exceção em lugar
-- nenhum. O que falta não é captura de erro — é **saber se o trabalho
-- aconteceu**. Esta tabela é o lugar onde cada execução deixa recibo, para que
-- a pergunta "o cron da segunda rodou?" tenha resposta.
--
-- O QUE NÃO É
--
-- Não é log de aplicação. É uma linha por execução de tarefa de fundo, com o
-- resultado resumido. Fica pequena de propósito: ~10 crons/dia, e a limpeza
-- abaixo guarda 90 dias.

create table if not exists public.job_runs (
  id          bigserial primary key,
  -- O nome do cron ("weekly-plan", "strava-sync"...).
  job         text        not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  -- 'ok' | 'error' | 'skipped'. Texto, não enum: um status novo não deve
  -- exigir migration.
  status      text        not null default 'ok',
  -- Quantos atletas (ou itens) a execução tocou.
  items       int,
  -- Uma linha legível: "8 users, watch:5sent". É o que se lê primeiro.
  summary     text,
  -- O que deu errado, quando deu.
  error       text,
  -- Espaço para o que cada cron quiser detalhar, sem alterar o esquema.
  detail      jsonb
);

create index if not exists job_runs_job_time on public.job_runs (job, started_at desc);

comment on table public.job_runs is
  'Recibo de cada execucao de tarefa de fundo. Existe porque os bugs serios deste app falharam calados: o que faltava nao era captura de excecao, era saber se o trabalho aconteceu (divida A5).';

-- Só o service_role escreve e lê. Nenhum atleta precisa disto, e a página de
-- saúde roda no servidor.
alter table public.job_runs enable row level security;

-- Sem policy nenhuma: com RLS ligado e nenhuma policy, `anon` e
-- `authenticated` não enxergam nada. O `service_role` atravessa RLS por
-- definição, que é exatamente o acesso que queremos.
revoke all on public.job_runs from anon, authenticated;

-- ── Limpeza ────────────────────────────────────────────────────────────────
-- 90 dias bastam para responder "quando parou?" e mantêm a tabela trivial.
-- Chamada pelo próprio cron, não por pg_cron: menos infraestrutura invisível
-- (a dívida C4 já cobra caro pelo que só existe no Supabase).
create or replace function public.prune_job_runs()
returns void language sql as $$
  delete from public.job_runs where started_at < now() - interval '90 days';
$$;
