-- ============================================================
-- LIMIAR — Pausa dentro de um melhor esforço
--
-- Um recorde é medido pelo relógio da prova: se você parou 87s
-- num semáforo no meio do quilômetro, o quilômetro levou esses
-- 87s. Descontá-los era como fabricar um recorde — e foi o que
-- a primeira versão fazia, produzindo um "1 km em 3:57" para um
-- atleta cujo melhor 1 km real é 5:24.
--
-- A pausa não é descontada. É guardada aqui só para que o app
-- possa dizer "esse trecho tem 1min27s de parada", em vez de
-- apresentá-lo como um esforço limpo.
--
-- Seguro rodar mais de uma vez.
-- ============================================================

alter table run_best_efforts
  add column if not exists paused_sec integer not null default 0;
