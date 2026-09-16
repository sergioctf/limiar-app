-- ============================================================
-- LIMIAR — Melhores esforços por distância
--
-- Um "esforço" é o trecho consecutivo mais rápido de uma dada
-- distância DENTRO de uma atividade. O melhor 10 km de alguém
-- pode estar entre os km 2 e 12 de um longão de 15 km — o
-- rótulo da atividade é um acidente de onde a pessoa parou o
-- relógio, não uma medida de desempenho.
--
-- Uma linha por (corrida, distância): a janela mais rápida
-- daquela corrida. O ranking entre corridas é feito na leitura,
-- para que corrigir o motor não exija reescrever a tabela.
--
-- Seguro rodar mais de uma vez.
-- ============================================================

create table if not exists run_best_efforts (
  run_id        uuid not null references runs(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  distance_m    integer not null,
  -- Tempo em MOVIMENTO. Semáforo não faz parte do esforço.
  seconds       integer not null,
  pace_sec_km   integer not null,
  -- Onde no percurso o trecho aconteceu, em metros desde a largada.
  start_m       integer not null,
  end_m         integer not null,
  -- Desnormalizado de propósito: o ranking ordena por tempo e
  -- desempata por data, e assim não precisa de join com runs.
  run_date      date not null,
  computed_at   timestamptz default now() not null,
  primary key (run_id, distance_m)
);

create index if not exists run_best_efforts_user_dist
  on run_best_efforts(user_id, distance_m, seconds);

alter table run_best_efforts enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'run_best_efforts' and policyname = 'users read own best efforts'
  ) then
    create policy "users read own best efforts" on run_best_efforts for select
      using (auth.uid() = user_id);
  end if;
end $$;
