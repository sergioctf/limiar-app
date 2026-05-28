-- ============================================================
-- LIMIAR — Seed inicial
-- Baseado no BACKUP_PRE_JUNE_26.md (relatório do treinador IA)
-- Execute APÓS schema.sql no SQL Editor do Supabase
--
-- DATAS DINÂMICAS: usa CURRENT_DATE como âncora.
-- A última corrida fica "3 dias atrás"; todas as anteriores
-- são calculadas proporcionalmente, cobrindo ~4 meses.
-- ============================================================

DO $$
DECLARE
  v_user_id uuid;
  v_goal_meia uuid;
  v_goal_10k  uuid;
  v_base      date := CURRENT_DATE - 3;   -- "última corrida" = 3 dias atrás
BEGIN

  -- Pega o primeiro usuário cadastrado (o seu, após fazer login uma vez)
  SELECT id INTO v_user_id FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum usuário encontrado. Faça login na aplicação primeiro e depois rode o seed.';
  END IF;
  RAISE NOTICE 'Seeding para user_id: %', v_user_id;

  -- ──────────────────────────────────────────────────────────
  -- CICLOS DE TREINO
  -- ──────────────────────────────────────────────────────────
  INSERT INTO training_cycles (user_id, name, start_date, end_date, objective, notes, final_assessment)
  VALUES
    (v_user_id, 'Fase 1 — Início e adaptação', v_base - 118, v_base - 107,
     'Estabelecer regularidade e aprender a correr com continuidade',
     'Ainda sem divisão clara entre treino leve, moderado e forte. Motor e vontade, mas pouco controle.',
     'Capacidade de correr volumes maiores cedo, mas com FC muito alta. Risco de confundir "aguentar" com "estar adaptado".'),
    (v_user_id, 'Fase 2 — Primeira melhora de ritmo', v_base - 106, v_base - 86,
     'Melhorar pace geral e começar a entender intensidades',
     'Pace melhora mas com muita oscilação e intensidade excessiva. FC alta em treinos fortes.',
     'Velocidade emergindo mas custo cardíaco ainda alto. Frequência de esforços fortes excessiva.'),
    (v_user_id, 'Fase 3 — Consolidação dos primeiros longões', v_base - 85, v_base - 55,
     'Construir base de endurance com longões progressivos',
     'Treinos de 8 km ficaram comuns. Longões passaram de 12 km. Dificuldade com calor.',
     'Ganhou resistência mas ainda sofria com calor e com longões feitos fortes demais.'),
    (v_user_id, 'Fase 4 — Fase de performance', v_base - 54, v_base - 25,
     'Transição de completar treinos para treinar performance',
     'Deixou de apenas completar e passou a treinar performance. Tiros, longões com placa e géis.',
     'Ritmo de 5:30–5:40 deixou de ser "prova" e passou a ser "forte controlado". Maior salto de patamar.'),
    (v_user_id, 'Fase 5 — Consolidação e prova', v_base - 24, NULL,
     'Consolidar forma para a Meia Maratona',
     'Prova de 15 km divisor de águas. Longões acima de 17 km com sensação de sobra. Tapering se aproxima.',
     NULL);

  -- ──────────────────────────────────────────────────────────
  -- CORRIDAS (30 treinos históricos)
  -- ──────────────────────────────────────────────────────────
  INSERT INTO runs (user_id, source, name, date, type,
    distance_km, duration_seconds, avg_pace_seconds_per_km,
    avg_hr, elevation_gain_m, conditions, notes, coach_feedback, relevance)
  VALUES
  -- FASE 1
  (v_user_id,'imported_ai','Primeira rodagem relevante',(v_base - 118),'easy',
    5.04, 2000, 397, 173, 14,'SP',
    'Começou forte, depois quebrou o ritmo',
    'Primeiro registro do ciclo. Mostrou ponto inicial de capacidade.',6),
  (v_user_id,'imported_ai','Rodagem contínua',(v_base - 116),'easy',
    6.00, 2184, 364, NULL, NULL,'SP',
    'Corrida contínua, mas ainda desorganizada',NULL,4),
  (v_user_id,'imported_ai','Volume inicial alto',(v_base - 113),'easy',
    10.11, 3706, 366, 181, 42,'SP',
    'Difícil — volume subiu rápido demais para o estágio inicial',
    'Primeiro salto de volume. FC de 181 bpm indica esforço excessivo.',7),
  -- FASE 2
  (v_user_id,'imported_ai','Treino moderado',(v_base - 106),'easy',
    8.01, 2988, 373, 163, 20,'SP',
    'Controlado, boa evolução de FC',
    'Primeira melhora de FC. Sinal de adaptação aeróbica.',6),
  (v_user_id,'imported_ai','Intervalado espontâneo',(v_base - 104),'intervals',
    7.16, 3326, 466, 154, NULL,'SP',
    'Tiros e caminhadas espontâneos — intervalado não planejado',NULL,4),
  (v_user_id,'imported_ai','Blocos fortes',(v_base - 92),'tempo',
    8.14, 2910, 357, 164, NULL,'SP',
    'Blocos fortes, quase treino de ritmo',NULL,6),
  (v_user_id,'imported_ai','Treino forte demais',(v_base - 90),'tempo',
    8.01, 2865, 358, 182, 32,'SP',
    'Terminou sem reserva — treino forte demais para o planejado',
    'Exemplo de treino feito além do planejado. FC 182 excessiva.',7),
  (v_user_id,'imported_ai','Ritmo emergente',(v_base - 88),'tempo',
    6.00, 2032, 338, 183, 25,'SP',
    'Ritmo forte, quase prova. FC 183.',
    'Mostrou velocidade emergente. Custo cardíaco ainda alto.',7),
  -- FASE 3
  (v_user_id,'imported_ai','Moderado com FC menor',(v_base - 84),'easy',
    6.05, 2042, 337, 175, NULL,'SP',
    'Mesmo pace de semana anterior mas com FC menor — sinal de adaptação',
    'Comparação importante: mesmo pace (5:37) com FC menor (175 vs 183).',7),
  (v_user_id,'imported_ai','Primeiro longão de verdade',(v_base - 80),'long_run',
    12.02, 4326, 360, 179, 43,'SP',
    'Máximo esforço. Primeiro longão expressivo do ciclo.',
    'Primeiro longão real. FC 179 ainda alta. Base de endurance estabelecida.',8),
  (v_user_id,'imported_ai','Progressivo forte',(v_base - 73),'progression',
    8.02, 2652, 330, 173, 33,'SP',
    'Terminou com sensação de que dava para correr +2 km',
    'Primeiro sinal forte de performance. Pace 5:30 com reserva.',9),
  (v_user_id,'imported_ai','Rodagem leve',(v_base - 68),'easy',
    4.86, 1757, 361, 165, NULL,'SP',
    'Controle, mas ainda não tão leve quanto ideal',NULL,4),
  (v_user_id,'imported_ai','Resenha moderada',(v_base - 66),'easy',
    7.19, 2504, 348, 170, NULL,'SP',
    '"Resenha" mas moderado/forte — FC 170',NULL,5),
  (v_user_id,'imported_ai','Longão no calor',(v_base - 65),'long_run',
    12.77, 5079, 398, 172, 29,'Calor, pausas, gel',
    'Muito difícil. Calor afetou muito. Pausas necessárias. Primeiro gel.',
    'Aprendizado sobre calor. Mostrou importância de sair cedo e hidratar.',7),
  (v_user_id,'imported_ai','Primeiro treino realmente leve',(v_base - 63),'recovery',
    6.02, 2326, 387, 163, NULL,'SP',
    'Um dos primeiros treinos realmente leves do ciclo',
    'Excelente exemplo de regenerativo. FC 163 adequada para o ritmo.',6),
  (v_user_id,'imported_ai','Longão volume recorde',(v_base - 58),'long_run',
    15.17, 5696, 375, 179, 105,'Casa Branca',
    'Máximo esforço. Grande salto de volume. 105m de altimetria.',
    'Grande salto de volume. Primeiro 15k. Altimetria expressiva.',9),
  -- FASE 4
  (v_user_id,'imported_ai','Tiros de 1 km',(v_base - 54),'intervals',
    8.10, 3527, 435, 155, 29,'SP',
    '4 tiros de 1 km. FC controlada nos recoveries.',
    'Primeiro treino estruturado de tiros. FC 155 boa na recuperação.',8),
  (v_user_id,'imported_ai','Longão 15k organizado',(v_base - 51),'long_run',
    15.00, 5511, 367, 175, NULL,'SP, calor',
    'Difícil por causa do calor. Mais organizado que longões anteriores.',
    'Longão mais organizado apesar do calor. Evolução na gestão.',8),
  (v_user_id,'imported_ai','Regenerativo perfeito',(v_base - 49),'recovery',
    5.74, 2678, 466, 134, 21,'SP',
    'Regenerativo. FC 134 — excelente para recuperação.',
    'Excelente regenerativo. FC 134 mostra controle real de intensidade.',7),
  (v_user_id,'imported_ai','Tiros fortes de 1 km',(v_base - 47),'intervals',
    8.33, 2960, 355, 166, 24,'SP',
    'Difícil mas controlado — 4 tiros fortes de 1 km',
    '4 tiros fortes de 1 km. FC 166 mostra equilíbrio intensidade x controle.',8),
  (v_user_id,'imported_ai','Tempo run controlado',(v_base - 45),'tempo',
    7.00, 2310, 330, 165, 27,'SP',
    'Limiar controlado. FC 165.',
    'Tempo run sustentado. Pace 5:30 com FC 165 mostra melhora de limiar.',8),
  (v_user_id,'imported_ai','Longão pós-futebol',(v_base - 43),'long_run',
    13.00, 4604, 354, 168, 37,'Calor + futebol anterior',
    'Pernas destruídas do futebol. Ainda assim fez 13 km a 5:54/km.',
    'Mostrou força mental. Pernas pesadas mas completou com qualidade.',8),
  (v_user_id,'imported_ai','Melhor longão até então',(v_base - 36),'long_run',
    16.00, 5274, 330, 177, 42,'Placa + 2 géis',
    'Forte mas excelente. Placa e géis. Mudou patamar.',
    'Mudança de patamar. 16 km a 5:30/km com placa e géis.',10),
  (v_user_id,'imported_ai','Recovery pós-longão forte',(v_base - 34),'recovery',
    8.01, 2905, 363, 165, 40,'Sol/calor',
    'Tranquilo, absorveu bem o longão forte.',
    'Boa recuperação após longão intenso. FC 165 adequada.',7),
  (v_user_id,'imported_ai','Longão controlado com calor',(v_base - 29),'long_run',
    17.01, 6306, 371, 164, 49,'Calor, pausas',
    'Dava para mais. 17 km com sensação de reserva apesar do calor.',
    'Mostrou base consolidada. Maior distância até então.',9),
  -- FASE 5
  (v_user_id,'imported_ai','Prova 15 km — melhor indicador',(v_base - 22),'race',
    15.47, 4973, 321, 178, 36,'Prova',
    'Muito bem, com sobra. Km 15 perto de 5:00/km.',
    'Melhor prova/indicador do ciclo. Terminou forte. Projeção de meia confirmada.',10),
  (v_user_id,'imported_ai','Prova 10 km — potencial real',(v_base - 8),'race',
    10.13, 3306, 326, 168, 29,'Prova',
    'Sub-50 possível sem as pausas. Acompanhou namorada nos km 5, 6 e 8.',
    'Mostrou potencial real de sub-50. O que faltou foi contexto, não capacidade física.',9),
  (v_user_id,'imported_ai','Tiros longos 3x2km',(v_base - 5),'intervals',
    9.50, 3589, 378, 155, 27,'SP',
    '3x2 km a ~5:00/km. Não sofreu nada nos tiros. FC 155.',
    '3x2 km a ~5:00 com sensação tranquila. Confirmou velocidade de ritmo.',9),
  (v_user_id,'imported_ai','Longão com chuva e subida',(v_base - 2),'long_run',
    17.92, 6401, 357, 172, 80,'Chuva + subida',
    'Dava para ter ido até 21 km. Chuva ajudou na termorregulação.',
    'Maior longão do ciclo. Confiança para a meia confirmada. Km 18 a 5:17/km.',10),
  (v_user_id,'imported_ai','Steady pós-longão',v_base,'steady',
    8.00, 2682, 335, 166, 30,'SP',
    'Correu super bem. Bloco central muito consistente. Dois dias após longão.',
    'Mostrou recuperação e consistência. 8 km a 5:35/km com FC 166.',10);

  -- ──────────────────────────────────────────────────────────
  -- TAGS das corridas
  -- ──────────────────────────────────────────────────────────
  INSERT INTO run_tags (run_id, tag)
  SELECT r.id, t.tag FROM runs r
  CROSS JOIN (VALUES ('calor'),('difícil')) AS t(tag)
  WHERE r.user_id = v_user_id AND r.date::date = v_base - 65 ON CONFLICT DO NOTHING;

  INSERT INTO run_tags (run_id, tag)
  SELECT r.id, t.tag FROM runs r
  CROSS JOIN (VALUES ('placa'),('gel'),('record-pace')) AS t(tag)
  WHERE r.user_id = v_user_id AND r.date::date = v_base - 36 ON CONFLICT DO NOTHING;

  INSERT INTO run_tags (run_id, tag)
  SELECT r.id, t.tag FROM runs r
  CROSS JOIN (VALUES ('prova'),('record-pace'),('best-race')) AS t(tag)
  WHERE r.user_id = v_user_id AND r.date::date = v_base - 22 ON CONFLICT DO NOTHING;

  INSERT INTO run_tags (run_id, tag)
  SELECT r.id, t.tag FROM runs r
  CROSS JOIN (VALUES ('prova'),('sub-50-potencial')) AS t(tag)
  WHERE r.user_id = v_user_id AND r.date::date = v_base - 8 ON CONFLICT DO NOTHING;

  INSERT INTO run_tags (run_id, tag)
  SELECT r.id, t.tag FROM runs r
  CROSS JOIN (VALUES ('chuva'),('record-distancia'),('confiança-meia')) AS t(tag)
  WHERE r.user_id = v_user_id AND r.date::date = v_base - 2 ON CONFLICT DO NOTHING;

  INSERT INTO run_tags (run_id, tag)
  SELECT r.id, t.tag FROM runs r
  CROSS JOIN (VALUES ('recuperação'),('consistente')) AS t(tag)
  WHERE r.user_id = v_user_id AND r.date::date = v_base ON CONFLICT DO NOTHING;

  -- ──────────────────────────────────────────────────────────
  -- METAS
  -- ──────────────────────────────────────────────────────────
  v_goal_meia := uuid_generate_v4();
  v_goal_10k  := uuid_generate_v4();

  INSERT INTO goals (id, user_id, race_name, distance_km, race_date,
    target_time_seconds, target_pace_seconds_per_km,
    conservative_time_seconds, likely_time_seconds, optimistic_time_seconds,
    status, strategy, notes)
  VALUES
  (v_goal_meia, v_user_id,
   'Meia Maratona', 21.1, (v_base + 13)::text,
   6996, 333, 7023, 6796, 6646, 'active',
   'Estratégia equilibrada: 0–5km a 5:25–5:28, 5–10km a 5:20–5:25, 10–15km a 5:15–5:22, 15–20km a 5:10–5:20, 20–21.1km a 4:55–5:10 se estiver inteiro.',
   'Meta principal do ciclo. Sub-2h conservador. Alvo real entre 1h52–1h55. Calor é fator importante.'),
  (v_goal_10k, v_user_id,
   '10 km Sub-50', 10.0, NULL,
   2950, 295, 3050, 2950, 2850, 'upcoming',
   'km 1–2: 5:00–5:05. km 3–5: 4:55–5:00. km 6–8: 4:50–4:58. km 9: 4:45–4:55. km 10: tudo que sobrar.',
   'Sub-50 é realista. O que faltou foi contexto, não capacidade.');

  -- ──────────────────────────────────────────────────────────
  -- ESTRATÉGIAS DE PROVA
  -- ──────────────────────────────────────────────────────────
  INSERT INTO race_strategies (user_id, goal_id, title, scenario,
    target_time_seconds, target_pace_seconds_per_km,
    strategy_text, hydration_plan, gel_plan, splits_json)
  VALUES
  (v_user_id, v_goal_meia, 'Meia Maratona — Conservadora', 'conservative',
   7080, 334,
   'Alvo 1:56–1:58, pace médio 5:30–5:35/km. Boa se estiver calor, vento ou perna pesada. Não forçar nos primeiros 10 km.',
   'Água em todos os postos. Beber antes de ter sede. Boné se sol.',
   'Gel 1: 30–35 min. Gel 2: 1h05–1h10. Gel 3: 1h35–1h40 se sentir necessidade.',
   '{"splits":[{"range":"0–5km","pace":"5:35–5:40"},{"range":"5–10km","pace":"5:30–5:35"},{"range":"10–15km","pace":"5:25–5:30"},{"range":"15–20km","pace":"5:20–5:30"},{"range":"20–21.1km","pace":"5:05–5:20","note":"se sobrar"}]}'::jsonb),

  (v_user_id, v_goal_meia, 'Meia Maratona — Equilibrada', 'balanced',
   6840, 324,
   'Alvo 1:52–1:54, pace médio 5:18–5:24/km. Estratégia mais racional. Aguardar km 10 para soltar.',
   'Água em todos os postos possíveis. Isotônico se disponível.',
   'Gel 1: 30–35 min. Gel 2: 1h05–1h10. Gel 3: 1h35–1h40 (recomendado no calor/umidade).',
   '{"splits":[{"range":"0–5km","pace":"5:25–5:28"},{"range":"5–10km","pace":"5:20–5:25"},{"range":"10–15km","pace":"5:15–5:22"},{"range":"15–20km","pace":"5:10–5:20"},{"range":"20–21.1km","pace":"4:55–5:10","note":"se estiver inteiro"}]}'::jsonb),

  (v_user_id, v_goal_meia, 'Meia Maratona — Agressiva', 'aggressive',
   6540, 311,
   'Alvo sub-1:50, pace ~5:12/km. Só se: clima bom, descansado, FC controlada nos primeiros 5 km e pernas leves.',
   'Água em todos os postos. Boné obrigatório.',
   'Gel 1: 25–30 min. Gel 2: 1h00–1h05. Gel 3: 1h30–1h35.',
   '{"splits":[{"range":"0–5km","pace":"5:18–5:22"},{"range":"5–10km","pace":"5:12–5:18"},{"range":"10–15km","pace":"5:08–5:15"},{"range":"15–20km","pace":"5:00–5:10"},{"range":"20–21.1km","pace":"<5:00","note":"havendo reserva"}]}'::jsonb),

  (v_user_id, v_goal_10k, '10 km Sub-50 — Estratégia', 'balanced',
   2950, 295,
   'Controlar adrenalina no início. Entrar no ritmo gradualmente. Final forte nos últimos 2 km.',
   'Água no km 5 se disponível.',
   'Sem gel para 10 km.',
   '{"splits":[{"range":"km 1–2","pace":"5:00–5:05","note":"Controlar adrenalina"},{"range":"km 3–5","pace":"4:55–5:00","note":"Entrar no ritmo"},{"range":"km 6–8","pace":"4:50–4:58","note":"Sustentar pressão"},{"range":"km 9","pace":"4:45–4:55","note":"Buscar tempo"},{"range":"km 10","pace":"4:35–4:50","note":"Tudo que sobrar"}]}'::jsonb);

  -- ──────────────────────────────────────────────────────────
  -- PROJEÇÕES
  -- ──────────────────────────────────────────────────────────
  INSERT INTO projections (user_id, distance_km, scenario,
    projected_time_seconds, projected_pace_seconds_per_km, confidence, assumptions)
  VALUES
  (v_user_id,  5.0,'conservative',1475,295,'Alta',       'Base nos tiros. Pace 4:55/km.'),
  (v_user_id,  5.0,'likely',      1425,285,'Média',      'Com prova e bom pacing. Pace 4:45/km.'),
  (v_user_id,  5.0,'optimistic',  1375,275,'Média-baixa','Exigiria esforço máximo. Pace 4:35/km.'),
  (v_user_id, 10.0,'conservative',3050,305,'Alta',       'Prova de 10 km com pausas. Pace 5:05/km.'),
  (v_user_id, 10.0,'likely',      2950,295,'Alta',       'Sub-50 é realista. Pace 4:55/km.'),
  (v_user_id, 10.0,'optimistic',  2850,285,'Média',      'Dia perfeito. Pace 4:45/km.'),
  (v_user_id, 15.0,'conservative',4875,325,'Alta',       'Você já fez 5:21/km em prova. Pace 5:25/km.'),
  (v_user_id, 15.0,'likely',      4770,318,'Média',      'Com prova bem encaixada. Pace 5:18/km.'),
  (v_user_id, 15.0,'optimistic',  4650,310,'Média-baixa','Muito forte. Pace 5:10/km.'),
  (v_user_id, 21.1,'conservative',6963,330,'Alta',       'Sustentável com segurança. Pace 5:30/km.'),
  (v_user_id, 21.1,'likely',      6796,322,'Média-alta', 'Base no 15k e longões. Pace 5:22/km.'),
  (v_user_id, 21.1,'optimistic',  6646,315,'Média',      'Depende de clima/pacing. Pace 5:15/km.'),
  (v_user_id, 42.2,'conservative',15825,375,'Baixa',     'Ainda sem base específica. Pace 6:15/km.'),
  (v_user_id, 42.2,'likely',      15192,360,'Baixa',     'Exigiria ciclo próprio. Pace 6:00/km.'),
  (v_user_id, 42.2,'optimistic',  14559,345,'Baixa',     'Não é foco atual. Pace 5:45/km.');

  -- ──────────────────────────────────────────────────────────
  -- RELATÓRIO DO TREINADOR
  -- ──────────────────────────────────────────────────────────
  INSERT INTO coach_reports (user_id, title, report_date, period_type,
    period_start, period_end, summary, strengths, weaknesses,
    projections, recommendations, full_report)
  VALUES (
    v_user_id,
    'Relatório Consolidado — Ciclo de 4 meses',
    v_base, 'cycle', v_base - 118, v_base,

    'Você saiu de um corredor iniciante que corria forte sem muito controle para um corredor já preparado para performar bem em 10 km, 15 km e meia maratona. Nível atual: intermediário forte em construção, com endurance claramente consolidada. Projeção realista para a Meia: entre 1h52 e 1h56, com cenário agressivo de sub-1h50 se clima, pacing, hidratação e descanso encaixarem.',

    '1. Evolução rápida de volume: 5–6 km para quase 18 km em poucos meses.
2. Capacidade de terminar forte: maior diferencial. Km 15 de prova perto de 5:00/km; km 18 a 5:17/km.
3. Boa resposta a provas: melhora em ambiente competitivo.
4. Mentalidade competitiva: força quando bem direcionada.
5. Boa recuperação recente: 8 km a 5:35/km com FC 166, dois dias pós-longão.
6. Adaptação a gel e nutrição: já testou timing e hidratação.',

    '1. Tendência a começar forte demais: risco de quebra em provas longas.
2. Calor: maior fator externo negativo.
3. FC alta em longões: muitos viraram treino de performance.
4. Risco de excesso de intensidade: transforma treino leve em moderado/forte.
5. Fortalecimento: não apareceu no histórico. Panturrilha e joelho em risco.
6. Sono e horário: acordar tarde e correr no sol piora o treino.',

    '5 km: 24:35–22:55. 10 km: 50:50–47:30. 15 km: 1:21:15–1:17:30. Meia: 1:56:03–1:50:46. Maratona: 4:23:45–4:02:39 (sem base específica).',

    'Volume semanal até a meia: semana atual 28–35 km → próxima 22–28 km → semana da prova 12–18 km + prova. Fortalecimento 2x/semana: panturrilha, agachamento unilateral, lunge, glúteo, prancha, mobilidade. Regra de calor: reduzir pace em 10–20 s/km. Beber antes de ter sede.',

    '# Relatório Consolidado do Treinador IA

## Visão Geral

Seu ciclo começou há cerca de 4 meses. Você tinha muita vontade de se desafiar, frequentemente transformava treinos leves em moderados/fortes. A virada começou com os primeiros longões expressivos.

O maior salto de performance veio nas últimas semanas: 16 km a 5:30/km com placa e géis; 15,47 km a 5:21/km em prova; 17,92 km a 5:57/km com chuva e subidas, sentindo que poderia ter ido até 21 km.

## Resumo Executivo

Você saiu de um corredor iniciante que corria forte sem muito controle para um corredor já preparado para performar bem em 10 km, 15 km e meia maratona.

- Nível atual: intermediário forte em construção, endurance claramente consolidada
- Principal força: capacidade de sustentar esforço e terminar forte
- Principal risco: excesso de intensidade, calor e largada rápida demais
- Projeção meia maratona: 1h52–1h56 (agressivo: sub-1h50)
- O jogo agora é: qual tempo você consegue fazer se correr com inteligência.'
  );

  RAISE NOTICE 'Seed concluído. Corridas: 30, Ciclos: 5, Metas: 2, Estratégias: 4, Projeções: 15, Relatório: 1';
END $$;
