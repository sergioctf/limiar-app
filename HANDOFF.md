# LIMIAR — Documento de Handoff Completo

> **Para:** a próxima IA (ou pessoa) que vai revisar o produto e levá-lo ao próximo estágio.
> **De:** Claude (Claude Code), que construiu a maior parte do app junto com Sérgio entre julho e setembro de 2026.
> **Data de referência:** 15/09/2026.
> **Idioma:** o produto, os usuários e o dono falam português do Brasil. Os comentários de código estão em inglês; a UI e as mensagens, em português.

---

## Como ler este documento

- **Fatos** estão escritos no indicativo e apontam para arquivos. Se eu não verifiquei algo, está marcado com **(não verificado)**.
- **Opiniões minhas** aparecem só na seção 21 e em campos explicitamente rotulados ("AINDA FAZ SENTIDO?", "o que eu melhoraria").
- **Ideias** estão separadas por origem na seção 15: de Sérgio, minhas, decisões tomadas, hipóteses.
- Caminhos relativos partem de `limiar-app/` (a pasta do app dentro de `C:\Users\sctca\OneDrive\Documentos\Limiar\`).

---

## ⚠️ LEIA ANTES DE TUDO — 6 alertas que mudam o que você faz primeiro

1. **Três meses de trabalho não estão no git.** O repositório (`origin` = `github.com/sergioctf/limiar-app`, branch `main`) tem 62 commits, o último de **16/06/2026**. Hoje há **102 arquivos modificados, 186 novos e 11 apagados sem commit**. Tudo que foi feito de julho a setembro (motor determinístico de treino, musculação, conselheiro, recordes, Saúde nova, Garmin, notificações, testes…) existe **apenas** na pasta local do OneDrive e nos deploys da Vercel. Uma exclusão acidental ou conflito do OneDrive apaga o produto. **Primeira ação recomendada: commit + push.**
2. **O deploy é feito da máquina local**, com `npx vercel deploy --prod` na pasta. Não há CI, não há deploy a partir do GitHub. O que está em produção é o que estava no disco de Sérgio no momento do último deploy.
3. **O banco não é reconstruível a partir do repositório.** As tabelas `activities`, `performance_tests` e `races` são usadas intensamente pelo código, mas **não existe DDL delas em nenhum `.sql`**. Foram criadas por rotas `/api/admin/*` que já foram apagadas. Além disso, as migrations 002–027 foram aplicadas **à mão** no SQL Editor do Supabase (não existe runner nem `DATABASE_URL`), e há infraestrutura que vive só no Supabase (job `pg_cron` e segredo no Vault — ver seção 18).
4. **Possível vazamento de dados entre usuários (crítico, a confirmar no banco).** A migration `002_social.sql` cria a policy `"Authenticated can search profiles"` com `for select using (auth.role() = 'authenticated')`. RLS filtra linhas, não colunas: qualquer usuário logado pode, com a anon key, ler **todas as colunas de todos os perfis** — e-mail, data de nascimento, altura, sexo e o `wellness_token`, que autentica o endpoint público `/api/ingest/wellness`, permitindo gravar dados de saúde no nome de outra pessoa. Não verifiquei se a policy ainda existe em produção. Verifique com `select * from pg_policies where tablename = 'profiles';`. No mesmo nível de risco: **o webhook do Strava aceita eventos forjados** e um POST com `aspect_type: "delete"` apaga (soft delete) a corrida de qualquer usuário pelo ID da atividade (dívida A9).
5. **O app "falha certo".** Os motores de treino e saúde raramente dão erro; quando estão errados, prescrevem a coisa errada com cara de certeza. Quase todo bug sério encontrado foi desse tipo. Por isso existe uma suíte de ~1.536 testes de funções puras — **rode `npm test` antes de mexer em qualquer motor**.
6. **Há usuários reais.** São 7 contas por convite (Sérgio e amigos). O plano da semana é lido e seguido por pessoas. Regra de ouro que custou caro: **nunca reescrever uma semana que já começou** (ver ADR sobre congelamento de semana).

---

## Sumário

1. Visão do produto
2. Histórico do projeto
3. Arquitetura
4. Estrutura do repositório
5. Modelo de dados
6. Features existentes
7. Telas e navegação
8. Integrações
9. IA
10. Lógica de saúde e performance
11. Decisões importantes (ADR)
12. Dívida técnica
13. Bugs e limitações conhecidas
14. Features incompletas
15. Backlog / ideias discutidas
16. Design system
17. Segurança e privacidade
18. Infraestrutura e deploy
19. Testes
20. Estado atual do produto
21. O que eu faria a seguir (opinião)
22. Coisas que somente eu sei
23. Guia para a próxima IA

---

# 1. VISÃO DO PRODUTO

## 1.1 Objetivo

O Limiar é um **treinador de corrida e hub de performance pessoal**, em PWA mobile-first. Ele junta, num lugar só:

- o que o atleta **fez**: corridas e outros treinos vindos do Strava, com splits, frequência cardíaca e mapa;
- o que o atleta **deveria fazer**: um plano semanal calculado, calibrado por um teste de 3 km;
- **como o corpo está**: sono, HRV e frequência cardíaca de repouso do relógio, check-in manual e carga de treino;
- **com quem ele treina**: amigos, feed, ranking, recordes comparados.

A promessa, nas palavras que guiaram o trabalho: um treinador que **explica o porquê** de cada decisão, não uma planilha.

## 1.2 Problema que tentamos resolver

Na origem (maio/2026), Sérgio usava uma IA de conversa como "treinador virtual". Mandava prints do Strava e relatos, recebia análises em texto, e esse conhecimento se perdia em conversas soltas. O primeiro documento do projeto (`PROJETO_LIMIAR.md`, gerado pelo Cowork em 26/05/2026) descreve exatamente isso: centralizar dados objetivos (Strava) e qualitativos (treinador de IA).

Com o tempo, o problema real ficou mais específico:

- **Planilhas e apps genéricos não se adaptam.** Não sabem que você correu 119% da semana, que parou 10 dias, que dormiu mal ou que prefere leve → tiro → longão.
- **IA que prescreve treino inventa.** A primeira versão do plano era texto livre de LLM; gerava sessões vagas, inconsistentes e às vezes malformadas (um dia malformado chegou a derrubar a tela do Treinador). Daí a decisão central: **números calculados por motor determinístico, IA só para prosa**.
- **Recuperação desconectada do treino.** Relógios mostram prontidão, mas não mexem no plano. O Limiar tenta ligar as duas pontas: a recuperação muda a decisão do dia.

## 1.3 Público-alvo

- **Hoje:** Sérgio (corrida amadora, ~36 anos, VDOT ~39,5, ~19 km/semana planejados, capacidade comprovada ~30 km/semana, maior corrida 21,4 km, faz musculação 3–4×/semana, usa iPhone, Forerunner 265 e a pulseira Garmin CIRQA) e mais seis amigos convidados.
- **Perfil implícito do produto:** corredor amador brasileiro, intermediário, que treina 3–5×/semana, mistura corrida com academia, usa Strava e muitas vezes um relógio Garmin, e quer orientação de verdade sem pagar assessoria.
- **Não é (ainda):** produto para treinador gerenciar atletas, elite, triatleta sério ou mercado internacional.

## 1.4 Visão de longo prazo

O que foi dito ou decidido ao longo das conversas (ver seção 15 para a origem de cada ideia):

- "App de **performance completa do corpo**: treino, recuperação, composição corporal e nutrição conversando entre si" (`ROADMAP.md`, jun/2026).
- UX no nível do **Whoop**: "clean e cheio de features… ninguém entra no app e fala UAU, tem que falar UAU". Profissional, **animado**, completo (Sérgio, ago–set/2026).
- **Usar os dados dos usuários para adaptar tudo** (Sérgio): o plano, a tela inicial, a notificação, a Saúde.
- Duas versões coerentes: **com relógio** e **sem relógio** (Sérgio, 14/09/2026).
- Eventualmente outros usuários além do círculo de amigos. O `ROADMAP.md` lista monetização (Limiar Pro) e B2B (assessorias) como hipóteses, **não como decisões**.

## 1.5 Princípios que orientaram o desenvolvimento

Estes princípios aparecem repetidamente no código (em comentários longos) e nas conversas. Uma IA nova deve tratá-los como **restrições**, não como sugestões:

1. **Motor determinístico calcula, IA só comenta.** Distâncias, ritmos, FC, volume, recordes, prontidão e conselhos são funções puras e testadas. O LLM escreve notas, análises e dicas, e traduz pedidos em edições estruturadas. Ele nunca decide um número que o atleta vai executar.
2. **Honestidade sobre a fonte de cada número.** Todo número estimado diz que é estimado ("Só carga de treino", "Relógio calibrando", "kcal · relógio", "pela carga de treino — sem dados do relógio hoje"). Um número estimado mostrado igual a um medido "mente com aparência de verdade".
3. **O atleta decide; o app propõe.** Nenhuma mudança de plano é automática: sugestões do conselheiro, troca de treino por recuperação e ajuste proativo exigem toque, e o que é reversível tem "Desfazer".
4. **Nunca reescrever o que o atleta já está vivendo.** Uma semana iniciada é congelada contra regeneração.
5. **Progredir com calma, a não ser que haja prova marcada; variedade de estímulo antes de mais volume** (política de Sérgio).
6. **Estrutura semanal de Sérgio é restrição do atleta:** três corridas na ordem leve → tiro → longão.
7. **Teste primeiro, correção depois.** Todo bug de motor ganha um teste que o reproduz antes de ser corrigido, com comentário dizendo qual bug real originou a asserção.
8. **Calendário do atleta, não do servidor.** O servidor (Vercel) roda em UTC; o atleta vive em BRT (UTC−3). Uma classe inteira de bugs veio de `toISOString()` depois das 21h. Use os helpers de `src/lib/week.ts` e `src/lib/plan-notify.ts`.
9. **Degradar em vez de quebrar.** Como migrations são manuais, o código tolera tabela/coluna ausente (lista vazia, feature inerte, mensagem dizendo "falta a migration X").
10. **Comentários explicam o porquê, com a história.** Os blocos longos acima de funções não são ruído: guardam o bug ou a conversa que motivou a regra. **Não apague asserções ou comentários "que parecem arbitrários"** sem ler o motivo.

---

# 2. HISTÓRICO DO PROJETO

As datas de maio–junho vêm do `git log`. De julho em diante não há commits; as datas vêm de comentários no código, das memórias da sessão e do que Sérgio disse, e várias são **aproximadas**.

## 2.1 Como começamos (26–27/05/2026)

- O projeto nasceu no **Cowork (Claude)**, que gerou `PROJETO_LIMIAR.md` e um scaffold v1 com 44 arquivos. Depois houve handoff para o Claude Code.
- **v1:** Next.js 14 (App Router) + Supabase + Tailwind + Recharts, com foco em dashboard pessoal:
  - histórico de corridas com importação manual do Strava;
  - metas, projeções e estratégias de prova;
  - relatórios do "treinador" colados como texto;
  - seed com 29 corridas de jan–mai/2024 extraídas de `BACKUP_PRE_JUNE_26.md` (o relatório do treinador de IA externo).
- **Decisões originais** (tabela no fim de `PROJETO_LIMIAR.md`):
  - app web em vez de Telegram;
  - dark + laranja;
  - nome "Limiar" (limiar aeróbico);
  - login por e-mail e senha, sem OAuth social;
  - seed manual via SQL Editor;
  - webhook do Strava deixado para a v2.

## 2.2 Fase A — "Dashboard + IA analista" (28/05 → 16/06/2026, ainda em git)

| Data | Marco |
|---|---|
| 28/05 | Webhook do Strava (sync automático); análise de corrida por IA com GPT-4o-mini, **trocada no mesmo dia por Groq (Llama 3.3 70B, grátis)**, mandando o histórico inteiro como contexto |
| 28/05–02/06 | Plano semanal por IA (texto → JSON estruturado interativo), chat para ajustar o plano |
| 02/06 | CTL/ATL/TSB, evolução de VDOT, sequência de dias correndo |
| 10–11/06 | Conquistas; comparação histórica; push notifications com crons; PWA; memória do treinador (`athlete_notes`); segurança das rotas admin; metas inteligentes; alerta de overtraining; recap semanal; replay de rota GPS; relatório mensal em PDF; social (amigos, ranking, feed com kudos, desafio semanal); onboarding animado; suporte offline |
| 12/06 | Adesão ao plano; eficiência aeróbica; coach proativo (replanejar a semana); macro-plano periodizado; roadmap com 40+ ideias |
| 14/06 | Treino estruturado + export `.FIT` |
| 15/06 | Streams do Strava (splits reais, deriva cardíaca, best efforts, mapas); **Fase 2 Saúde**: check-in, composição corporal, nutrição, Limiar Score; ingestão de wellness; scaffold nativo com Capacitor; atalho do iOS |
| 16/06 | Gate de conexão da Saúde, suplementos, sugestão de ajuste por prontidão (pop-up); **último commit** |

Nessa fase a IA **prescrevia** o plano. A maioria das features foi feita rápido e muitas foram refeitas depois.

## 2.3 Fase B — "Motor determinístico e treinador de verdade" (jul → meados de ago/2026, sem commits)

Reconstruído a partir do código e das memórias:

- **Motor determinístico de treino** (`src/lib/workout-builder.ts`, `TRAINING_SCIENCE.md`) substitui o plano gerado por IA. Usa VDOT de Daniels, zonas de Friel e tetos de volume. A IA passa a escrever só a nota da semana.
- **Preferências de semana** (dias de corrida e de musculação, dia do longão, sessões de qualidade, pisos de distância) e **multiesporte**: natação, ciclismo e esportes secundários (`sports.ts`, `cardio-builder.ts`, `sport-metrics.ts`).
- **30/07/2026:** Sérgio exige a estrutura leve → tiro → longão.
- **31/07/2026:** nasce a suíte de testes (`tests/`), depois de uma série de bugs silenciosos (tabela em `tests/README.md`).
- **Teste de 3 km como calibração** (`test-status.ts`): o que depende de ritmo/FC fica travado sem teste; o conselheiro também.
- **Musculação completa:**
  - biblioteca curada `exercises.ts`;
  - catálogo de 277 exercícios com imagens (`exercise-catalog.ts`, gerado de free-exercise-db);
  - `strength-builder.ts`, `strength-cycle.ts` (blocos de 4 semanas, RIR 3→2→1 + deload);
  - logger de séries, progressão dupla, substituição de exercício, rebalanceamento de split.
- **Conselheiro** (`advisor.ts`): observa o plano × execução e propõe patches aplicáveis com um toque.
- **Execução prevista × realizada km a km** (`workout-execution.ts`).
- **Tênis** (`shoes.ts`): quilometragem, desgaste, qual tênis para qual sessão.
- **Convites no banco** (`invites.ts`, migration 015): o código de acesso saiu do bundle do cliente.
- **Identidade** (nome, sobrenome, username único), **onboarding** com cenas feitas dos componentes reais, tema claro/escuro/sistema.
- **Social mais fundo:** sugestões de amigos com motivo calculado, silenciar amigo, notificação de treino de amigo (1 por amigo por dia), comparação de conquistas, perfil do amigo.
- **Frescor do plano** (`plan-freshness.ts`): o plano carrega uma "impressão digital" do que o gerou e avisa quando ficou desatualizado.
- **Integração Whoop** (OAuth, sync de recuperação/HRV/sono). **Nunca foi ativada:** faltam credenciais e Sérgio não tem Whoop.
- **Troca do modelo Groq:** `llama-3.3-70b-versatile` foi aposentado em **16/08/2026** e substituído por `openai/gpt-oss-120b` (ver seção 9).

## 2.4 Fase C — "Precisão e política de progressão" (fim de ago → início de set/2026)

Esta fase está documentada em detalhe no resumo da nossa sessão:

1. **Tempo em movimento × tempo total** (`run-time.ts`): splits e previsto × executado usam o tempo em movimento; recordes usam o relógio de prova (tempo total).
2. **Best efforts estilo Strava** (`best-efforts.ts`): o 10 km mais rápido pode estar dentro de um 15 km. Houve várias iterações erradas (uma chegou a dar "1 km em 2:58") até a regra final, que usa o **tempo total e janela de dois ponteiros**. A versão final foi **verificada 74/74 contra o Strava, com diferença de até 1 s**.
3. **Recordes unificados** (`records.ts`): havia três definições diferentes de recorde em três telas. Hoje há uma só, com backfill do histórico inteiro de todos os usuários (`records-backfill.ts`, até 8 atividades por noite no cron).
4. **Recordes do amigo** no perfil de cada amigo, com comparação.
5. **"Plano congelado há 6 semanas":** o plano de Sérgio ficou idêntico por 6 semanas (6 km leve, 3×400 m, 9,5 km de longão, 19 km). As causas foram:
   - o ratchet de volume usava o **planejado** como piso;
   - o `weekIndex` nunca era passado ao motor, então a semana de recuperação nunca disparava;
   - não havia variedade de sessão.

   Correção: `mesocycle.ts` (bloco de 4 semanas com cardápio de sessões de qualidade), ratchet ancorado no **executado**, rampa calma sem prova e o recompensa por cumprir mais de 100%.
6. **Política de Sérgio:** "progredir com calma, a não ser que tenhamos provas marcadas… ter uma variedade de treinos… 10 tiros de 200 m… sermos criativos". E: cumprir 119% "deveria aumentar, mesmo que pouco, mesmo que só estímulo".
7. **Teste de 3 km agendado dentro do plano** na 1ª semana do bloco quando está vencido, em vez de só lembrete por push.
8. **Incidente grave (semana de 31/08):** um aumento de `PLAN_ENGINE_VERSION` fez o banner de "plano desatualizado" aparecer. Sérgio aceitou, e a regeneração **reescreveu a semana em andamento**: a rodagem virou "3JM" e o longão caiu para 8 km. Sérgio disse: *"não era para ter mudado uma semana no meio dela, isso não é aceitável"*. Houve restauração manual para 19 km (com backup antes) e foi criada a **trava de semana em andamento** (`regenerationTarget` em `mesocycle.ts`). Um bug derivado deixou o botão de atualizar sem nunca sumir e também foi corrigido.
9. **Auditoria completa do app** e deduplicação do inbox do conselheiro (`advisor-inbox.ts`, cooldown de 28 dias para achados dispensados).

## 2.5 Fase D — "Redesenho de UX estilo Whoop" (set/2026)

Houve mudanças de direção, e várias foram **rejeitadas por Sérgio**. Isso importa para não repetir os mesmos erros:

1. Missão: "deixar melhor, mais clean, mais como o app da Whoop… clean e cheio de features… usar os dados dos usuários para adaptar tudo". Escolhas de Sérgio: **"Reestruturar de verdade"** e **home = "O treino de hoje"**.
2. **1ª tentativa:** acordeões (`Disclosure`) em tudo. **Rejeitada:** "ficou muito estranho", perdeu as animações ("as coisas não estão se mexendo sozinhas"), gaveta de Calibração vazia, abas demais.
3. Pesquisa de UX (Instagram, Whoop): ações persistentes no topo com badge (amigos, notificações), camadas por tela em vez de acordeões, hierarquia tipográfica forte, paleta semântica de 3–4 cores, movimento que preserva contexto espacial.
4. **2ª tentativa:** dashboard só com navegação. **Rejeitada:** "ficou vazio… não tem os gráficos visuais… ninguém entra no app e fala UAU… tem que estar profissional, ANIMADO, COMPLETO, UAU!"
5. **Versão atual:** o dashboard voltou a ser rico e animado (anéis que se desenham, números que contam, entrada em cascata), com o `TodayCard` como herói. Primitivas novas em `src/components/ui/`.
6. Ajustes pedidos com prints:
   - "bom dia" muito pequeno;
   - não dava para saber o que é clicável;
   - anel precisava dizer que é de corrida;
   - gráfico quebrado no celular;
   - "dias treinados" errado (usava o tamanho da janela em vez da contagem);
   - textos do card de fitness ruins.
7. Ideias aprovadas por Sérgio ("1 - curti… 2 - gosto… 3 - gosto… 4 - gosto"):
   - anel centralizado com "fantasma" da semana passada e células de todos os esportes;
   - skeletons;
   - vibração (haptics);
   - **uma frase de "porquê" por sessão** (`session-why.ts`).
8. Pedido de treinos com aquecimento e desaquecimento, e de `.FIT` "por tempo/distância, estilo planilha, não trajeto" (ver seção 13).
9. **14/09:** "tire os emojis de corridas e kcal no dashboard". Foram removidos. Convém evitar emojis em geral.

## 2.6 Fase E — "Saúde, Garmin e recuperação integrada" (13 → 15/09/2026)

1. **13/09:** Sérgio ficou uma semana sem correr e perguntou se o app ia tratar como regressão. A simulação com dados reais mostrou que não (19 km mantidos), mas revelou **dois bugs de motor**, corrigidos e testados:
   - **toda 3ª semana do bloco saía 30% menor**, por causa de um deslocamento `weekIndex + 1` que fugia do corte da semana 4 e caía na semana 3;
   - **todas as semanas vazias eram ignoradas**, e um atleta que correu duas vezes num mês (uma delas 30 km) recebeu um plano de 32 km.

   Regra nova: só uma semana vazia é perdoada.
2. **13/09:** chegou a pulseira **Garmin CIRQA**. Sérgio pediu para conectar saúde, prontidão e calorias.
3. **14/09:** o **Garmin Connect Developer Program está fechado a apps novos** desde a primavera (no hemisfério norte) de 2026, sem lista de espera. Sérgio pediu para "pedir acesso" e **nada foi enviado**, porque o canal está fechado.
4. **Caminho escolhido:** Garmin → **intervals.icu** (parceiro antigo da Garmin) → Limiar, via chave de API pessoal. As calorias do dia vêm pelo **Atalho do iPhone** (Apple Saúde). Migration 026.
5. **Área de Saúde reescrita do zero** (`src/components/health/screen/`):
   - herói de recuperação que conversa com o treino do dia;
   - sinais vitais contra a média de 30 dias do próprio atleta;
   - gráfico de carga × recuperação, semana de sono e contribuintes do score;
   - energia (calorias), monitor do relógio, corpo e dispositivos.
6. Críticas de Sérgio: "isso vai atualizar sozinho? já está desatualizado… cadê os dados live?". Causas e correções:
   - o conselho mandava fazer a rodagem **já feita** → agora sabe que o treino do dia foi concluído;
   - sincronização a cada 20 min só na abertura → 5 min e ao voltar para o app;
   - sono de ontem sem etiqueta → etiqueta "ontem";
   - peso do perfil do Garmin (77 → 88 kg de um dia pro outro) não é mais usado sem confirmação.
7. **Brainstorm de integração** (itens numerados; ver seção 15). Sérgio aprovou o primeiro lote:
   - **1:** recuperação no card Hoje;
   - **2:** notificação da manhã disparada pelos dados;
   - **5:** trocar o treino com um toque;
   - versão sem relógio, com o check-in como centro.

   Implementados com `recovery-today.ts`, `session-swap.ts`, `morning-dispatch.ts`, migration 027 e job `pg_cron` no Supabase.
8. **14–15/09:** o sono da noite de 13→14 nunca chegou. A pulseira sincronizou **antes** de a conexão com o intervals.icu existir, e a Garmin não reenvia nem pedindo histórico. Na noite de 14→15 **funcionou** (6h16, nota 78, HRV 82). A notificação das 8h30 saiu antes do sono chegar e disse "a noite ainda não chegou". Sérgio decidiu **não** estender o prazo.

## 2.7 Decisões que abandonamos

| Abandonado | Substituído por | Por quê |
|---|---|---|
| Plano semanal gerado por LLM (`generateStructuredWeeklyPlan`) | `workout-builder.ts` + `weekly-plan.ts` | Treinos vagos e inconsistentes, JSON malformado derrubando a tela, sem auditabilidade. **Resíduo removido em 17/09:** o cron `weekly-report` passou a chamar `ensureWeeklyPlan` |
| Chat que devolvia o plano inteiro reescrito | Chat que traduz o pedido em **edições estruturadas** (`plan-edit.ts`) | O modelo dizia "atualizei o longão" e não mudava nada |
| GPT-4o-mini | Groq Llama 3.3 70B → `openai/gpt-oss-120b` | Custo zero; aposentadoria do Llama em 16/08/2026 |
| Check-in diário manual como base da prontidão | Dados do relógio; check-in voltou como **centro da versão sem relógio** | O `ROADMAP.md` diz "check-in removido" em jun; em set voltou reduzido às 3 perguntas que mudam o score |
| "Gate de conexão" da Saúde (`health_connected`) | A Saúde nova mostra tudo e escolhe o modo pelos dados | O gate escondia a tela; a flag ficou como resíduo |
| Recordes por média de atividades de distância parecida (±8%) | Janelas medidas dentro dos streams | Superestimava (9,2 km contava como 10 km) e subestimava (não via o 5 km dentro de um 15 km) |
| Records/best efforts com tempo em movimento | **Tempo total (relógio de prova)** | Divergia do Strava; pausa não pode "fabricar" recorde |
| Ratchet de volume com piso no **planejado** | Piso no **executado** | Congelou o plano de Sérgio por 6 semanas |
| Acordeões em todas as telas | Telas por camadas, com conteúdo visível e animado | Rejeitado por Sérgio |
| Dashboard só de navegação | Dashboard rico com herói "Hoje" | Rejeitado por Sérgio |
| Pedido de acesso à Garmin Health API | intervals.icu | Programa fechado a novos parceiros |
| Balança Xiaomi S400 via Web Bluetooth | Registro manual de peso | Protocolo proprietário/cifrado |
| Apple Watch via PWA | — | Não existe caminho público; só nativo (WorkoutKit) no futuro |
| Sugestão de "aliviar treino" criada às 05:30 por push | Troca de treino com um toque, com desfazer, a partir da recuperação do dia | Criada antes dos dados chegarem; cortava a sessão pela metade e não tinha volta |

## 2.8 Features que foram refeitas (e quantas vezes)

- **Plano semanal:** IA texto → IA JSON → motor determinístico → +mesociclo/variedade → +ratchet no executado → +trava de semana em andamento → +correção da semana 3 e das semanas vazias.
- **Recordes:** média por atividade → streams com tempo em movimento → streams com tempo total → fonte única + backfill.
- **Prontidão/Saúde:** check-in → Limiar Score (gauge) → readiness wearable-driven → gate de conexão → **tela nova completa** → integração com dashboard, notificação e troca.
- **Dashboard:** v1 com 26 blocos → acordeões → só navegação → herói "Hoje" rico → anel com fantasma e esportes → recuperação no card Hoje.
- **Chat do plano:** reescrita completa pela IA → edições estruturadas.
- **Notificação da manhã:** 05:30 fixa com prontidão vazia → disparo pelos dados com deduplicação.

## 2.9 Ideias discutidas e não implementadas

Estão todas na seção 15, com a origem de cada uma.

---

# 3. ARQUITETURA

## 3.1 Visão geral

```
            ┌────────────────────────── Vercel (Hobby) ──────────────────────────┐
 iPhone /   │  Next.js 14 App Router                                              │
 navegador ─┼─ Server Components (páginas) ── lê Supabase com sessão (RLS)         │
 (PWA)      │  Route Handlers /api/*  ─────── service role quando precisa         │
            │  Crons Vercel (1×/dia cada)                                          │
            └───────┬────────────┬───────────────┬────────────────┬───────────────┘
                    │            │               │                │
               Supabase     Strava API      intervals.icu      Groq (LLM)
            (Postgres+Auth   (OAuth +        (chave pessoal,    openai/gpt-oss-120b
             +RLS+Vault      webhook)        wellness Garmin)
             +pg_cron)            ▲
                    ▲             │                 Web Push (VAPID) → service worker
                    │        Garmin/relógio
      Supabase pg_cron ──(15 em 15 min, 05–09h45 BRT)──► /api/cron/morning
      Atalho do iPhone ──(token)──► /api/ingest/wellness  (calorias/sono da Apple Saúde)
```

## 3.2 Stack

| Camada | Tecnologia | Versão / observação |
|---|---|---|
| Framework | Next.js App Router + React 18 + TypeScript 5 | **`next@14.2.35`**, que tem 5 vulnerabilidades conhecidas cuja correção exige Next 16 (ver seção 12) |
| UI | Tailwind CSS 3.4 com tokens CSS (claro/escuro), `lucide-react@0.383` (sem alguns ícones novos, por exemplo `CalendarArrowDown`), `clsx` + `tailwind-merge` | — |
| Gráficos | Recharts 2.12 | — |
| Mapas | Leaflet 1.9 (tiles OSM) | — |
| Banco/Auth | Supabase: Postgres, Auth e-mail/senha, RLS, Vault, pg_cron, pg_net | Plano gratuito |
| Clientes Supabase | `@supabase/ssr@0.4` (sessão por cookie), `@supabase/supabase-js@2.43` (service role) | — |
| LLM | Groq, API compatível com OpenAI, via `fetch` | Sem SDK |
| Push | `web-push@3.6` (VAPID) + `public/sw.js` | — |
| Arquivo de treino | `@garmin/fitsdk@21.205` (Encoder) | — |
| Testes | Vitest 2.1 | Funções puras apenas |
| Nativo (scaffold) | Capacitor 8 (`capacitor.config.ts`, `native-shell/`) | Nunca compilado/publicado |
| Deploy | Vercel CLI (`npx vercel deploy --prod`) | Plano Hobby: crons 1×/dia |

## 3.3 Frontend

- **Páginas são Server Components** que leem o Supabase com a sessão do usuário (cliente `createClient()` de `src/lib/supabase/server.ts`, sujeito a RLS) e entregam props a um componente cliente `*Content`. Exemplos: `src/app/page.tsx` → `DashboardContent`; `src/app/health/page.tsx` → `HealthScreen`.
- **Casca:** `src/components/layout/AppShell.tsx` com `Sidebar.tsx` (desktop, 10 itens) e `MobileBottomNav.tsx` (celular: 4 fixos — Home, Corridas, Provas, Treinador — + "Mais" com Saúde, Calendário, Amigos, Metas, Gráficos, Configurações).
- **Interatividade:** componentes cliente com `fetch` para `/api/*` e `router.refresh()` para re-renderizar o Server Component. **Não há React Query/SWR/Zustand.** O estado mora no servidor.
- **Primitivas de design** (depois do redesenho, set/2026) em `src/components/ui/`: `Surface.tsx` (Card, Section, Row, RowGroup, Reveal), `Metric.tsx` (Metric, MetricGrid, Bar, Pill), `Ring.tsx` (anel animado + Sparkline), `Disclosure.tsx`, `PageHeader.tsx`, `Skeleton.tsx` e `tone.ts` (paleta semântica). Ver seção 16.
- **Animação:** CSS (`stagger-in`, `animate-slide-up`, `animate-fade-in` em `globals.css`/`tailwind.config.ts`), `CountUp.tsx`, anéis com `requestAnimationFrame`, `Confetti.tsx`. Respeitam `prefers-reduced-motion`.
- **Tema:** claro/escuro/sistema (`src/lib/theme.ts`, script inline no layout para não piscar).
- **PWA:** `public/manifest.json`, `public/sw.js` (push + cache de páginas/API com fallback offline), `src/app/offline/page.tsx`, `InstallPWAButton.tsx`. O plano da semana também fica em `localStorage` (`offline-store.ts`).
- **Haptics:** `src/lib/haptics.ts` (`navigator.vibrate`; não funciona no iOS Safari, e isso é esperado).

## 3.4 Backend

- **Route Handlers** em `src/app/api/**/route.ts` (~85 rotas). Padrão:
  1. `createClient()` + `auth.getUser()` para identificar o usuário;
  2. `createAdminClient()` (service role, **ignora RLS**) quando precisa ler/escrever tabelas sem policy, cruzar usuários (amigos) ou fazer upsert de sistema.

  **Consequência:** a autorização real de muitas rotas é o `.eq("user_id", user.id)` escrito no código, não o RLS.
- **Lógica de domínio** em `src/lib/*.ts` (~100 módulos, ~19.500 linhas). A regra da casa: **rotas orquestram, libs decidem**. As libs de motor são puras e testadas.
- **Middleware** (`src/middleware.ts` → `src/lib/supabase/middleware.ts`): renova a sessão e redireciona para `/auth` quem não está logado. Caminhos públicos: `/auth`, `/auth/callback`, `/api/auth`, `/api/strava/webhook`, `/api/admin`, `/api/cron`, `/api/icons`, `/api/ingest`, `/sw.js`, `/manifest.json`, `/offline`, e `/dev/*` somente fora de produção.
- **Runtime:** Node (serverless). `maxDuration` de 30–300 s conforme a rota.

## 3.5 Banco

- Supabase Postgres, com RLS ativo em quase tudo. Tabelas e decisões na seção 5.
- **Migrations manuais:** `supabase/schema.sql` (base de maio) + `supabase/migrations/002…034`, coladas no SQL Editor. **Não existe `001`**; `schema.sql` faz esse papel. Faltam DDLs de `activities`, `performance_tests`, `races` (ver alerta 3).
- **Fora do repositório, só no Supabase:**
  - **extensões:** `pg_cron`, `pg_net`;
  - **job:** `limiar-morning`;
  - **segredo no Vault:** `limiar_cron_secret`.

## 3.6 Autenticação

- **Supabase Auth, e-mail e senha.** Tela `src/app/auth/page.tsx` (login/cadastro), `src/app/auth/reset/page.tsx`, `src/app/auth/callback/route.ts`.
- **Cadastro por convite:** `src/lib/invites.ts` + `/api/auth/invite` + tabelas `invite_codes`/`invite_redemptions` (migration 015). O convite limita o **cadastro**, não o login. Fallback para `SIGNUP_ACCESS_CODE` (env) se a tabela não existir. Gerência em Configurações (`InviteManagerCard.tsx`, só admin).
- **Admin:** e-mails em `ADMIN_EMAILS` (`src/lib/admin.ts`). Rotas `/api/admin/invites` e `/api/admin/push-diagnose`.
- **Crons:** `CRON_SECRET` via `Authorization: Bearer` (a Vercel injeta automaticamente) ou `?secret=` (`src/lib/cron-auth.ts`). Admin: `ADMIN_SECRET`, com fallback para `CRON_SECRET`. Sem segredo configurado, só é liberado fora de produção.
- **Endpoint público com token por usuário:** `/api/ingest/wellness`, que valida `profiles.wellness_token` (Atalho do iPhone).
- **Identidade obrigatória:** `IdentityGate.tsx` + `src/lib/profile-identity.ts` (nome, sobrenome e username único, sem inventar sobrenome).

## 3.7 Storage

- **Não usamos Supabase Storage.** Não há uploads de arquivo.
- **Imagens de exercícios:** CDN jsDelivr do repositório `yuhonas/free-exercise-db` (`CATALOG_IMAGE_BASE` em `exercise-catalog.ts`).
- **Ícones do app:** gerados dinamicamente em `src/app/api/icons/[size]/route.tsx`, além de `public/limiar_icone_app.png`.
- **Dados brutos em colunas JSON:**
  - `runs.strava_raw_json`;
  - `run_streams.streams` (streams do Strava em cache);
  - `coach_reports.full_report` (planos em JSON serializado como texto);
  - `wellness_data.raw`.
- **No cliente:** `localStorage` (tema, plano offline, throttle de auto-sync do Strava) e cache do service worker.

## 3.8 APIs internas (agrupadas)

| Grupo | Rotas | Função |
|---|---|---|
| Strava | `/api/strava/{connect,callback,sync,disconnect,webhook}` | OAuth, sync manual/automático, eventos push |
| Corridas | `/api/runs/[id]`, `/api/runs/[id]/{analyze,execution,streams}` | CRUD, análise por IA, previsto × executado, streams/splits |
| Atividades | `/api/activities`, `/api/activities/[id]` | Musculação e outros esportes (manual ou Strava) |
| Treinador | `/api/coach/weekly-plan` (GET/POST), `…/weekly-plan/{chat,move,adjust,freshness}`, `/api/coach/{advisor,suggestion,today-swap,macro-plan,memory,chat-messages,full-analysis,split-proposal,sports,training-prefs,strength-prefs}` | Plano, conselheiro, troca do dia, preferências, análise completa |
| Teste | `/api/performance-tests`, `/api/performance-tests/[id]` | Teste de 3 km |
| Musculação | `/api/strength/{log,progress,swap}` | Log de séries, progressão, troca de exercício |
| Recordes | `/api/records`, `/api/records/backfill` | Recordes e backfill do histórico |
| Provas/metas | `/api/races`, `/api/races/[id]`, `/api/races/[id]/analysis`, `/api/goals`, `/api/goals/strategy` | Provas, análise pós-prova, estratégia |
| Saúde | `/api/health/{body,checkin,connection,diet-tip,nutrition-profile,supplements,wellness,wellness-status,wellness-token}`, `/api/ingest/wellness` | Corpo, check-in, nutrição, wellness |
| Integrações | `/api/integrations/intervals` (GET/POST/DELETE), `…/intervals/sync`, `/api/whoop/{authorize,callback,sync}` | Garmin via intervals.icu; Whoop |
| Social | `/api/friends`, `/api/friends/{feed,kudos,leaderboard,achievements,suggestions,mute}` | Amizades, feed, ranking |
| Push/notificação | `/api/push/{subscribe,test}`, `/api/notifications/prefs` | Inscrição e preferências |
| Perfil/onboarding | `/api/profile/identity`, `/api/onboarding/status`, `/api/auth/invite` | Identidade, onboarding, convite |
| Outros | `/api/shoes`, `/api/shoes/[id]`, `/api/workouts/export` (.FIT), `/api/icons/[size]` | Tênis, export, ícones |
| Admin | `/api/admin/invites`, `/api/admin/push-diagnose` | Admin por e-mail/segredo |
| Crons | `/api/cron/*` (ver 3.10) | Jobs |

Pastas vazias restantes (lixo): `src/app/api/coach-reports`, `src/app/api/projections`, `src/app/api/sync`, `src/auth`, `src/strava`, `src/hooks`.

## 3.9 Serviços (módulos de domínio centrais)

| Serviço | Arquivo(s) | Papel |
|---|---|---|
| Motor de treino | `workout-builder.ts`, `weekly-plan.ts`, `mesocycle.ts`, `session-why.ts`, `today.ts` | Monta a semana determinística |
| Fisiologia | `performance.ts`, `training-load.ts`, `load-explainer.ts`, `sport-metrics.ts` | VDOT, ritmos, zonas, TSS/CTL/ATL/TSB |
| Execução | `workout-execution.ts`, `run-streams.ts`, `run-time.ts`, `plan-adherence.ts` | Previsto × executado, splits, adesão |
| Recordes | `best-efforts.ts`, `records.ts`, `records-backfill.ts`, `historical-comparison.ts`, `achievements.ts`, `achievement-compare.ts` | Recordes e conquistas |
| Musculação | `strength-builder.ts`, `strength-cycle.ts`, `strength-prefs.ts`, `strength-progression.ts`, `exercises.ts`, `exercise-catalog.ts`, `exercise-substitute.ts`, `split-rebalance.ts`, `cardio-builder.ts` | Força periodizada |
| Conselheiro | `advisor.ts`, `advisor-inbox.ts`, `test-status.ts`, `patterns.ts`, `overtraining.ts` | Observa e propõe |
| Saúde | `readiness.ts`, `health-view.ts`, `recovery-today.ts`, `recovery-load.ts`, `session-swap.ts`, `nutrition.ts`, `wellness-upsert.ts` | Recuperação, vitais, energia, troca do dia |
| Planejamento longo | `macro-builder.ts`, `macro-plan.ts`, `race-strategy.ts`, `race-analysis.ts`, `smart-goals.ts`, `target-comparison.ts` | Macro-plano e provas |
| Notificações | `push.ts`, `plan-notify.ts`, `morning-dispatch.ts`, `morning-message.ts`, `friend-notify.ts`, `weekly-insights.ts`, `notification-prefs.ts` | Push |
| Integrações | `strava.ts`, `strava-enrich.ts`, `strava-subscription.ts`, `intervals.ts`, `intervals-sync.ts`, `whoop.ts`, `workout-fit.ts` | Serviços externos |
| IA | `ai.ts` | Todas as chamadas LLM |
| Social/identidade | `friend-suggestions.ts`, `profile-identity.ts`, `invites.ts`, `admin.ts` | Pessoas |
| Utilitários | `utils.ts`, `week.ts`, `sports.ts`, `shoes.ts`, `day-sessions.ts`, `plan-edit.ts`, `plan-freshness.ts`, `theme.ts`, `polyline.ts`, `offline-store.ts`, `onboarding-*.ts`, `monthly-report.ts`, `calorie-breakdown.ts`, `cycle-summary.ts`, `aerobic-efficiency.ts` | Diversos |

## 3.10 Deploy e jobs

### Crons da Vercel (`vercel.json`, todos em UTC, 1×/dia no plano Hobby)

| Rota | Quando (UTC → BRT) | O que faz |
|---|---|---|
| `/api/cron/weekly-plan` | seg 03:00 → dom 00:00 | `ensureWeeklyPlan` da semana atual e da próxima para quem correu nos últimos 60 dias |
| `/api/cron/notify-morning` | 08:30 → 05:30 | Lembretes de prova (D-7/D-1/D-0) + **1ª passada** da notificação da manhã |
| `/api/cron/strava-sync` | 09:30 → 06:30 | Garante a assinatura do webhook do Strava; recupera atividades dos últimos 3 dias; backfill de recordes (8 atividades/atleta) |
| `/api/cron/race-strategy` | 09:00 → 06:00 | Gera/atualiza estratégia de prova em D-14 e D-3 |
| `/api/cron/weekly-report` | seg 10:00 → 07:00 | Push avisando que a semana fechou (a devolutiva é determinística, na tela do Treinador); plano da semana pelo motor (`ensureWeeklyPlan`); detecção de padrões; adaptação do macro-plano |
| `/api/cron/wellness-sync` | 11:00 → 08:00 | Sincroniza intervals.icu de todos os conectados + **passada final** da notificação da manhã |
| `/api/cron/test-reminder` | seg 15:00 → 12:00 | Lembrete do teste de 3 km |
| `/api/cron/notify-evening` | 01:00 → 22:00 (dia anterior) | Prévia do treino de amanhã |
| `/api/cron/notify-advisor` | sáb 00:00 → sex 21:00 | Aviso de sugestões do conselheiro |

### Supabase pg_cron (criado em 14/09/2026)

- **Job:** `limiar-morning`, `*/15 8-12 * * *` UTC (05:00–09:45 BRT).
- **Ação:** `net.http_get` para `/api/cron/morning` com `Authorization: Bearer <segredo do Vault 'limiar_cron_secret'>`.
- **Comportamento da rota:** fora de 05:00–09:30 BRT não faz nada; a partir de 08:30 a passada é final.

A deduplicação de todas as passadas é a tabela `notification_log`.

## 3.11 Integrações (resumo; detalhes na seção 8)

| Serviço | Uso |
|---|---|
| Strava | Fonte de atividades |
| intervals.icu | Wellness do Garmin |
| Atalho iOS / Apple Saúde | Calorias e sono |
| Whoop | Pronto, inativo |
| Groq | LLM |
| Web Push | Notificações |
| Garmin FIT SDK | Export de treino |
| Leaflet/OSM | Mapas |
| free-exercise-db | Catálogo de exercícios |
| Capacitor | Scaffold, sem uso |

## 3.12 IA (resumo; detalhes na seção 9)

- **Um único provedor e modelo:** Groq, `openai/gpt-oss-120b` (`GROQ_MODEL` sobrescreve), `reasoning_effort: "low"`.
- **13 usos, todos em prosa ou tradução estruturada.** Nenhum número prescrito vem do modelo.

---

# 4. ESTRUTURA DO REPOSITÓRIO

```
Limiar/                               ← pasta no OneDrive (NÃO é repo git)
├── BACKUP_PRE_JUNE_26.md             ← relatório do treinador de IA externo (fonte do seed de 2024)
├── limiar_icone_app.png / limiar_logo_versao_completa.png
├── session-export-*.zip              ← export de sessão antiga (não verificado)
└── limiar-app/                       ← repo git (origin github.com/sergioctf/limiar-app)
    ├── src/
    │   ├── app/          páginas (19) + api (~85 rotas) + layout, erro, loading, not-found
    │   ├── components/   ~135 componentes em 20 pastas
    │   ├── lib/          ~100 módulos de domínio (o coração do app)
    │   ├── types/index.ts  todos os tipos compartilhados
    │   └── middleware.ts
    ├── supabase/         schema.sql, seed.sql, migrations/002–034
    ├── tests/            64 arquivos, ~10.700 linhas, fixtures.ts, README.md
    ├── public/           manifest.json, sw.js, ícones
    ├── scripts/import-exercises.mjs   gera src/lib/exercise-catalog.ts
    ├── native-shell/index.html        shell do Capacitor
    ├── TRAINING_SCIENCE.md            ← base científica do motor (ATUAL e importante)
    ├── PROJETO_LIMIAR.md              ← handoff original de maio (DESATUALIZADO, útil como história)
    ├── ROADMAP.md                     ← roadmap de junho (DESATUALIZADO)
    ├── README.md                      ← setup da v1 (DESATUALIZADO)
    ├── ADMIN_ROUTES_AUDIT.md          ← DESATUALIZADO (rotas citadas foram apagadas)
    ├── BUILD_NATIVE.md, PUSH_*.md     ← guias antigos (não reverificados)
    ├── HANDOFF.md                     ← este documento
    ├── vercel.json, next.config.js, tailwind.config.ts, vitest.config.ts, capacitor.config.ts
    └── _rich.mjs                      ← script solto na raiz (não verificado; provável lixo)
```

Tamanho: `src/` ~53.900 linhas TS/TSX; `tests/` ~10.700 linhas.

## 4.1 Mapa por área

Para cada área, na ordem: **função**, **depende de**, **pontos de entrada**, **onde mexer**.

### Motor de plano semanal
- **Função:** montar os 7 dias de treino (corrida, força, outros esportes) de forma determinística.
- **Depende de:** `performance.ts` (ritmos/LTHR), `mesocycle.ts`, `strength-*`, `sports.ts`, `test-status.ts`, `plan-freshness.ts`, `ai.ts` (só a nota).
- **Entradas:** `ensureWeeklyPlan()` em `src/lib/weekly-plan.ts`, chamada por `GET/POST /api/coach/weekly-plan`, pelo cron `weekly-plan`, pelo conselheiro e pelo aceite de patch.
- **Onde mexer:**
  - volume: `planWeeklyVolume`/`volumeWithRatchet`/`distributeWeeklyVolume` (`workout-builder.ts`);
  - tipo de sessão: `qualityForWeek`/`MENU` (`mesocycle.ts`);
  - sessões: `buildEasyRun`/`buildIntervalRun`/`buildLongRun`;
  - layout: `allocateRunSessions`/`buildWeekPlan`;
  - trava de semana: `regenerationTarget`;
  - frase do porquê: `session-why.ts`.
  - **Rode `npm test`.**

### Plano: edição e manutenção
- **Função:** editar o plano sem regenerar.
- **Entradas:** chat (`/api/coach/weekly-plan/chat` + `plan-edit.ts`), mover sessão (`/weekly-plan/move`, `MoveSessionControl.tsx`), troca do dia (`/api/coach/today-swap` + `session-swap.ts`), ajuste proativo por IA (`/weekly-plan/adjust`), frescor (`/weekly-plan/freshness`, `PlanFreshnessBanner.tsx`).

### Teste de 3 km e calibração
- **Função:** VDOT, LTHR, zonas, ritmos, previsões e o estado "calibrado".
- **Arquivos:** `performance.ts`, `test-status.ts`; UI `coach/TestForm.tsx`, `TestHistoryCard.tsx`, `ZonesCard.tsx`, `PacesCard.tsx`, `PredictionsCard.tsx`, `VdotEvolutionChart.tsx`, `dashboard/TestCalibrationCard.tsx`, `StaleTestWarning.tsx`.

### Conselheiro
- **Função:** achados sobre o treino e patches aplicáveis.
- **Entradas:** `GET/POST /api/coach/advisor` (gera, deduplica, aceita/dispensa), `AdvisorCard.tsx`, cron `notify-advisor`.
- **Onde mexer:** regras em `advisor.ts`; inbox em `advisor-inbox.ts`.

### Musculação
- **Entradas:** preferências (`StrengthPrefsCard.tsx`, `/api/coach/strength-prefs`); sessão no plano (`StrengthSessionView.tsx`); log (`StrengthLogger.tsx`, `/api/strength/log`); progresso (`StrengthProgressCard.tsx`); troca de exercício (`ExerciseSwap.tsx`, `/api/strength/swap`); rebalanceamento de split (`SplitRebalanceCard.tsx`, `/api/coach/split-proposal`).
- **Onde mexer:** `strength-builder.ts`, `strength-cycle.ts`, `exercises.ts` (curado); `exercise-catalog.ts` é **gerado — não edite à mão**.

### Strava e corridas
- **Entradas:** webhook (`/api/strava/webhook`), sync manual (`/api/strava/sync`), auto-sync ao abrir (`AutoStravaSync.tsx`), cron `strava-sync`, streams sob demanda (`/api/runs/[id]/streams`).
- **Onde mexer:** `strava.ts` (mapeamento `stravaActivityToRun`, filtro corrida × atividade), `strava-enrich.ts` (calorias da API de detalhe), `run-streams.ts`, `run-time.ts`, `best-efforts.ts`.

### Recordes e conquistas
- **Entradas:** `/api/records`, `/api/records/backfill`, `PersonalRecordsCard.tsx`, `records/PersonalRecords.tsx`, perfil do amigo.
- **Onde mexer:** `records.ts` é a **fonte única**; não crie outra regra de recorde.

### Saúde
- **Entradas:** `src/app/health/page.tsx` → `components/health/screen/HealthScreen.tsx`.
- **Dependências:** `recovery-load.ts` (carregador compartilhado), `health-view.ts`, `recovery-today.ts`, `nutrition.ts`.
- **Onde mexer:**
  - score: `readiness.ts`;
  - vitais/sono/histórico/conselho: `health-view.ts`;
  - "o dia de hoje" e troca: `recovery-today.ts`/`session-swap.ts`;
  - calorias: `energyForDay` em `nutrition.ts`.

### Wellness e dispositivos
- **Entradas:** `/api/integrations/intervals` e `…/sync`, `AutoWellnessSync.tsx` (dashboard e Saúde), cron `wellness-sync`, `/api/ingest/wellness` (Atalho), `/api/health/wellness` (ponte nativa), `/api/whoop/*`.
- **Onde mexer:** `intervals.ts`, `intervals-sync.ts`, `wellness-upsert.ts` (merge sem apagar), `whoop.ts`.

### Notificações
- **Entradas:** crons `notify-*`, `morning`, `wellness-sync`, `test-reminder`, `notify-advisor`; `friend-notify.ts` (chamado nos imports); `/api/push/subscribe`; `PushNotificationButton.tsx`; `NotificationPrefsCard.tsx`.
- **Onde mexer:** texto da manhã em `morning-message.ts`; quando mandar em `morning-dispatch.ts`; envio em `push.ts`.

### Social
- **Entradas:** `src/app/friends/page.tsx` (+ `[id]`, `conquistas`), `/api/friends/*`.
- **Onde mexer:** `friend-suggestions.ts`, `friend-notify.ts`, `achievement-compare.ts`, `components/friends/*`.

### Provas, metas e macro
- **Entradas:** `src/app/races`, `src/app/goals`, `MacroPlanCard.tsx`; crons `race-strategy`/`weekly-report`.
- **Onde mexer:** `race-strategy.ts`, `race-analysis.ts`, `macro-builder.ts` (determinístico), `smart-goals.ts`, `target-comparison.ts`.

### Onboarding e identidade
- **Arquivos:** `components/onboarding/*` (Gate, SetupWizard, Flow, Scene, Questions, Tour, SetupChecklist), `profile/IdentityGate.tsx`, `lib/onboarding-flow.ts` (sequência como dados), `lib/onboarding-scenes.ts` (atleta de exemplo coerente).

### Design system
- **Arquivos:** `components/ui/*`, `app/globals.css` (tokens), `tailwind.config.ts`, `lib/theme.ts`.

---

# 5. MODELO DE DADOS

## 5.1 Diagrama lógico (simplificado)

```
auth.users 1─1 profiles (username, sports[], training_prefs, strength_prefs, notification_prefs,
   │                     height/sex/birth/calorie_goal, wellness_token, health_connected)
   ├─1 strava_connections        ├─1 intervals_connections     ├─1 whoop_connections
   ├─* runs ─┬─1 run_streams     ├─* activities (força/outros esportes)
   │         ├─* run_best_efforts ├─* performance_tests (teste 3 km)
   │         ├─* run_tags         ├─* races
   │         ├─* kudos (sender)   ├─* goals ─* race_strategies
   │         └─? shoes (runs.shoe_id)
   ├─* coach_reports (planos semanais em JSON, análises, relatórios)
   ├─* coach_chat_messages, athlete_notes (memória do treinador)
   ├─* advisor_suggestions, plan_suggestions
   ├─* strength_logs, shoes, training_macro_plans
   ├─* wellness_data (1 por dia), health_checkins (1 por dia), body_measurements (1 por dia), supplements
   ├─* push_subscriptions, notification_log (1 por tipo por dia)
   ├─* friendships (requester/addressee), friend_mutes, friend_workout_notices
   └─* sync_logs
invite_codes 1─* invite_redemptions
(legado v1, praticamente sem uso: training_cycles, projections)
```

## 5.2 Tabelas

### Núcleo

**`profiles`** (`schema.sql` + migrations 002, 008, 010, 011, 013, 014, 016, 019, 022)
- `id` (= `auth.users.id`, criado por trigger `on_auth_user_created`), `email`, `name`, `created_at`.
- `username`: único, índice `lower(username)` (019).
- Nutrição: `height_cm`, `sex` (`M`/`F`), `birth_date`, `calorie_goal` (`maintain`/`cut`/`gain`).
- `wellness_token`: único; autentica o Atalho do iPhone.
- `health_connected`: boolean legado do "gate" antigo da Saúde; hoje só é escrito pela conexão com o intervals.icu e pela rota `/api/health/connection`.
- `sports text[]`: padrão `{corrida,musculacao}`.
- `training_prefs jsonb`: `TrainingPrefs` com `runDays`, `strengthDays`, `longRunDay`, `qualityPerWeek`, `minRunKm`, `minLongRunKm`, `runDaysConfirmed`, `otherDays`.
- `strength_prefs jsonb`: objetivo, experiência, equipamentos, músculos por dia, cardio.
- `notification_prefs jsonb`: `dailyWorkout`, `tomorrowWorkout`, `friendWorkouts`, `friendRequests`; só `false` desliga.
- **Não tem `updated_at`.** Um bug antigo tentava gravar esse campo.
- ⚠️ Policy de select aberta a qualquer autenticado (alerta 4).

**`runs`** (`schema.sql` + `shoe_id` em 020)
- Identificação: `strava_activity_id` (único, chave de deduplicação), `source` (`strava`/`manual`/`imported_ai`/`strava+ai`), `name`, `date` (**date local do atleta**), `type` (`easy`/`long_run`/`tempo`/`intervals`/`race`/`recovery`/`steady`/`progression`/`other`).
- Métricas: `distance_km`, `duration_seconds`, `moving_time_seconds`, `elapsed_time_seconds`, `avg_pace_seconds_per_km`, velocidades, `avg_hr`/`max_hr`, `elevation_gain_m`, `avg_cadence`, `calories`, `suffer_score`, `map_polyline`, `device_name`.
- Subjetivos (v1): `perceived_effort`, `hydration`, `gel_usage`, `notes`, `raw_text`, `relevance`, `workout_score`.
- Outros: `coach_feedback` (análise de IA), `strava_raw_json`, `deleted_at` (**soft delete, sempre filtre `is("deleted_at", null)`**).

**`activities`** (⚠️ **sem DDL no repo**)
- Treinos que não são corrida: musculação, HIIT, natação, bike, outros esportes, vindos do Strava ou lançados à mão.
- Campos (pelo tipo `Activity`): `strava_activity_id`, `name`, `sport_type` (string do Strava ou chave interna; classificada por `sports.ts#toSportKey`), `date`, `duration_seconds`, `distance_m`, `calories`, `avg_hr`, `elevation_gain_m`, `source` (`strava`/`manual`), `notes`, `exercises` (jsonb, log de academia manual), `strava_raw_json`, `deleted_at`.

**`performance_tests`** (⚠️ **sem DDL no repo**)
- `test_date`, `distance_km` (normalmente 3), `time_seconds`, `avg_hr`, `max_hr`, `notes`, `vdot`, `vo2max_estimate` (existe no banco, visto em produção), `created_at`.

**`races`** (⚠️ **sem DDL no repo**)
- `name`, `race_date`, `distance_km`, `time_seconds` (**null = prova futura**; preenchido = concluída), `avg_hr`, `notes`, `location`, `is_target_race`, `bib_number`, `weather`.

**`goals`** + **`race_strategies`** (`schema.sql`)
- Metas (`race_name`, `distance_km`, `race_date`, alvos e cenários, `status`).
- Estratégia gerada por IA por meta (`scenario`, textos, `splits_json`). Uma estratégia por meta, substituída a cada geração.

### Plano e treinador

**`coach_reports`** (`schema.sql`): tabela multiuso.
- `period_type = 'week'` + `period_start` (segunda-feira): **o plano semanal**, em `full_report` como **texto JSON** (`WeeklyPlanData`: `week_start`, `days[7]`, `ai_message`, `generated_at`, `fingerprint`). Cada dia (`WeeklyPlanDay`) tem `day`, `dayPt`, `type`, `sport`, `label`, `distance_km`/`duration_min`, `pace`, `description`, `structure` (blocos com passos, repetições, ritmo, FC, intensidade), `strength` (sessão prescrita), `swap` (registro de troca do dia) e `movedFrom`.
- `period_type = 'general'`: análise completa por IA.
- Também guarda resumos semanais do cron e debriefs de prova (`race-analysis.ts`).
- Relatórios antigos da v1 em texto também vivem aqui.

**`coach_chat_messages`**: histórico do chat do plano. **`athlete_notes`**: "memória" extraída do chat e de padrões (`category`: injury/preference/availability/goal/observation; `source`; `active`).

**`advisor_suggestions`** (018): achados do conselheiro.
- Campos: `finding_key`, `week_start`, `area`, `severity`, `title`, `evidence`, `proposal`, `rationale`, `narrative`, `action_label`, `patch` (jsonb), `status` (pending/accepted/dismissed).
- A unique `(user_id, finding_key, week_start)` **gerou duplicatas semana a semana**. A deduplicação real hoje é feita no código (`advisor-inbox.ts`).

**`plan_suggestions`** (012): `kind='readiness_adjust'`, `original_day`, `suggested_day`, `status`, unique `(user_id, date, kind)`. É o sistema antigo de "aliviar o treino", mantido para o inbox do Treinador e agora aplicado via `applySwap`.

**`training_macro_plans`** (004): `race_type`, `race_label`, `target_month`, `status`, `plan_json`.

**`strength_logs`** (017): uma linha por série, com `exercise_id`, `set_index`, `weight_kg`, `reps`, `rir`; unique por série.

**`shoes`** (020): `name`, `brand`, `category`, `initial_km`, `retired`, `notes`; `runs.shoe_id`.

### Streams e recordes

**`run_streams`** (005): `run_id` PK, `streams` jsonb (time, distance, heartrate, altitude, velocity, **moving**), `analysis` jsonb (splits, drift; versionado por `ANALYSIS_VERSION = 4` em `run-streams.ts`), `fetched_at`. Buscado sob demanda (1 chamada ao Strava por corrida).

**`run_best_efforts`** (024/025): `distance_m`, `seconds` (**tempo total**), `pace_sec_km`, `start_m`, `end_m`, `run_date`, `paused_sec`.
- **Sentinela:** corridas já processadas sem janela válida recebem linha com `distance_m = 0`, para o backfill não reprocessá-las.

### Saúde

**`wellness_data`** (009, 023, 026): **uma linha por usuário por dia**, com várias fontes preenchendo a mesma linha.
- Campos: `sleep_seconds`, `sleep_score`, `hrv_ms` (rMSSD no Garmin/Whoop), `hrv_status` (conceito Garmin, raramente preenchido), `resting_hr`, `stress_avg`, `body_battery`, `recovery_score` (Whoop), `active_kcal`, `resting_kcal` (Apple Saúde), `source` (último escritor), `raw` jsonb (campos guardados e não usados no score: `readiness`, `steps`, `spO2`, `weight`, `vo2max`, `sleepQuality`…).
- **Datas:** o sono é gravado no **dia em que se acorda** (convenção Garmin, mantida pelo intervals.icu).

**`health_checkins`** (006): uma por dia, com `sleep_hours`, `sleep_quality` (1–5), `energy` (1–5, **não usado no score**), `soreness` (1–5), `soreness_areas`, `rpe` (1–10), `notes`.

**`body_measurements`** (007): uma por dia, com `weight_kg` obrigatório e bioimpedância opcional.

**`supplements`** (011).

### Integrações e sistema

- **`strava_connections`:** tokens OAuth, `athlete_id`.
- **`intervals_connections`** (026): `athlete_id`, `api_key`, `athlete_name`, `last_sync_at`, `last_error`. **RLS ligado e sem nenhuma policy** (só service role).
- **`whoop_connections`** (023).
- **`push_subscriptions`:** `endpoint`, `p256dh_key`, `auth_key`, `user_agent`.
- **`notification_log`** (027): PK `(user_id, kind, date)`. Deduplica a notificação da manhã; o **insert antes do envio** é o "trinco".
- **`run_feedback`** (028): uma resposta por corrida — `run_id` (PK, FK para `runs`), `user_id`, `status` (`answered`/`skipped`), `effort` (1–5), `context` (`none`/`schedule`/`work`/`weather`/`fatigue`/`pain`/`other`), `note` (≤300), `planned` (snapshot do `WeeklyPlanDay` no momento da resposta), `updated_at`. RLS com três policies que exigem a propriedade da corrida.
- **`week_feedback`** (029): a leitura do atleta sobre uma semana que ficou abaixo do previsto — PK (`user_id`, `week_start`), `reason` (`life`/`body`/`too_much`), `note`, `created_at`. Só é escrita quando o treinador pergunta e a pessoa responde.
- **`friendships`** (002): `requester_id`, `addressee_id`, `status`.
- **`kudos`** (003); **`friend_mutes`**, **`friend_workout_notices`** (021, esta última é o trinco de 1 aviso por amigo por dia).
- **`invite_codes`**/**`invite_redemptions`** (015); **`sync_logs`**.
- **Legado sem uso real:** `training_cycles`, `projections` (seed v1); `admin_audit_logs` (criada por rota admin apagada; não verificado se existe).

## 5.3 Dados derivados (calculados em leitura, não armazenados)

| Derivado | Onde | Observação |
|---|---|---|
| VDOT, LTHR, zonas, ritmos, previsões | `performance.ts#computeMetrics` a partir do último `performance_tests` | `performance_tests.vdot` é gravado, mas zonas e ritmos são sempre recalculados |
| TSS/CTL/ATL/TSB | `training-load.ts` a partir de `runs` | **Só corridas contam**; musculação e outros esportes não entram na carga |
| Recuperação (Limiar Score) | `readiness.ts` via `recovery-today.ts` | Recalculado a cada abertura; histórico de 14 dias recalculado com as médias da época |
| Vitais contra a média de 30 dias | `health-view.ts` | Mediana dos 30 dias anteriores, **excluindo** o dia julgado |
| Recordes | `records.ts` (janelas + atividades completas) | — |
| Conquistas | `achievements.ts` | Função pura das corridas; nada gravado |
| Adesão, execução, eficiência aeróbica, resumo do ciclo, padrões | libs correspondentes | — |
| Energia do dia / meta calórica | `nutrition.ts#energyForDay` | — |
| Posição no mesociclo | `mesocycle.ts#cyclePosition` | Âncora = segunda-feira da 1ª corrida do atleta |

## 5.4 Fontes externas por tabela

| Tabela | Fonte |
|---|---|
| `runs`, `activities` | Strava (webhook, sync, cron) ou manual |
| `run_streams`, `run_best_efforts` | Streams do Strava |
| `wellness_data` | intervals.icu (`source='intervals'`), Atalho iOS (`ios_shortcut`), Whoop (`whoop`), ponte nativa (`healthconnect`/`healthkit`, nunca usada), manual |
| `coach_reports.ai_message`, `runs.coach_feedback`, `race_strategies`, `athlete_notes` | Groq |
| Catálogo de exercícios (em código) | free-exercise-db |

## 5.5 Decisões de modelagem (e as que me incomodam)

**Decisões conscientes:**
- **Planos como JSON em `coach_reports.full_report` (texto).**
  - *Por quê:* flexibilidade enquanto o formato mudava toda semana, e porque o plano é um documento lido inteiro.
  - *Custo:* sem integridade, sem consultas por dia, parse em todo lugar, versões antigas convivendo (`isLegacyPlanShape`, `normalizeWeeklyPlanDays`).
- **`wellness_data` com uma linha por dia e várias fontes** + upsert que **só grava o que foi medido** (`wellness-upsert.ts`). Isso evita que uma fonte apague a outra (bug real: as calorias das 22h apagavam a HRV das 8h).
- **Dados derivados não são armazenados** (recordes, conquistas, prontidão) para nunca ficarem velhos ou divergentes. Exceções deliberadas: `run_best_efforts` (caro de recalcular) e `run_streams` (limite do Strava).
- **Soft delete em `runs`/`activities`** (`deleted_at`).
- **Chave de API do intervals.icu sem policy** (nem o dono lê pelo cliente).
- **`notification_log` como trinco** de idempotência.

**Me incomoda:**
1. **Três tabelas centrais sem DDL no repo** (`activities`, `performance_tests`, `races`).
2. **`coach_reports` faz tudo** (planos, análises, resumos, debriefs, relatórios v1) e é diferenciada por `period_type`. Deveria haver `weekly_plans` com colunas.
3. **`profiles` concentra preferências em JSONB sem schema no banco.** A validação existe só no código (`normalizePrefs`, `normalizeStrengthPrefs`). Houve bug de duas fontes de verdade (`training_prefs.strengthDays` × `strength_prefs.days`), hoje sincronizadas em código.
4. **`wellness_data.source` é "último escritor"**, não por campo. Com várias fontes, não dá para saber de onde veio cada valor.
5. **`advisor_suggestions` com unique por semana** gera duplicatas; a deduplicação vive em código.
6. **`plan_suggestions` e `session-swap` coexistem** para o mesmo conceito.
7. **Carga de treino ignora musculação e outros esportes** (TSS só de corrida), mas o plano prescreve musculação pesada. A "forma" subestima a fadiga de quem faz academia.
8. **`runs.date` é `date` sem fuso**, convertido de `start_date_local` do Strava. Correto para o Brasil, mas nada garante isso para um usuário em outro fuso.
9. **Policy de leitura de `profiles`** (alerta 4).
10. **Campos mortos da v1** em `runs` (`hydration`, `gel_usage`, `relevance`, `workout_score`, `raw_text`) e tabelas `training_cycles`/`projections`.
11. **`health_checkins.energy`** é coletado por rotas antigas e não entra no score.

---

# 6. FEATURES EXISTENTES

**Legenda de estado:**
- ✅ em produção e usada;
- 🟡 em produção, com uso ou qualidade parcial;
- ⚪ existe no código, sem uso real.

Cada feature traz, nesta ordem: **objetivo, UX, implementação, arquivos, dados, regras, edge cases, limitações e melhorias**.

## 6.1 Plano semanal determinístico ✅ (coração do produto)

- **Objetivo:** dizer a cada atleta, para cada dia da semana, o que fazer e em que intensidade (ritmo e FC). O plano precisa ser justificável, progressivo e sem invenção.
- **UX:**
  - Dashboard: `TodayCard` (a sessão de hoje) e `WeeklyPlanSummaryCard` (7 bolinhas).
  - Treinador → "Zonas & Plano": `WeeklyPlanCard` com cada dia expansível, passos (`WorkoutStepsView`), frase de porquê (`session-why.ts`), mover sessão, exportar `.FIT` e chat.
  - `DefaultWeekNotice` quando o atleta não configurou os dias.
  - `PlanFreshnessBanner` quando o plano ficou desatualizado.
- **Implementação:** `ensureWeeklyPlan(db, userId, weekStart, {force, paces})` em `weekly-plan.ts`:
  1. Carrega o plano existente. Se é usável e não é forçado, devolve do cache.
  2. Aplica a trava `regenerationTarget`: semana em andamento não é reescrita nem com `force`.
  3. Busca o contexto em paralelo: próxima prova, VDOT, notas, corridas de 180 dias, preferências, teste mais recente, atividades.
  4. Calcula volume (`planWeeklyVolume` → `volumeWithRatchet`), fase (macro-plano ou prova), posição no mesociclo, teste devido e ritmos/LTHR.
  5. `buildWeekPlan(ctx)` monta os dias: `allocateRunSessions` + `distributeWeeklyVolume` + `buildEasyRun`/`buildIntervalRun`/`buildLongRun` + força (`strength-builder`) + outros esportes.
  6. `generateCoachNote` (IA) escreve só a mensagem da semana.
  7. Grava `coach_reports` com `fingerprint`.
- **Arquivos:** `src/lib/weekly-plan.ts`, `workout-builder.ts` (~1.450 linhas), `mesocycle.ts`, `session-why.ts`, `plan-freshness.ts`, `test-status.ts`, `strength-builder.ts`, `cardio-builder.ts`; `src/app/api/coach/weekly-plan/route.ts`; `src/app/api/cron/weekly-plan/route.ts`; `src/components/coach/WeeklyPlanCard.tsx`, `WorkoutStepsView.tsx`; `src/components/dashboard/TodayCard.tsx`, `WeeklyPlanSummaryCard.tsx`.
- **Dados:**
  - lê: `runs`, `activities`, `performance_tests`, `races`, `goals`, `training_macro_plans`, `athlete_notes`, `profiles.training_prefs`/`strength_prefs`/`sports`, `strength_logs`;
  - escreve: `coach_reports` (`period_type='week'`).
- **Regras de negócio (principais):**
  - Estrutura por atleta: dias de corrida, de força e de longão vêm das preferências. Padrão: corrida ter/qui/sáb, força seg/qua/sex.
  - Ordem de corrida: **leve → qualidade → longão**. A qualidade nunca fica na véspera do longão e a 1ª corrida da semana é leve.
  - No máximo `ceil(resto/2)` sessões de qualidade, deixando sempre ≥1 leve. Com 2 corridas/semana: leve + longão.
  - Volume: média das semanas recentes, rampa ×1,05 (×1,10 com prova) e teto +8 km; semana 4 do bloco a 70% (se "merecida"); taper a 55%. Fórmulas completas na seção 10.
  - Qualidade limitada a 8% do volume (I) e 5% (R), segundo Daniels.
  - Tipo de qualidade pelo cardápio do mesociclo: intervalos, limiar, repetições, intervalos densos, subidas, fartlek, progressivo, e strides na recuperação. Em pico e taper é sempre limiar.
  - Teste de 3 km substitui a qualidade na semana 1 do bloco quando o teste está vencido ou falta.
  - Longão entre 22% e 33–60% do volume (depende do nº de corridas), com piso de 45% do maior longão já feito e piso pedido pelo atleta se o histórico sustentar. Na fase build/peak com ≥10 km, os últimos 3 km são em ritmo de maratona.
  - Sem teste: o plano tem estrutura e volume, mas **sem ritmos nem FC** (não inventamos).
- **Edge cases tratados:**
  - semana vazia (só uma perdoada);
  - atleta voltando de pausa (capacidade comprovada);
  - atleta novo sem histórico (20 km padrão);
  - GPS espúrio (< 3 km/semana = ruído);
  - plano legado sem `sport`/`intensity` (regenerado);
  - domingo;
  - dias de força e corrida no mesmo dia (`day-sessions.ts`);
  - teste sem FC (ritmos sim, zonas não).
- **Limitações:**
  - Carga não inclui musculação.
  - O plano não reage à recuperação da semana (só à do dia, via troca).
  - A frase de porquê é gerada por regra, não por contexto rico.
  - Nenhum atleta com volume alto (>60 km) foi testado de verdade.
  - A âncora do mesociclo é a 1ª corrida da vida no app. Ciclos não "reiniciam" após pausa longa **(não verificado se isso é desejável)**.
- **Melhorias:**
  - volume da semana seguinte informado por HRV/sono (ideia 6 do brainstorm);
  - carga unificada com força;
  - tabela `weekly_plans` própria;
  - ~~remover o fallback de IA do cron `weekly-report`~~ **feito em 17/09**.

## 6.2 Recuperação do dia + troca de sessão ✅ (novo, 14/09)

- **Objetivo:** a recuperação tem de mudar o que acontece hoje, por decisão do atleta e com volta.
- **UX:**
  - `TodayCard` mostra um anel de recuperação ao lado da sessão, um aviso se a sessão foi trocada e um link "Fazer check-in" (`/health?checkin=1`) quando não há relógio.
  - Saúde → `RecoveryHero` com score, veredito, base ("Relógio" / "Check-in" / "Carga de treino" / "Calibrando: n de 7 noites"), conselho que cita a sessão e botões `SwapActions`: **"Trocar por leve"**, **"Passar para amanhã"**, **"Desfazer"**.
- **Implementação:**
  - `loadRecoveryInputs` (1 carregador compartilhado por dashboard, Saúde, sugestão, conselheiro e notificação) → `buildRecoveryToday` → `sessionAdvice` + `swapOffer`.
  - `POST /api/coach/today-swap` aplica `applySwap`/`undoSwap` no JSON do plano, em lugar.
- **Arquivos:** `src/lib/recovery-load.ts`, `recovery-today.ts`, `session-swap.ts`, `health-view.ts#sessionAdvice`; `src/app/api/coach/today-swap/route.ts`; `src/components/today/SwapActions.tsx`; `TodayCard.tsx`; `health/screen/RecoveryHero.tsx`. O inbox antigo (`/api/coach/suggestion`) e o aceite do conselheiro (`advisor/route.ts#acceptReadiness`) também passam por `applySwap`.
- **Dados:** `wellness_data` (60 d), `health_checkins`, `runs` (180 d, para carga), `performance_tests`, `coach_reports` (semana atual e próxima), `activities` de hoje. Escreve `WeeklyPlanDay.swap` (`SwapRecord` com o dia original).
- **Regras:**
  - Só oferece troca se o veredito não é "alta", a sessão de hoje é dura (intervalos, limiar, teste, HIIT, longão) e ainda não foi feita. **Prova nunca é trocada.**
  - **"Leve":** vira rodagem de `max(4, round(km×0,5))` km no ritmo fácil do atleta.
  - **"Amanhã":** só se amanhã é leve/descanso, não foi trocado e depois de amanhã não é duro; domingo não passa para segunda.
  - **Nunca automático.**
- **Edge cases tratados:**
  - sessão já feita → "Treino de hoje feito" + prévia de amanhã;
  - dia de descanso;
  - musculação feita;
  - sem plano;
  - calibração (menos de 7 noites de HRV);
  - sono de ontem.
- **Limitações:**
  - A troca "amanhã" não recalcula o resto da semana.
  - Coexistência com `plan_suggestions`.
  - Não há registro de quantas vezes o atleta trocou (dado útil para o conselheiro).
- **Melhorias:** bolinha de recuperação em cada dia do plano (ideia 3 do brainstorm); semana de recuo antecipada quando a queda de HRV se sustenta (ideia 7); aprender com as trocas; unificar com `plan_suggestions`.

## 6.3 Edição do plano 🟡

- **Chat do plano** (`/api/coach/weekly-plan/chat` + `processPlanFeedback` + `plan-edit.ts`):
  - A IA traduz o pedido em edições `set_distance`/`set_rest`/`swap_days`/`scale_week`, o código aplica e a confirmação é escrita a partir do que mudou de fato.
  - `extractAthleteNotes` grava memória em `athlete_notes`.
  - *Limitação:* só 4 tipos de edição; não muda tipo de sessão nem ritmo.
- **Mover sessão** (`MoveSessionControl.tsx`, `/weekly-plan/move`): troca determinística de dias, com `movedFrom`.
- **Ajuste proativo por IA** (`ProactiveAdjustBanner.tsx` → `/weekly-plan/adjust` → `adjustWeeklyPlanProactive`):
  - Aparece quando há treinos perdidos ou parciais. **A IA reescreve os dias restantes da semana em andamento.**
  - ⚠️ **Contradiz dois princípios**: "IA não prescreve" e "semana em andamento não é reescrita". O formato de dia que a IA devolve **não tem `structure` com intensidade nem `strength`**, então sessões de força e passos com ritmo/FC se perdem nos dias reescritos. Ver dívida técnica.
- **Frescor** (`/weekly-plan/freshness`, `plan-freshness.ts`): compara o `fingerprint` do plano (versão do motor, teste, preferências) com o atual e sugere atualizar. Se a semana está em andamento, sugere a próxima.

## 6.4 Teste de 3 km e calibração ✅

- **Objetivo:** um único teste de campo que calibra VDOT, ritmos, LTHR, zonas, previsões e libera o conselheiro.
- **UX:**
  - Treinador → aba "Testes 3km": formulário (`TestForm`), histórico (`TestHistoryCard`), evolução de VDOT.
  - Aba "Zonas & Plano" → seção "Calibração" (ritmos, zonas por esporte, previsões).
  - Dashboard: `TestCalibrationCard` quando falta.
  - `StaleTestWarning` quando vencido.
  - Teste agendado dentro do plano.
- **Implementação:** `computeMetrics(timeSec, distanceKm, avgHr, maxHr)` em `performance.ts` e `testStatus(tests)` em `test-status.ts` (estados `missing`, `no_hr`, `fresh`, `aging` 8–16 sem, `stale` 16+ sem; `unlocks`; `nudge`).
- **Arquivos:** `src/lib/performance.ts`, `test-status.ts`, `smart-goals.ts`; `src/app/api/performance-tests/*`; `src/components/coach/{TestForm,TestHistoryCard,ZonesCard,PacesCard,PredictionsCard,SportZonesCard,VdotEvolutionChart,StaleTestWarning}.tsx`; cron `test-reminder`.
- **Dados:** `performance_tests`.
- **Regras:**
  - VDOT pelas equações de Daniels/Gilbert.
  - LTHR = FC média × 0,95, limitado a FC máx × 0,92.
  - Zonas de Friel contíguas.
  - Ritmos fáceis por %VO2max; ritmos M/T/I/R por tempo de prova previsto.
  - Previsões de Daniels (e Riegel 1,06 como alternativa em `predictRaceTimes`).
  - Lembrete por push: nunca testado → a cada 2 semanas; 8+ semanas → a cada 4 semanas.
- **Edge cases tratados:** teste sem FC, FC máx medida × estimada, teste não de 3 km (a distância é aceita), vários testes no mesmo dia.
- **Limitações:**
  - Uma única forma de calibrar. Uma prova recente não recalibra automaticamente (`race-analysis` calcula o "VDOT implicado", mas não grava como teste).
  - `full-analysis` usa LTHR 0,925 (inconsistente).
- **Melhorias:** recalibrar por prova ou por corridas de esforço, zonas por esporte com dados reais.

## 6.5 Conselheiro 🟡

- **Objetivo:** observar o treino como um treinador (padrões, riscos, estagnação) e propor mudanças aplicáveis com um toque.
- **UX:** Treinador → `AdvisorCard` (achados com evidência, proposta e botão de ação); push semanal (sex 21h) com o achado mais grave.
- **Implementação:** `advisor.ts` gera achados determinísticos com `finding_key`, `severity`, `evidence`, `proposal` e `patch`. A rota `/api/coach/advisor` reconcilia com o banco (`advisor-inbox.ts#reconcileSuggestions`, cooldown de 28 dias para dispensados, `dedupeForDisplay`). Aceitar aplica o patch (preferências, split, volume) ou a troca de hoje.
- **Achados existentes** (`advisor.ts`):
  - `sem_dia_livre`
  - `split_frequencia_1x`
  - `posterior_negligenciado`
  - `sem_registro_forca`
  - `qualidade_antes_longao`
  - `volume_estagnado`
  - `salto_de_volume`
  - `qualidade_demais`
  - `longao_curto`
  - `habito_saiu_rapido`
  - `habito_rodagem_forte`
  - `habito_tiros_desabaram`
  - `aderencia_baixa`
  - estagnação de carga na força (via `strength-progression`)
- **Dados:** `advisor_suggestions`, `runs`, `run_streams.analysis`, `strength_logs`, plano.
- **Limitações:**
  - Só libera com teste feito (`unlocks.advisor`).
  - A unique por semana causa duplicatas no banco (resolvidas na exibição).
  - Não usa recuperação/HRV.
  - Narrativa não usa IA (decisão consciente).
- **Melhorias:** achados de saúde (sono curto recorrente, HRV em queda × volume subindo), limpeza das duplicatas.

## 6.6 Musculação ✅

- **Objetivo:** prescrever força periodizada que conviva com a corrida, com catálogo real de exercícios e progressão por carga registrada.
- **UX:**
  - Treinador → "Sua configuração" → Musculação: objetivo, experiência, equipamentos, músculos por dia, cardio.
  - No plano: sessão com exercícios, séries, repetições, RIR e imagens (`StrengthSessionView`, `ExerciseDetail`, `ExerciseImage`).
  - Registro de séries (`StrengthLogger`), troca de exercício (`ExerciseSwap`), progresso (`StrengthProgressCard`), sugestão de rebalancear o split (`SplitRebalanceCard`).
  - Calendário: sessão de academia manual (`GymSessionForm`).
- **Implementação:**
  - `strength-builder.ts` monta a sessão a partir de `strength-prefs` e `strength-cycle.ts` (ciclo com época fixa em 05/01/2026).
  - `strength-progression.ts` sugere carga a partir de `strength_logs`.
  - `exercise-substitute.ts` troca por equivalente.
  - `split-rebalance.ts` detecta músculo negligenciado.
- **Arquivos:** `src/lib/strength-*.ts`, `exercises.ts` (curado), `exercise-catalog.ts` (**gerado** por `scripts/import-exercises.mjs` do free-exercise-db, não edite), `exercise-substitute.ts`, `split-rebalance.ts`, `cardio-builder.ts`; `src/app/api/strength/*`, `/api/coach/strength-prefs`, `/api/coach/split-proposal`; componentes em `src/components/coach/`.
- **Dados:** `profiles.strength_prefs`, `strength_logs`, `activities` (sessões do Strava/manuais).
- **Limitações:**
  - Força não entra na carga (TSS).
  - Imagens dependem de CDN externo.
  - Não há detecção de lesão.
  - As durações vindas do Strava (`WeightTraining`) não trazem exercícios.
- **Melhorias:** carga de força no TSS (sRPE × duração), prescrição ajustada à recuperação.

## 6.7 Importação do Strava e corridas ✅

- **Objetivo:** o atleta nunca aperta "sincronizar". Toda corrida e atividade chega sozinha e é analisada.
- **UX:**
  - Configurações → Integrações → Strava (conectar, desconectar, histórico de sync).
  - Corridas: lista com busca e filtros (`RunsContent`), mapa-múndi (`/runs/map`, `RunsWorldMap`).
  - Detalhe (`RunDetailContent`): mapa, splits, previsto × executado (`ExecutionCard`), tênis, análise por IA, notas.
  - Nova corrida manual (`/runs/new`, `RunForm`).
- **Implementação:**
  - **Webhook** `POST /api/strava/webhook`:
    1. Busca a atividade.
    2. O que não é corrida vai para `activities`; corrida vai para `runs`.
    3. Detecta duplicatas prováveis (`isProbableDuplicate`).
    4. Roda `analyzeRun` (IA) e grava `coach_feedback`.
    5. Envia push ao próprio atleta e avisa amigos (`notifyFriendsOfWorkout`).
    6. Em `delete`, faz soft delete **só em `runs`** (⚠️ atividade apagada no Strava continua em `activities`).
  - **Sync manual/automático** `POST /api/strava/sync` (`AutoStravaSync` a cada 20 min por dispositivo): pagina atividades, enriquece calorias (`strava-enrich.ts`, chamada de detalhe) e analisa por IA as 3 mais recentes.
  - **Cron** `strava-sync` (06:30 BRT): garante a assinatura do webhook (`strava-subscription.ts`), recupera os últimos 3 dias e faz backfill de recordes (8 atividades por atleta).
  - **Streams sob demanda** `GET /api/runs/[id]/streams`: `run-streams.ts` calcula splits, drift e `analysis` versionada (`ANALYSIS_VERSION=4`) e cacheia em `run_streams`.
- **Regras:**
  - Data = `start_date_local` do Strava.
  - Tipo de corrida inferido (`workout_type` do Strava / nome).
  - Tempo em movimento para ritmo e splits; tempo total para recordes (`run-time.ts`).
- **Edge cases tratados:** token expirado (refresh), atividade manual duplicada com Strava, esteira sem GPS, pausas longas, stream com `moving` inconsistente (`STREAM_TRUST_WITH_MOVING`), velocidade impossível (`MAX_HUMAN_MPS=12,5`).
- **Limitações:**
  - Limite do Strava: 100 req/15 min e 1.000/dia **para o app inteiro**.
  - O webhook depende de a assinatura existir (o cron recria).
  - Apagar no Strava não apaga em `activities`.
  - A IA recebe **o histórico completo de corridas** em cada análise: custo e latência crescem com o tempo.
- **Melhorias:** fila para análise por IA (fora do webhook), limitar o contexto de histórico, soft delete em `activities`.

## 6.8 Recordes, best efforts e conquistas ✅

- **Objetivo:** recordes corretos, iguais aos do Strava, e conquistas que motivem.
- **UX:** Dashboard `PersonalRecordsCard`, Treinador → Perfil IA → `PersonalRecords`, perfil do amigo (com os recordes da pessoa), `AchievementsCard`, `/friends/conquistas` (comparação).
- **Implementação:**
  - `best-efforts.ts`: janela de dois ponteiros sobre os streams, com tempo total, em 400 m, 1 km, 1 milha, 3 km, 5 km, 10 km, 15 km, meia, 30 km e maratona.
  - `records.ts` é a fonte única (janelas + atividade inteira como substituta dentro de 0,995–1,05 da distância).
  - `records-backfill.ts` processa o histórico.
  - `achievements.ts` é função pura.
- **Dados:** `run_best_efforts` (sentinela `distance_m=0`), `run_streams`, `runs`.
- **Limitações:**
  - O backfill é lento por causa do limite do Strava.
  - Corridas manuais sem stream só contam pela atividade inteira.
- **Melhorias:** recordes por ano e por tênis.

## 6.9 Carga de treino, forma e overtraining ✅

- **Objetivo:** mostrar fitness, fadiga e forma e alertar risco.
- **UX:** Dashboard `FitnessCard` (CTL/ATL/TSB com textos explicativos de `load-explainer.ts`), `OvertrainingAlert`, Saúde → "Carga × recuperação", Treinador → Progresso.
- **Implementação:** `training-load.ts` (TSS por FC → ritmo → tipo; EMAs com pré-aquecimento de 42 dias), `overtraining.ts` (TSB, ACWR ≥1,3/≥1,5, monotonia etc.).
- **Limitações:** só corridas; o TSS por tipo é heurístico sem FC; o ACWR em atleta de baixo volume oscila muito.
- **Melhorias:** carga de força e de outros esportes, TRIMP por streams de FC.

## 6.10 Saúde: recuperação, vitais, sono, check-in ✅ (reescrita em 14/09)

- **Objetivo:** responder "estou recuperado para o treino de hoje?" com dados do relógio quando existem e com 3 perguntas quando não.
- **UX (tela `/health`, `HealthScreen`):**
  - Cabeçalho com atualizar Garmin.
  - **RecoveryHero:** anel + veredito + conselho + troca.
  - **Sinais vitais** (`VitalTiles`): HRV, FC de repouso e sono contra a média de 30 dias, com série de 30 dias ao tocar e etiqueta "ontem".
  - **Carga × recuperação** (`LoadRecoveryChart`, 14 dias).
  - **Sono** (`SleepCard`, semana contra a meta de 7,5 h).
  - **O que compõe o score** (`ContributorsCard`).
  - **Energia** (`EnergyCard`).
  - **Monitor do relógio** (`MonitorCard`: SpO₂, respiração, passos, VO₂máx Garmin; fora do score).
  - **Corpo** (`BodyCompositionCard`, `SupplementsCard`).
  - **Dispositivos** (Garmin via `IntervalsCard`, Calorias do iPhone via `AppleHealthSyncCard`, Whoop em disclosure, `NativeHealthSync`).
  - **Modo sem relógio:** `CheckinPanel` + `CheckinSheet` (sono em horas, qualidade 1–5, dor 1–5, RPE de ontem); `?checkin=1` abre direto.
- **Implementação:** `src/app/health/page.tsx` (server) → `loadRecoveryInputs` + `buildVital`/`buildSleepWeek`/`recoveryHistory`/`buildMonitor`/`energyForDay`.
- **Arquivos:** `src/lib/{readiness,health-view,recovery-today,recovery-load,nutrition}.ts`; `src/components/health/screen/*`; `src/app/api/health/{checkin,wellness-status,wellness,body,supplements,nutrition-profile,diet-tip,wellness-token,connection}/route.ts`.
- **Regras:** fórmulas na seção 10.
  - A média exclui a noite julgada.
  - HRV só pontua com ≥7 noites de base; FC de repouso com ≥3.
  - Sono datado no dia em que se acorda.
- **Edge cases tratados:**
  - noite ainda não chegou;
  - calibração;
  - peso do perfil do Garmin (ignorado);
  - check-in e relógio no mesmo dia (usa os dois);
  - atleta sem nada (carga pura, rotulado).
- **Limitações:**
  - Sem estágios de sono.
  - Sem Body Battery real (intervals.icu não entrega) → o componente de 30% "recuperação do fabricante" só existe com Whoop.
  - `readiness` do intervals.icu guardado e não usado.
  - Noite sincronizada antes da conexão se perde.
- **Melhorias:** tendência de 7 dias influenciando o volume, prontidão pré-corrida, validar contra o Training Readiness do Garmin.

## 6.11 Energia, nutrição, corpo e suplementos 🟡

- **Objetivo:** meta calórica do dia coerente com o treino e a medição real, sem virar app de dieta.
- **UX:**
  - Saúde → Energia: gasto do dia, meta, macros, dica por IA; se falta peso, sugere registrar.
  - Dashboard → `CalorieDetailModal`.
  - Corpo: peso e bioimpedância manuais.
  - Suplementos: lista.
- **Implementação:**
  - `nutrition.ts`: Mifflin-St Jeor, `energyForDay` (basal medido pela Apple Saúde quando plausível), `calorieTarget` (−400/+300), `macrosFor` (proteína 1,8 g/kg, gordura 25%, carbo o resto), `fuelingPlan`.
  - `calorie-breakdown.ts`.
  - `generateDietTip` (IA).
- **Dados:** `profiles` (altura, sexo, nascimento, objetivo), `body_measurements`, `wellness_data.active_kcal`/`resting_kcal`, `runs.calories`/`activities.calories`, `supplements`.
- **Limitações:**
  - Depende do Atalho do iPhone rodar (automação pessoal de cada um).
  - Sem Android.
  - Dica de IA sem memória.
- **Melhorias:** recomendação de carboidrato por sessão (antes/durante/depois), integrar à prova.

## 6.12 Notificações 🟡 (entregam para 4 de 7 usuários)

| Notificação | Gatilho | Arquivo |
|---|---|---|
| **Manhã: treino + recuperação** | Pelos dados: pg_cron a cada 15 min das 05:00 às 09:45 BRT; manda quando a noite chegou; passada final às 08:30 com texto "a noite ainda não chegou". Deduplicada por `notification_log` | `morning-dispatch.ts`, `morning-message.ts`, `/api/cron/{morning,notify-morning,wellness-sync}` |
| Noite: treino de amanhã | 22:00 BRT | `/api/cron/notify-evening` |
| Lembretes de prova | D-7, D-1, D-0 (05:30) | `/api/cron/notify-morning` |
| Teste de 3 km | Seg 12:00, cadência pelo calendário | `/api/cron/test-reminder` |
| Conselheiro | Sex 21:00, achado mais grave | `/api/cron/notify-advisor` |
| Treino de amigo | Na importação, 1 por amigo por dia, respeita mute | `friend-notify.ts` |
| Pedido de amizade | Na solicitação | `/api/friends` |
| Semana fechou | Seg 07:00 | `/api/cron/weekly-report` |
| Corrida importada | Webhook | `/api/strava/webhook` |

- **Preferências:** `NotificationPrefsCard` (`dailyWorkout` "Treino e recuperação do dia", `tomorrowWorkout`, `friendWorkouts`, `friendRequests`).
- **Limitações:**
  - Push web no iOS exige PWA instalada (iOS 16.4+).
  - 3 usuários sem inscrição válida.
  - Assinaturas expiradas (404/410) são removidas.
  - Alguns textos antigos ainda têm emoji (ex.: "Resumo da semana pronto 📊").

## 6.13 Provas, metas, estratégia, análise pós-prova e macro-plano 🟡

- **Provas** (`/races`, `RacesContent`, `RaceForm`): futuras (sem tempo) e concluídas.
  - `is_target_race` define a prova-alvo (`TargetRaceCard` no dashboard).
  - Concluída → `RaceAnalysisModal` → `race-analysis.ts` (splits dos streams + preparação) → `generateRaceAnalysis` (IA, JSON) → `coach_reports`.
- **Metas** (`/goals`, `GoalsContent`, `SmartGoalsCard`): metas com cenários; sugestões por VDOT (`smart-goals.ts`); estratégia de prova (`/api/goals/strategy`, `race-strategy.ts` → `generateRaceStrategy`, IA JSON; cron em D-14 e D-3).
- **Macro-plano** (`MacroPlanCard`, `/api/coach/macro-plan`): **determinístico** (`macro-builder.ts`: fases base/build/peak/taper/race, demanda por distância, avaliação de viabilidade). `macro-plan.ts#adaptMacroPlanForUser` recalcula as semanas futuras no cron semanal. As versões por IA (`generateMacroPlan`, `adaptMacroPlan`) em `ai.ts` são **código morto**.
- **Limitações:**
  - Metas (`goals`) e provas (`races`) são conceitos duplicados.
  - A estratégia usa IA para ritmos por faixa (validados só por regras no prompt).
- **Melhorias:** unificar metas e provas; ritmos da estratégia calculados pelo motor, com a IA só redigindo.

## 6.14 Social ✅

- **Amigos** (`/friends`):
  - pedidos, aceitar, sugestões ranqueadas (`friend-suggestions.ts`);
  - feed de 14 dias (só campos resumidos, sem notas/FC/GPS) com kudos;
  - ranking de agregados;
  - desafios derivados (`ChallengesCard`: mês/semana);
  - silenciar amigo;
  - perfil do amigo (`/friends/[id]`) com recordes e estatísticas;
  - comparação de conquistas.
- **Dados:** `friendships`, `kudos`, `friend_mutes`, `friend_workout_notices`; leitura cruzada via service role.
- **Limitações:**
  - Privacidade prometida na UI; a policy de `profiles` pode contradizer isso (alerta 4).
  - Sugestões leem a tabela inteira de usuários (ok com 7).

## 6.15 Onboarding, identidade e convites ✅

- **Onboarding** (`OnboardingGate` → `OnboardingFlow`):
  - sequência como dados em `onboarding-flow.ts`, alternando cena (componentes reais com atleta de exemplo, `onboarding-scenes.ts`) e pergunta: boas-vindas, amigos, identidade, treino estruturado, dias de corrida, catálogo de força, força, zonas, previsões, carga, histórico, Strava, prova-alvo, push;
  - tudo pulável;
  - `SetupChecklist` no dashboard com soneca;
  - `OnboardingTour` e `TutorialButton` em Configurações.
- **Identidade** (`IdentityGate`): nome, sobrenome e username obrigatórios para usar o app social.
- **Convites:** código obrigatório no cadastro; gerência em Configurações (admin).
- **Limitações:** o estado "já viu" fica no `localStorage` (repete em outro dispositivo).

## 6.16 Tênis ✅

Cadastro com km inicial, vínculo por corrida (`RunShoePicker`), dica de troca (`ShoeHint`, `shoes.ts`) e aposentadoria. Não há importação dos tênis do Strava (`gear_id`) **(não verificado)**.

## 6.17 Calendário ✅

`ActivityCalendar`: mês com corridas, atividades e plano; `DayModal`; lançamento manual de academia (`GymSessionForm`).

## 6.18 Gráficos e relatório mensal ✅

- `/analytics`: abas Volume (semanal/mensal), Pace, FC, Longões e Evolução.
- `MonthlyReportModal` (determinístico, `monthly-report.ts`).
- Treinador → Progresso: adesão (`plan-adherence.ts`), eficiência aeróbica (`aerobic-efficiency.ts`: ritmo por batimento em corridas fáceis), resumo do ciclo (`cycle-summary.ts`).

## 6.19 Análises por IA 🟡

- **Da corrida** (automática na importação e sob demanda).
- **Análise completa** (Treinador → Progresso → "Análise completa por IA", salva em `coach_reports` `general`): texto longo com "plano para 8 semanas", que **pode contradizer o plano determinístico**.
- **Resumo semanal:** ver 13.
- Detalhes na seção 9.

## 6.20 Export `.FIT` ✅

- `GET /api/workouts/export` → `workout-fit.ts` (Garmin FIT SDK) gera um arquivo de treino estruturado (passos por distância/tempo, alvos de ritmo) para Garmin, Coros, Wahoo e Zepp.
- **Limitação:** no iPhone, o `.FIT` baixado precisa ser importado manualmente no Garmin Connect. Não há envio direto ao relógio (a Training API da Garmin também está fechada).
- **Caminho discutido e não implementado:** o intervals.icu já envia treinos planejados ao Garmin. O Limiar poderia escrever a semana no calendário do intervals.icu e os treinos apareceriam estruturados no relógio (bônus do brainstorm de 14/09; **API de escrita de eventos do intervals.icu não verificada**).

## 6.21 PWA, offline e tema ✅

- Instalar app, service worker com cache e página offline, plano da semana em `localStorage`, tema claro/escuro/sistema, haptics.
- **Limitação:** o cache do SW pode servir versões antigas após deploy **(não verificado se há versionamento de cache agressivo)**.

## 6.22 Admin ⚪/🟡

- `/api/admin/invites` gera e lista convites.
- `/api/admin/push-diagnose` mostra o estado das inscrições push.
- A validação do código de convite (`/api/auth/invite`) tem rate limit por IP **em memória** (`src/lib/admin-rate-limit.ts`, um `Map`). Em serverless cada instância tem o seu, então o limite é fraco.

## 6.23 Ponte nativa (Capacitor, Health Connect/HealthKit) ⚪

`capacitor.config.ts`, `native-shell/`, `NativeHealthSync.tsx`, `/api/health/wellness` e `BUILD_NATIVE.md` existem. **Nunca foi compilado nem publicado.**

## 6.24 Whoop ⚪

Fluxo OAuth completo (`whoop.ts`, `/api/whoop/*`, `WhoopCard`, migration 023). Inativo: sem credenciais configuradas e sem usuário com Whoop.

---

## 6.25 Check-in pós-corrida ✅ (novo, 16/09)

- **Objetivo:** o Strava entrega FC, ritmo e distância; falta como o treino foi **para a pessoa**. Duas respostas curtas fecham a leitura da sessão e, principalmente, distinguem *não deu para treinar* de *não tenho capacidade* — a distinção que Sérgio pediu ("as vezes semanas de muito trabalho e outras coisas atrapalham").
- **UX:** card "SEU TREINADOR · PÓS-TREINO" na Home (acima do treino de hoje) e no detalhe da corrida. Esforço em 5 níveis, contexto (tudo certo, tempo/agenda, trabalho, clima, cansaço, dor, outro), observação opcional (≤300), pular e editar. Depois de responder, mostra a avaliação: evidências (distância × prevista, ritmo dentro/fora da faixa, esforço relatado) e o que muda nos próximos treinos.
- **Implementação:** `src/lib/run-feedback.ts` (funções puras: `validFeedbackInput`, `matchFeedbackPlan`, `evaluateRunFeedback`, `pickFeedbackItem`), `src/app/api/run-feedback/route.ts` (GET lista as corridas de 7 dias com o que já foi respondido; PUT grava), `src/components/runs/RunFeedbackCard.tsx`, montado em `DashboardContent` e `RunDetailContent`.
- **Dados:** tabela `run_feedback` (migration 028). O vínculo com o plano é conservador: só há comparação com uma prescrição quando existe exatamente uma corrida no dia, um relatório da semana e o plano é anterior à corrida. O snapshot é guardado na resposta.
- **Regras:** avaliação determinística, **sem LLM**. Não julga tiros pelo ritmo médio; não trata chuva/agenda/trabalho como perda de condicionamento; não manda compensar quilometragem; dor tem precedência no texto; nada no plano é alterado.
- **Segunda versão (16/09, após o primeiro uso real):** "Difícil" não gera alerta nenhum; só "Muito difícil" troca a segunda pergunta por *"O que deixou o treino muito difícil?"*. Motivos externos (sono, estresse, cansaço, questão pessoal, clima) só ficam registrados. *"O treino estava pesado demais"* abre *"Quer reduzir um pouco a carga dos próximos treinos?"* — com o sim, `lightenUpcomingRuns` (`plan-edit.ts`) encurta ~15% as corridas leves e o longão restantes da semana e a semana seguinte não aumenta. Migration 030.
- **Formato:** pop-up na entrada (`EntryPrompt`), no máximo um por visita, com "Responder depois" (grava `skipped`; não volta a aparecer). A página da corrida sempre oferece o formulário. **Não há mais card fixo no topo do dashboard.** Detalhes em `docs/run-feedback.md`.
- **Terceira versão (16/09):** "Responder depois" (`deferred`, volta após 6 h) separado de "Não quero responder" (`skipped`); cansaço relatado não reduz a semana em silêncio — segura sem aumentar e pergunta; pedido de redução só é salvo se o plano mudou (com volta atrás se o salvamento falhar).
- **Limitações:** só corrida; a observação livre não é interpretada.
- **Melhorias:** alimentar `planWeeklyVolume`/`volumeWithRatchet` com o contexto, e propor (nunca aplicar sozinho) manutenção ou aumento quando a evidência se repetir.

## 6.26 Leitura da semana: o que segura e o que cai ✅ (novo, 16/09)

- **Objetivo:** fechar o laço entre o check-in e o motor. O volume da semana seguinte já era recalculado a partir do executado, sem perguntar nada — então uma semana quebrada por trabalho ou chuva encolhia o plano em silêncio.
- **Regra (pura, testada, sem IA):** `src/lib/week-reading.ts#readWeek` decide o que o motor deve tratar como executado: o **previsto** quando o atleta explicou que foi a rotina (ou quando ninguém sabe ainda, uma única vez), o **que foi feito** quando o corpo pediu menos ou quando a pessoa disse que o plano está grande demais. Dor e cansaço têm precedência sobre agenda; a resposta do atleta tem precedência sobre os check-ins; quem não treina há mais de um mês não é interrogado.
- **Pergunta:** só aparece quando o plano iria encolher sem explicação, ou depois de duas semanas seguradas seguidas ("o plano precisa mudar?"). Progressão semana a semana continua automática — decisão explícita de Sérgio: *"nem TUDO deve ser perguntado"*.
- **Implementação:** `readPreviousWeek`/`weekReadingFor` em `weekly-plan.ts` (leem `run_feedback` da semana, `week_feedback` e os volumes planejado × executado) alimentam `previousActualKm` de `volumeWithRatchet`; a leitura é gravada no JSON do plano (`WeeklyPlanData.week_reading`) para a tela explicar.
- **Telas:** `WeekQuestionCard` na Home (pergunta e confirmação, dizendo quantos km ficou a próxima semana) e uma linha dentro do `WeeklyPlanCard` no Treinador.
- **Dados:** `week_feedback` (029). A rota `/api/coach/week-answer` só aceita responder a semana perguntada e, ao receber a resposta, regenera **a semana seguinte** (a atual está congelada).
- **Limitações:** só corrida; a leitura entra no motor na geração seguinte (a semana em andamento nunca é reescrita); a observação livre não é interpretada.
- **Documentação:** `docs/week-reading.md`.

## 6.27 Adaptar o treino (antes e depois da sessão) ✅ (novo, 16/09)

- **Objetivo:** o atleta que troca um treino quase sempre tenta preservar o objetivo, e decide antes de sair. O treinador participa dessa decisão e avalia a execução contra o que foi combinado — não contra a prescrição original.
- **Antes:** botão "Adaptar este treino" no card Hoje e no detalhe das corridas da semana. Motivo (tempo, local, GPS, formato, outro) → até 3 alternativas, uma recomendada, com *preserva / muda / por quê* → ou proposta própria em texto ("8 × 400 m"), lida por um analisador determinístico e avaliada: *mantém o objetivo / mantém parte / muda o objetivo*, com sugestão ajustada quando passa do teto da semana. O dia é substituído e o original fica em `adaptation.original`; desfazer devolve.
- **Depois:** quando a corrida ficou claramente diferente do previsto, o check-in pergunta "Fiz como previsto · Adaptei mantendo o objetivo · Fiz outro treino" e **marca** o dia do plano (`adaptation.when = "after"`), para a adesão não contar a substituição como falta.
- **Implementação:** `src/lib/session-adapt.ts` (famílias de estímulo, alternativas, `parseProposal`, `evaluateProposal`, `compareSessions`, `sessionWork`, `applyAdaptation`, `recordExecuted`, `executionDiffers`), `src/app/api/coach/adapt/route.ts`, `src/components/today/AdaptSession.tsx`; o construtor passou a marcar `WeeklyPlanDay.quality` e aceita `forceQuality`.
- **Dados:** JSON do plano (`adaptation`); `run_feedback.execution` e `executed_text` (migration 032).
- **Coerência do que o treinador entende ✅ (17/09, "ponto 1"):**
  - **Fase real.** O plano grava a fase em que foi construído (`WeeklyPlanData.phase`) e a rota de adaptação a usa; planos antigos recalculam com `phaseForRace()`. Antes era `"base"` fixo.
  - **Planejado → combinado → realizado.** O check-in não escreve mais a distância corrida em `distance_km` do dia (isso contaminava o volume da semana, a catraca e a adesão). `recordExecuted()` mantém a prescrição e grava o realizado ao lado (`adaptation.doneLabel`, `doneKm`). A adesão ganhou o estado **"adaptado"**: 1 quando a troca manteve o objetivo, 0,5 quando não. **Dado corrigido em produção:** a quarta de 16/09 voltou a "Subidas 6×45 s, 3,5 km" (restaurada de `adaptation.original`, com backup da linha) e a semana de 14/09 caiu de 75% para 63% de adesão.
  - **"Mantém o objetivo" olha a dose.** `sessionWork()` mede km em intensidade forte, repetições e trote médio; volume fora da faixa 60–160% do previsto rebaixa "mantém o objetivo" para "mantém parte", com a diferença dita em números. A recuperação só é comparada quando o atleta a informou.
- **Limitações:** só a semana atual e só corridas; texto livre fora dos formatos comuns vira "outro treino" sem estrutura; a comparação de dose exige estrutura dos dois lados (no check-in depois do treino, o texto é julgado só pela família). Detalhes em `docs/adaptar-treino.md`.

## 6.28 Devolutiva semanal ✅ (novo, 17/09)

- **Objetivo:** fechar a semana em três perguntas — *Como foi sua semana? · O que o treinador entendeu? · O que muda na próxima?* — curtas e úteis (pedido do Sérgio, 17/09).
- **Onde:** card no **Treinador**, logo acima do plano da semana. Some sozinho quando não há semana fechada para explicar; não fica preso no dashboard.
- **Como:** `src/lib/week-recap.ts` (determinístico, sem IA). Os fatos vêm da adesão (`plan-adherence`), a leitura vem de `plan.week_reading` (ou é recalculada com `weekReadingFor()` em planos antigos), os motivos vêm dos check-ins e a consequência vem do plano da semana que começa. Sessão adaptada é contada como adaptada; pergunta já respondida não aparece como pendente (mesma regra do pop-up).
- **Substitui a dívida A1:** o cron de segunda não gera mais resumo por IA (nunca gerava, e teria sobrescrito o plano) e passou a chamar `ensureWeeklyPlan()` em vez de `generateStructuredWeeklyPlan()`. O push de segunda continua e leva para `/coach`.
- **Limitações:** calculada na hora (não é gravada); fala de uma semana só; musculação entra apenas como contagem. Detalhes em `docs/devolutiva-semanal.md`.

## 6.29 Evolução no histórico ✅ (novo, 17/09)

- **Objetivo:** responder "O que está melhorando para você?" sem declarar melhora por causa de uma corrida mais rápida — e admitindo quando não dá para dizer ("ponto 3").
- **Onde:** card no topo de **Corridas**; "Ver como medimos" mostra o critério e os números de cada leitura.
- **Leituras:** consistência (4 semanas × 4 anteriores, passo de 0,5 corrida/semana); rotina × plano (quantas corridas a rotina comporta em ≥70% das semanas com plano — sugere, não muda o plano); ritmo em pares de corridas comparáveis (distância ±20%, FC ±6 bpm, subida e temperatura quando houver; sem provas, dias adaptados e treinos fortes; mínimo de 3 pares; passo de 5 s/km); esforço nos mesmos treinos pelos check-ins (≥4 avaliações do mesmo tipo, feitas como prescritas); frequência de adaptações e motivos.
- **Implementação:** `src/lib/progress-reading.ts` (determinístico), `src/components/runs/ProgressCard.tsx`, `src/app/runs/page.tsx`.
- **Em produção com os dados do Sérgio:** consistência estável (7 de 8 semanas), rotina de 2 corridas contra 3 previstas, 14 s/km mais rápido em 6 pares comparáveis, esforço ainda sem dados (1 check-in válido).
- **Limitações:** temperatura raramente disponível; a base de junho inclui o período da lesão no joelho; treinos fortes não são comparados sem voltas (laps). Detalhes em `docs/evolucao-historico.md`.

## 6.30 Saúde na decisão do Treinador ✅ (novo, 18/09)

- **Objetivo:** sono, relógio, relato do atleta e carga (com academia) decidem juntos se o treino exigente de hoje merece uma pergunta — "Hoje tem X. Você relatou cansaço e suas últimas noites ficaram abaixo do seu habitual. Como está se sentindo?" ("ponto 4").
- **Regra:** cada origem conta uma vez, pelo sinal mais forte; sessão exigente pergunta com pontuação ≥ 2 (um sinal forte ou dois moderados de origens diferentes); dia leve nunca pergunta (conselho com ≥ 3); dor pergunta antes de qualquer corrida. Travas: uma pergunta por dia, pop-up uma vez, "estou bem" ontem só reabre se piorou, no máximo duas por semana sem motivo forte.
- **Respostas:** manter · versão mais curta (via Adaptar, motivo novo "Estou cansado") · rodagem leve (troca existente) · amanhã (quando cabe). Nada muda sozinho; a pergunta substitui os botões antigos de recuperação baixa no card.
- **Implementação:** `src/lib/today-check.ts`, `/api/coach/today-check`, `src/lib/adapt-context.ts` (extraído da rota de adaptação), `TodayCheck.tsx`, `EntryPrompt.tsx` (primeira prioridade), `TodayCard.tsx`. **Migration 033** `today_checks`, aplicada em 18/09.
- **Limitações:** a notificação da manhã ainda não pergunta; limiares iniciais conservadores, a calibrar com as respostas gravadas. Detalhes em `docs/saude-no-treinador.md`.

## 6.31 A semana cabendo na agenda ✅ (novo, 18/09)

- **Objetivo:** "Esta semana só consigo treinar terça, quinta e sábado" — o Treinador reorganiza, explica o que priorizou e pede confirmação; a agenda vira dado do planejamento; e o padrão "você costuma precisar ajustar o treino de quarta" vira sugestão ("ponto 5").
- **Reorganizar:** "Minha agenda desta semana / da próxima semana" no card do plano. `fitWeek` testa todas as distribuições e pontua: longão 100, teste 90, tiro 40, rodagem 10; −50 para dois dias fortes seguidos; −8 longão fora do dia; −5 se a semana não abre com leve; −0,5 por dia movido. A rodagem sai primeiro, o tiro que ficaria na véspera do longão sai, não compensa km; musculação fica no lugar. Prévia → Confirmar → Desfazer (`rearrangement` no plano).
- **Agenda como dado:** para semana ainda não montada, fica em `week_availability` e `ensureWeeklyPlan` monta nesses dias (`prefsForAgenda`), sem alterar a impressão digital. **Migration 034**, aplicada em 18/09.
- **Padrão:** `troubledDays` (≥ 3 ajustes e ≥ 50% no mesmo dia, por tempo/cansaço/troca/não feito — local e formato não contam) → observação do Conselheiro com o patch `prefs_light_day` (preferência nova `lightDays`, respeitada por `allocateRunSessions`) **só quando** o tiro pode ir para um dia que não abre a semana nem fica na véspera do longão; senão, observação sem botão explicando por quê (é o caso de seg/qua/sáb). Longão não usa dia leve.
- **Implementação:** `src/lib/week-fit.ts`, `src/lib/day-patterns.ts`, `/api/coach/week-fit`, `WeekFitControl.tsx`, `advisor.ts` (achado `dia_pesado_*`), `workout-builder.ts` (`lightDays`), `plan-freshness.ts` (entra na impressão digital só quando definida), `weekly-plan.ts` (`fetchAgenda`), `session-adapt.ts` (desfazer uma adaptação mantém o dia atual depois de mover).
- **Limitações:** só esta semana e a próxima; move sessões inteiras, sem redistribuir volume. Detalhes em `docs/semana-na-agenda.md`.

## 6.32 Nova Home, seis áreas e status único do dia ✅ (novo, 18/09)

- **Decisão:** Home = "Hoje": treino do dia protagonista → semana com todas as atividades registradas (tempo comum, distância por esporte, calorias do relógio ou dos treinos) → no máximo um item de atenção. Sem % na Home. Mapa de navegação decidido por Sérgio: Hoje · Treinador (+ Provas e Metas) · Histórico (Corridas + Calendário + Gráficos + recordes/conquistas) · Saúde (+ carga e forma) · Amigos · Configurações — as três últimas com mais destaque.
- **Status único do dia ✅:** `src/lib/day-status.ts` define "feito" sessão por sessão (corrida, musculação, pedal…) e é usado pelo card Hoje, pela recuperação do dia, pela adesão e pela nova Home. Corrigiu: dia só de musculação nunca terminava; dia de corrida + musculação terminava após a corrida; três definições diferentes de "feito".
- **Aplicado após aprovação:** `/` é a nova Home (`HomeContent.tsx`, `week-movement.ts`); `/hoje` redireciona. Carga e forma → Saúde; ciclo e calibração → Treinador; recordes, conquistas, meta e totais → Histórico/Gráficos (`HistoryHighlights.tsx`). Navegação de seis áreas numa definição só (`nav-areas.ts`): barra lateral, barra de baixo sem "Mais", Configurações fixa no topo do celular (`MobileTopBar`) e abas das áreas (`AreaTabs`: Plano · Provas · Metas; Corridas · Calendário · Gráficos). Abas de página em cinza neutro (laranja = ação). Removidos `DashboardContent.tsx`, `TodayCard.tsx`, `WeeklyPlanSummaryCard.tsx`. A Home não carrega mais todo o histórico com o JSON do Strava (A6 parcialmente resolvida).
- **Ajustes de uso (18/09):** semana com feito / previsto / **não feito**, ícones de linha (`SportGlyph`) no lugar de emojis, anel de dias treinados/previstos, blocos grandes de corrida, musculação e calorias, anel de recuperação 0–100; alerta de sobrecarga só com sinal de carga; `CountUp` sem valores negativos. Calendário no celular (semana começando na segunda, ícones, cabeçalho compacto). "O que compõe o score" recolhível em Saúde.
- **Histórico unificado:** aba "Atividades" com todos os esportes e filtro por esporte; `/activities/[id]` para qualquer esporte; `?sport=` a partir da Home. Distâncias com vírgula. Detalhes em `docs/nova-home.md`.

## 6.33 Amigos avisados em qualquer esporte + Home reordenada ✅ (novo, 20/09)

Primeira fase do plano em `docs/plano-proximos-passos.md` (que descreve também a IA central, ainda por fazer).

- **Bug corrigido — corrida não avisava ninguém:** `notifyFriendsOfWorkout` era chamado **só** no ramo do webhook que trata o que *não* é corrida. A sincronização manual e a noturna não avisavam para esporte nenhum. Agora todos os caminhos de entrada avisam: `strava/webhook` (corrida e demais), `strava/sync`, `cron/strava-sync` e a corrida registrada à mão (pelo `runs/[id]/analyze`, único momento no servidor que sabe que ela existe — e o aviso vai **antes** da chamada de IA, para uma falha da Groq não decidir se o amigo fica sabendo).
- **`workoutOf(sportType, …)`** (`friend-notify.ts`) monta o texto pelo esporte, não pelo título da linha: "Corrida · 8,2 km", "Musculação · 52 min", "Ciclismo · 32,0 km". O nome cru ("Afternoon Run", "Peito e tríceps") é só o último recurso. As três regras antigas seguem valendo — amizade aceita, silenciado respeitado, **um aviso por amigo por dia** (é o que protege o treino que chega por dois caminhos) — e só o dia de hoje vira notificação.
- **Hoje reordenada:** alertas (notificações bloqueadas, sobrecarga, item de atenção) **no topo**, não no fim; "Como você está hoje" virou bloco próprio (anel 0–100, veredito, pergunta antes da sessão exigente e a troca que ela oferece, convite ao check-in) e só aparece quando tem o que dizer; depois "Treino de hoje" e "Minha semana".
- **Semana por sessões:** o anel passou a ser "X de Y **sessões**" (`week.plannedSessions`, novo em `week-movement.ts`) e os dias treinados/previstos ocuparam o lugar das horas; as horas viraram detalhe. Dia ≠ sessão: uma segunda-feira de corrida + academia é um dia e duas sessões.
- **Caixinhas dinâmicas:** todo esporte com sessão registrada na semana, mais todo esporte que o plano pediu (com zero, quando ainda não aconteceu), mais calorias. Antes corrida e musculação eram fixas.
- **Frases de disposição reescritas** (`recovery-today.ts`): "Treine com margem" → "Dá para treinar, sem forçar" / "Dá para fazer o treino forte, sem exagerar"; "Recuperação baixa — dá para aliviar" → "Recuperação baixa: hoje pede um treino mais leve".

## 6.34 IA central ✅ (novo, 20/09)

Fase 2 do plano em `docs/plano-proximos-passos.md`. Detalhes em **`docs/ia-central.md`** — leia esse antes de mexer.

- **Regra que organiza tudo:** as telas apresentam os dados, a IA interpreta. E a ADR-02 continua acima disso: **o motor calcula, a IA narra.**
- **`src/lib/ai-brief.ts` é o dossiê** — não faz conta nenhuma. Pega o que os leitores determinísticos das telas já concluíram (`today`, `week-movement`, `week-recap`, `progress-reading`, `recovery-today`, `training-load`, `overtraining`, `performance`, `plan-adherence`, `shoes`, provas, metas) e escreve em seções: título, frase de resposta, fatos e **fonte**.
- **Duas formas de perguntar, o mesmo material:** os botões de leitura rápida devolvem a própria seção, no navegador, sem rede e sem modelo; o campo aberto manda o dossiê à Groq (`answerAthleteQuestion`), que responde **só sobre ele**.
- **Seção sem dado não existe** — não vira botão, não vira resposta, não entra no texto do modelo. Sem dado nenhum, a IA não diz nem "está tudo bem". `tests/ai-brief.test.ts` (16 testes) existe para isso: número que apareça sem estar no dossiê foi inventado.
- **Botão redondo laranja** (`CoachFab`, no `AppShell`) no canto inferior direito de toda aba, acima da barra de baixo; some na `/ia`.
- **Conversa gravada, sem limite de uso** (decisão do Sérgio): migration **`035_ai_conversas.sql`** → `ai_messages`, RLS de ler/inserir/**apagar** as próprias, `date` no fuso do atleta, linha do tempo agrupada por dia e botão de apagar tudo na tela.
- **O dossiê é sempre montado no servidor.** A tela recebe uma cópia para responder na hora; `/api/ia/perguntar` monta o seu do zero — quem pergunta não escolhe os números sobre os quais a IA responde. E a leitura rápida é gravada **recalculando** no servidor, não copiando o texto que o cliente mostrou.
- **Custo conhecido:** montar o dossiê são ~18 consultas (`ai-brief-load.ts`), pagas ao abrir `/ia`, a cada pergunta aberta e a cada gravação de leitura. O atleta nunca espera pela gravação; a tela e a pergunta, sim.
## 6.35 Fase 3 e a reorganização das telas ✅ (novo, 20/09)

Detalhes em **`docs/reorganizacao-20-09.md`**.

- **A IA foi testada contra os dados reais antes de qualquer remoção**, e o teste achou que **ela fazia conta**: perguntada sobre VDOT, multiplicou o ritmo de maratona pela distância e cuspiu "3h45". Corrigido em dois lugares — as previsões de Daniels entraram no dossiê (seção "Meus ritmos") e o prompt ganhou *"VOCÊ NÃO FAZ CONTA. Nenhuma."*. Temperatura caiu de 0,7 para 0,3.
- **Teto da Groq:** 8.000 tokens/min no plano gratuito, e o dossiê tem ~2.000 — três perguntas seguidas batem nele. `callGroqDetailed` lê o `retry-after` e a tela diz quantos segundos esperar, em vez de "tente de novo". O limite é do provedor, não uma decisão do Limiar.
- **Saíram das telas** (os leitores continuam, é deles que a IA lê): `WeekRecapCard` do Treinador, `ProgressCard` do Histórico, `HistoryHighlights` de Gráficos. Gráficos voltou a ser só gráfico. **Metas ficou:** sugerir meta é funcionalidade, não interpretação.
- **Hoje ganhou um rodapé:** teste de 3 km (contagem regressiva, `TestCountdown` + `daysUntilTestDue`), Seus números, Recordes e Prova-alvo. Falam da vida inteira, por isso ficam depois da semana.
- **Conquistas foram para Amigos** (`/friends/conquistas`, com aba própria em `nav-areas.ts`): medalha só significa alguma coisa ao lado de quem mais tem.
- **Tempo na Hoje** (`WeatherNow` + `weather.ts`): Open-Meteo, sem chave. Localização pedida **no toque**, guardada só no navegador, enviada arredondada a duas casas (~1 km).
- **Cores por tipo de treino** (`session-colors.ts`, extraído do `WeeklyPlanCard`): rodagem verde, limiar amarelo, tiro vermelho, longão roxo — agora também na Hoje. **Nunca em "Minha semana"**, onde a cor já quer dizer feito / previsto / não feito.
- **Custo assumido:** a Home voltou a carregar o histórico inteiro de corridas (só colunas numéricas, nunca `strava_raw_json`), porque "Seus números" e os recordes falam da vida toda. A carga segue olhando 180 dias, agora por filtro em memória.

## 6.36 Adesão e carga: três números que mentiam ✅ (novo, 21/09)

Detalhes em **`docs/adesao-e-carga-21-09.md`**. Viraram urgentes porque a IA central passou a citar esses números.

- **A11 resolvida:** `computeAdherenceHistory` ignora semanas que ainda não começaram. O plano da próxima semana é gerado no domingo e, a partir daí, o card abria **nele** — sete dias "a fazer" e adesão nula. Nos dados reais do Sérgio, o card passou de 21/09 (vazio) para 14/09 (83%).
- **A12 resolvida:** a regra "o dia de hoje ainda não acabou" existia só no ramo da corrida; uma quinta de academia nascia "Perdido" às 8h. Agora vale para qualquer esporte.
- **Sobrecarga enxerga todos os esportes:** `detectOvertraining` recebe as atividades e as repassa a `computeTrainingLoad`. Os dois carregadores buscam **180 dias** de atividades — a mesma janela das corridas, senão a carga crônica começa do zero e uma rotina antiga de academia vira pico novo. Nos dados reais o **ACWR caiu de 1,31 para 1,18**: o limiar de alerta é 1,30, ou seja, a Home mostrava "Carga subindo rápido" para uma carga que não subia.
- **"Dias sem descanso" conta qualquer treino** (`computeTrainingStreak`), não só corrida.
- **Bug encontrado ao comparar os dois TSB:** `loadRecoveryInputs` não selecionava `moving_time_seconds`, e `estimateTSS` mede pelo tempo em movimento de propósito (FC e pace médios do Strava são calculados sobre ele). A carga de Saúde saía inflada por cada semáforo. Uma coluna a mais e os dois números viraram o mesmo: **−5,1**.

## 6.37 Saúde em categorias e a IA fora do plano ✅ (novo, 21/09)

Detalhes em **`docs/saude-categorias-e-adr02.md`**.

- **Saúde tem um índice de quatro categorias no topo** (`HealthOverview`): Recuperação (score), Sono (média da semana), Forma (TSB) e Energia (alvo do dia). Cada uma leva à sua seção, e a tela foi agrupada atrás delas — "Corpo" entrou em *Energia e alimentação*. **É um índice, não um resumo:** nenhum número novo nasce ali. Antes eram nove seções do mesmo tamanho numa rolagem plana.
- **A2 resolvida — a IA não reescreve mais o plano.** `/api/coach/weekly-plan/adjust` e `adjustWeeklyPlanProactive` foram **removidas**. O banner de treino perdido agora chama `fitWeek` com `remainingDays()` como disponibilidade: prévia com explicação determinística, e nada é salvo antes do "Aplicar" (ADR-05). O motor protege longão → forte → rodagem, não empilha dias fortes, move a sessão inteira (estrutura, ritmo, adaptação e a musculação do dia ficam de pé — era isso que a reescrita por IA perdia) e não tenta repor os quilômetros que passaram.
- **`remember: false`** na rota do week-fit: "os dias que sobraram" não é a agenda de ninguém, e gravar aquilo faria a próxima geração da semana repetir uma frase que o atleta não disse.

## 6.38 Semana de 28/09: recado que inventava, memória que não esquecia ✅ (novo, 21/09)

Detalhes e **três decisões em aberto** em **`docs/semana-2809.md`**.

- **O recado da semana passou a ser conferido pelo código** (`src/lib/week-note.ts`): todo número em km que a IA citar tem que estar no plano; reprovado, entra o recado do motor. Motivo: o de 28/09 disse "6 km" e "20 km" numa semana de 3 + 3 + 8 e não disse que era de recuperação — com o prompt já proibindo distâncias. **Regra em prompt é pedido; a garantia fica no código.**
- **Notas de memória têm prazo** (migração **036**, `expires_at`; `src/lib/athlete-notes.ts`). Agenda e preferência ditas no chat de uma semana vencem na virada dela; lesão, objetivo e observação não. Quem gera a semana X lê as notas válidas **no começo de X** (`weekStartsAt`), não agora — a de 28/09 foi gerada às 00:02 de 21/09 e herdou "essa segunda não tenho tempo" como "segunda-feira tem pouco tempo".
- **O plano grava `cycle: { week, isRecovery }`** e o Treinador mostra a faixa "Semana de recuperação". 3/3/8 sem explicação parece defeito.
- **Aviso "Merece atenção" de segunda/terça abre `/ia?leitura=semana_passada`** — regressão da Fase 3, que tirou a devolutiva do Treinador mas deixou o aviso apontando para lá.
- **Dados:** backup em `Limiar/tmp/backups/2026-09-21_semana-2809_e_notas.json`; as duas notas vazadas ganharam prazo (28/09 00:00); a semana de 28/09 foi regenerada (mesmos números, recado honesto).
- **Em aberto, com o Sérgio:** recuperação com corrida abaixo do mínimo (proposta: tirar uma corrida), rodagem como válvula de escape do volume (proposta: teto de ~70% do longão), e a trava de volume subindo 29% por causa de uma troca (proposta: +10% no máximo sem prova).

## 6.39 Motor 5: a semana cresce com teto, tem forma e respeita o mínimo ✅ (novo, 22/09)

Três decisões do Sérgio, vindas da semana de 21/09 (rodagem de 9,5 km) e da de 28/09 (3 + 3 + 8). Detalhes em **`docs/semana-2809.md`**.

- **Teto de crescimento variável** (`growthCeiling`, em `workout-builder.ts`). A trava adotava o que foi corrido sem limite — uma troca de treino subiu a semana de 19 para 24,5 km, +29%. Agora: base 10%, +5% por semana entregue, +5% com três seguidas, +5% com prova, **mínimo 20% em terreno já sustentado**, teto absoluto 25%. E o corpo vota: ACWR > 1,3 ou TSB ≤ −15 cortam pela metade; ACWR ≥ 1,5, TSB ≤ −25 ou pedido de alívio zeram. O piso nunca desce. **No caso real deu 21 km — onde o próprio Sérgio chegou ajustando à mão.**
- **A rodagem deixou de ser a válvula de escape.** Teto de 70% do longão; a sobra (`surplusKm`) vira aquecimento e desaquecimento do dia de tiro. Sem dia de tiro, a rodagem fica com ela — melhor do que a semana perder quilômetros em silêncio.
- **Recuperação não prescreve corrida abaixo do mínimo do atleta** (`runDaysForBudget`): tira uma corrida em vez de encurtar todas, a do meio primeiro. A semana de 28/09 virou 5,5 + 8,5 km em dois dias.
- **O recado recebe a semana dia a dia.** A trava só olhava km, e o texto inventou "mantenha a sexta-feira livre" com musculação marcada na sexta.
- **`PLAN_ENGINE_VERSION` 4 → 5**, então planos antigos aparecem como desatualizados e o atleta pode regenerar. A semana de 28/09 do Sérgio já foi regenerada (backups em `Limiar/tmp/backups/`).

## 6.40 O Treinador virou agenda ✅ (novo, 24/09)

Quarta e última fase do redesenho (as três primeiras em 6.35 e em **`docs/treinador-redesenho.md`**). As anteriores tiraram coisas da tela e consertaram defeitos; o veredito do Sérgio sobre elas foi que *"além de corrigir problemas e deixar UM POUCO menos crowded, não melhoramos NADA"*. Ele estava certo: nenhuma tinha mexido no **desenho**.

- **A semana virou sete linhas com nome** (`WeekAgenda.tsx` + `src/lib/week-agenda.ts`). Eram sete caixinhas de 40 px com o rótulo cortado em seis letras ("Tiros c…"): para saber o que era quinta, tocava-se em quinta. Agora a linha diz *"Tiros de 1 km · 9 km"*, e a segunda sessão do dia — antes um segundo emoji de 11 px — virou *"+ musculação"*. A frase sai de `plannedSessionsOf`, a mesma origem da Hoje e da adesão.
- **O dia fica ao lado da semana** no computador (`lg:grid-cols-12`, 5 + 7, painel colado na rolagem) e embaixo no celular, onde tocar num dia rola o painel para a tela.
- **Cada sessão é um card**: treino, musculação e descanso. As ações (*Mover · Adaptar · Perguntar*) ficam no pé do card, sempre na mesma posição — antes apareciam em alturas diferentes conforme o dia tivesse ou não séries, musculação ou adaptação.
- **"Minha agenda desta semana" → "Reorganizar esta semana"**: o nome passou a dizer a ação, não a tela.
- **Nenhuma feature saiu.** Essa foi a regra dada: *"não podemos perder features, só expor elas melhor"*.
- **1.532 testes** (5 novos em `tests/week-agenda.test.ts`). Desenho conferido na tela com um plano de mentira, no computador e no celular.

## 6.41 Proporção e legibilidade do Treinador ✅ (novo, 24/09)

Quinta fase do redesenho, depois de uma revisão da agenda: ela funcionou ("agora consigo entender a semana sem abrir cada dia"), a apresentação não. Detalhes em **`docs/treinador-redesenho.md`**.

- **A largura acompanhou o layout.** `CoachContent` era `max-w-3xl` (768 px) — a largura de uma coluna só, dividida entre agenda e detalhe desde a fase 4. Daí o nome de treino cortado e as ações espremidas. Agora vai a `lg:max-w-5xl` e `xl:max-w-[1120px]`, com a agenda fixa em 330 px.
- **A caixa grande saiu.** O `card p-5` que envolvia cabeçalho, abas, avisos, agenda, cards e conversa — com caixas dentro dele — virou espaçamento. Borda só onde ela significa algo: sessão, proposta, aviso.
- **O cabeçalho diz o tamanho da semana:** "3 corridas · 27 km · 2 sessões de musculação" (`weekSummaryLine`, mesma origem das sessões da agenda), com o ciclo como etiqueta e as abas compactas no canto.
- **A introdução virou uma frase**, com a explicação do bloco de quatro semanas atrás de "Entender o planejamento".
- **Cards do dia reordenados:** o que é → quanto e em que ritmo → por quê → estrutura → tênis → ações. Fundo neutro, cor só no marcador e na etiqueta; o tênis virou uma linha (`ShoeHint compact`). O botão muda de nome conforme o treino ("Ver as séries" / "Ver a estrutura" / "Ver os exercícios") e o resumo não diz mais "1 blocos".
- **Hoje ≠ selecionado** na agenda (etiqueta laranja × fundo e borda), tipografia de 11–13 px para 12–15 px, e o nome do treino não é mais truncado.
- **Carregando ≠ sem plano:** trocar de semana mostrava "sem plano gerado ainda" por um instante, oferecendo gerar uma semana que talvez já tivesse plano; agora há esqueleto. E tocar no dia já aberto não esvazia mais o painel.
- **1.536 testes.** Conferido a 1.240 px e a 375 px com um plano de mentira numa página temporária.
- **Anotado:** aviso de hidratação no modo dev — **anterior a esta fase** (confirmado com o código da fase 4 via `git stash`), vindo de selecionar o dia de hoje num efeito dentro do boundary de Suspense do dev. Não aparece no build de produção.

# 7. TELAS E NAVEGAÇÃO

## 7.1 Mapa de navegação

```
/auth ──(login/cadastro com convite)──► / (Dashboard)
   └─ /auth/reset                        │
                                         ├─ IdentityGate (se falta nome/username) → OnboardingGate (novo usuário)
Desktop: Sidebar com 10 itens            │
Celular: Home · Corridas · Provas · Treinador · [Mais: Saúde, Calendário, Amigos, Metas, Gráficos, Configurações]

/                 Dashboard ("o treino de hoje")
/runs             Lista de corridas ─► /runs/[id] ─► /runs/[id]/edit
   ├─ /runs/new   Corrida manual
   └─ /runs/map   Mapa-múndi das corridas
/races            Provas (futuras e concluídas, análise pós-prova)
/coach            Treinador — a semana (sem abas)
   └─ /coach/calibracao  Teste de 3 km, VDOT, ritmos, zonas e previsões
/health           Saúde (?checkin=1 abre o check-in)
/calendar         Calendário de atividades
/friends          Amigos ─► /friends/[id] (perfil) · /friends/conquistas
/goals            Metas e estratégia
/analytics        Gráficos — abas: Volume · Pace · FC · Longões · Evolução
/settings         Configurações
/offline          Fallback do service worker
/dev/*            Só fora de produção
```

## 7.2 Tela a tela

### Dashboard `/`
- **Objetivo:** abrir o app e saber o que fazer hoje, como está a semana e o corpo.
- **Componentes (ordem aproximada):**
  1. Saudação com data.
  2. `TodayCard` (herói: sessão, passos, porquê, anel de recuperação, troca, check-in).
  3. `SetupChecklist`, `NotificationNudge`, `TestCalibrationCard`.
  4. Anel semanal com fantasma da semana passada e células por esporte.
  5. `WeeklyPlanSummaryCard`.
  6. `StatCard`s com `CountUp`.
  7. `WeeklyVolumeChart`, `FitnessCard`, `OvertrainingAlert`, `CycleSummaryCard`, `TargetRaceCard`, `PersonalRecordsCard`, `AchievementsCard`, `CalorieDetailModal`.
  8. `TrainingDayFilter`.
  9. `AutoStravaSync` + `AutoWellnessSync` (invisíveis).
- **Fluxo:** Server Component carrega perfil, plano, recuperação (`loadRecoveryInputs`), testes e provas; o cliente carrega **todas as corridas** (ver dívida).
- **Dependências:** `/api/coach/today-swap`, `/api/strava/sync`, `/api/integrations/intervals/sync`.
- **Problemas conhecidos:**
  - Tela longa.
  - Carrega o histórico inteiro no cliente.
  - Duas fontes de "hoje" (plano e recuperação) calculadas em lugares diferentes, mas pelo mesmo carregador.
  - Em rAF bloqueado (aba oculta), anéis ficam vazios (não é bug do app).

### Treinador `/coach` — redesenhado em 4 fases (20–24/09)
- **Objetivo:** a semana, e só a semana. Quem quer calibrar vai para `/coach/calibracao`; quem quer configurar vai para Configurações.
- **Sem abas.** `CoachContent.tsx` (~156 linhas) tem cinco blocos, nessa ordem:
  1. **um** aviso por vez (`[&>*:not(:first-child)]:hidden`): teste faltando → teste velho → plano desatualizado → ajuste proativo → pergunta da semana → dias padrão;
  2. `WeeklyPlanCard` — a semana;
  3. `AdvisorCard` — o conselheiro;
  4. "Meus dias de treino" (disclosure) — `TrainingPrefsCard`, `SportSelector`;
  5. "Plano de longo prazo" (disclosure).
- **`WeeklyPlanCard` (fase 4):** cabeçalho + abas de semana · avisos (offline, erro, leitura da semana anterior, faixa do bloco com o recado da IA) · **agenda de 7 linhas à esquerda** (`WeekAgenda`) e **o dia aberto à direita** (colado na rolagem no computador) · cards por sessão: treino (séries atrás de "Ver as séries"; *Mover · Adaptar · Perguntar* no pé), musculação (resumo em uma linha, "Ver os exercícios", *Mover*) e descanso · conversa da semana, que **propõe e espera "Aplicar"**.
- **`/coach/calibracao`:** teste de 3 km, VDOT/VO₂máx, ritmos, zonas, zonas por esporte, previsões de prova, evolução do VDOT e histórico de testes.
- **Problemas:**
  - `WeeklyPlanCard.tsx` tem ~980 linhas e junta responsabilidades diferentes: carregar e trocar semanas, selecionar dias, mostrar sessões, mover/adaptar, conversar e confirmar propostas, e os estados de carregamento. A separação natural é cabeçalho · agenda · painel do dia · card de corrida · card de musculação · conversa — com uma fonte só para o plano, para não nascerem cópias desatualizadas do mesmo treino.
  - A agenda não mostra o que já foi feito (o card não recebe corridas nem atividades).

### Saúde `/health`
Descrita em 6.10. **Problemas:** Whoop e ponte nativa aparecem como opções sem uso; energia depende do Atalho.

### Corridas `/runs`, `/runs/[id]`, `/runs/new`, `/runs/[id]/edit`, `/runs/map`
Descritas em 6.7. **Problemas:** `RunDetailContent` mistura campos da v1 (hidratação, gel); a edição manual permite estados inconsistentes com o Strava.

### Provas `/races`
- **Objetivo:** cadastro, prova-alvo, resultado e análise.
- **Problemas:** convive com `/goals`, que tem o mesmo conceito.

### Metas `/goals`
Metas com cenários, sugestões por VDOT e estratégia por IA. **Problema:** duplicação com provas.

### Calendário `/calendar`
Mês de atividades e lançamento de academia.

### Amigos `/friends`, `/friends/[id]`, `/friends/conquistas`
- **Componentes:** `PageHeader` com ações, `FriendSummary`/`FriendStats`, `ChallengesCard`, `FriendsFeed` (kudos), `SuggestionsCard`, lista de pedidos, perfil com `FriendMuteToggle`.
- **Problema:** a página do perfil faz consultas com service role; a privacidade depende do código.

### Gráficos `/analytics`
5 abas e relatório mensal. Os estilos são os mais antigos (pré-redesenho).

### Configurações `/settings`
- **Seções:** Aparência e ajuda (tema, tutorial); Integrações (Strava + `WearableConnections` + histórico de sync); Notificações (`PushNotificationButton`, `NotificationPrefsCard`); Este dispositivo (`InstallPWAButton`); perfil (`EditProfileModal`); convites (admin); sair.

### Auth `/auth`, `/auth/reset`
Login e cadastro com código de convite, e reset de senha.

---

# 8. INTEGRAÇÕES

## 8.1 Strava ✅ (fonte principal de atividades)

- **Objetivo:** importar corridas e atividades automaticamente.
- **Autenticação:** OAuth 2.0 (`/api/strava/connect` → `/api/strava/callback`). Tokens em `strava_connections` (access, refresh, expiração, `athlete_id`) e refresh automático em `refreshStravaToken`. Envs `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`.
- **Endpoints usados:**
  - `GET /athlete/activities` (lista paginada);
  - `GET /activities/{id}` (detalhe, calorias);
  - `GET /activities/{id}/streams` (time, distance, heartrate, altitude, velocity_smooth, moving);
  - `POST/GET /push_subscriptions` (assinatura do webhook).
- **Sincronização:**
  - **webhook** (tempo real);
  - **auto-sync** ao abrir o app (20 min por dispositivo);
  - **cron** diário de 3 dias;
  - **sync manual** em Configurações.
- **Webhook:** `GET /api/strava/webhook` valida `hub.challenge` com `STRAVA_VERIFY_TOKEN`; `POST` processa create/update/delete.
- **Campos mapeados** (`stravaActivityToRun`): distância, tempos (movimento e total), velocidade, ritmo, FC média/máx, elevação, cadência, calorias, suffer score, polyline, dispositivo, `start_date_local` → `date`, `workout_type`/nome → `type`, JSON bruto.
- **Limitações:** 100 req/15 min e 1.000/dia no app todo; streams não vêm no webhook (buscados sob demanda); escopo pedido: `read,activity:read_all` (inclui atividades privadas).
- **Problemas conhecidos:**
  - **Eventos forjados são aceitos:** a rota não confere `subscription_id`, e um delete falso apaga corridas de qualquer usuário (dívida A9).
  - O comentário do webhook ainda diz "GPT-4o-mini".
  - Delete não afeta `activities`.
  - Análise por IA síncrona dentro do webhook (risco de timeout → Strava reenvia → dedupe salva).
- **Pendências:**
  - O app Strava está em modo de desenvolvimento? **(não verificado; o limite de atletas conectados de apps não aprovados é baixo)**.
  - Mover a IA para fora do webhook.

## 8.2 intervals.icu ✅ (ponte para o Garmin, 14/09)

- **Objetivo:** trazer HRV, FC de repouso, sono (duração e nota) e outros dados de bem-estar do Garmin.
- **Autenticação:**
  - chave de API pessoal do atleta, gerada em intervals.icu → Settings → Developer;
  - HTTP Basic com usuário literal `API_KEY` e senha = chave;
  - guardada em `intervals_connections.api_key`, lida só pelo servidor, e o GET de status nunca devolve a chave.
- **Endpoints:**
  - `GET https://intervals.icu/api/v1/athlete/{id}` (valida a chave e o nome);
  - `GET /api/v1/athlete/{id}/wellness?oldest=YYYY-MM-DD&newest=YYYY-MM-DD`.
- **Sincronização:**
  - na conexão: 365 dias;
  - rotina: 30 dias (ou 365 se há menos de 20 linhas);
  - disparos: `AutoWellnessSync` na montagem da página e ao voltar ao app (`visibilitychange`), com throttle de 5 min no servidor (`?force=1` ignora); cron `wellness-sync` diário (08:00 BRT); botão atualizar na Saúde.
- **Campos** (`intervals.ts#toWellnessRow`): só quatro viram coluna, e zeros e valores fora de faixa viram null:
  - `sleepSecs` → `sleep_seconds`;
  - `sleepScore` → `sleep_score`;
  - `hrv` (rMSSD) → `hrv_ms`;
  - `restingHR` → `resting_hr`.

  O resto vai para `raw` sem entrar no score: `readiness`, `sleepQuality`, `avgSleepingHR`, `hrvSDNN`, `stress`, `spO2`, `respiration`, `steps`, `weight`, `bodyFat`, `vo2max`, `kcalConsumed` etc. A escrita é feita por `wellness-upsert.ts`.
- **Limitações:**
  - Não traz calorias do dia.
  - Body Battery e estágios de sono não chegam do Garmin via intervals.icu (verificado com dados de Sérgio).
  - O intervals.icu pede **OAuth para apps multiusuário**; a chave pessoal é provisória.
  - Cada atleta precisa criar conta no intervals.icu e ligar ao Garmin.
- **Problemas conhecidos:**
  - Noites sincronizadas pelo Garmin **antes** de conectar ao intervals.icu nunca chegam (nem com "Download old data").
  - O endpoint web `/api/athlete/...` com sessão do navegador devolve `[]` e engana. Depure sempre pelo servidor com a chave.
  - O "peso" diário é a configuração do perfil Garmin.
- **Pendências:** OAuth do intervals.icu; validar `readiness` do intervals contra o Training Readiness do Garmin antes de usar.

## 8.3 Atalho do iPhone / Apple Saúde ✅ (calorias; sono como alternativa)

- **Objetivo:** calorias ativas e em repouso do dia (e sono, para quem não usa intervals.icu).
- **Autenticação:** `profiles.wellness_token` (gerado em `/api/health/wellness-token`) na URL/corpo do Atalho → `POST /api/ingest/wellness` (público no middleware).
- **Formato:**
  - Token no corpo (`token`) ou em `Authorization: Bearer`.
  - Um dia ou lote (`days[]`).
  - `source`: padrão `ios_shortcut`.
  - `date`: padrão = hoje no fuso do atleta.
  - Campos: `active_kcal` (0–15.000), `resting_kcal` (0–5.000), sono em `sleep_seconds`, `sleep_minutes` ou `sleep_hours`, `sleep_score`, `hrv_ms`, `hrv_status`, `resting_hr`, `stress_avg`, `body_battery`.
  - `num()` aceita vírgula decimal e trata string vazia/null como ausente; fora de faixa vira null.
- **Sincronização:** automação pessoal do iPhone (ex.: 22h e ao abrir o app). Guia passo a passo em `AppleHealthSyncCard` (calorias, sono via Apple Saúde e Apple Watch).
- **Limitações:**
  - Depende de o usuário montar o Atalho.
  - Sem Android.
  - O Garmin não escreve HRV na Apple Saúde.
  - Com token vazado, qualquer um grava.
- **Pendência:** rotação/expiração do token.

## 8.4 Whoop ⚪
- **Autenticação:** OAuth 2 (`WHOOP_CLIENT_ID`/`SECRET`), `whoop_connections`.
- **Dados:** API v2, recovery/sleep/cycle → `recovery_score`, `hrv_ms`, `resting_hr`, sono.
- **Estado:** nunca ativado. Mapeamento testado com payloads de exemplo; nunca rodou contra a API real.

## 8.5 Garmin ❌ (não integrado diretamente)
- **Health API/Activity API/Training API:** programa fechado a novos apps desde 2026 (verificado em 14/09). Nada foi submetido.
- **Arquivo `.FIT`:** único ponto de contato "para o Garmin" (export manual).

## 8.6 Groq (LLM) ✅
- API compatível com OpenAI, `https://api.groq.com/openai/v1/chat/completions`, `Authorization: Bearer GROQ_API_KEY`.
- **Detalhes na seção 9.**
- **Limitações:** limites de taxa do plano (não medidos); falhas viram `null` silencioso.

## 8.7 Web Push (VAPID) 🟡
- `web-push` com `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_EMAIL` (sanitização de BOM/assunto inválido em `push.ts`).
- Inscrição por dispositivo em `push_subscriptions`; `public/sw.js` exibe e abre a URL.
- Diagnóstico em `/api/admin/push-diagnose`.
- **Problema:** 4 de 7 usuários recebem. No iOS é preciso instalar a PWA e aceitar dentro dela.

## 8.8 Supabase pg_cron + pg_net + Vault ✅
- Job `limiar-morning` chama `/api/cron/morning` com Bearer lido do Vault (`limiar_cron_secret`).
- Criado pelo SQL Editor em 14/09. **Não está em nenhuma migration** (ver 18).

## 8.9 Outros
- **OpenStreetMap/Leaflet:** mapas; tiles públicos sem chave (sujeito à política de uso do OSM).
- **free-exercise-db (GitHub/jsDelivr):** 240 exercícios selecionados do repositório (domínio público), importados para `exercise-catalog.ts`; as imagens são carregadas do CDN.
- **Vercel:** hospedagem e crons (seção 18).
- **OpenAI:** `OPENAI_API_KEY` existe na Vercel e **não é usada** em lugar nenhum.

---

# 9. IA

## 9.1 Papel da IA no produto (a regra mais importante)

**A IA não prescreve nada numérico.** Volume, sessões, ritmos, FC, recuperação, recordes, macro-plano, conselheiro e troca de treino são **código determinístico e testado**. A IA faz três coisas:

1. **Narrar:** nota da semana, análise da corrida, análise pós-prova, dica de dieta. *(O resumo semanal saiu da IA em 17/09: a devolutiva é determinística — ver 6.28.)*
2. **Traduzir linguagem natural em estrutura validada:** edições do plano pelo chat, notas de memória.
3. **Redigir documentos longos:** análise completa, estratégia de prova.

Essa regra nasceu da Fase B (ver seção 2): o plano gerado por LLM era inconsistente, quebrava a tela com JSON inválido e não podia ser auditado.

**Há três exceções vivas que violam a regra** e são dívida técnica:
- `generateStructuredWeeklyPlan` no cron `weekly-report`;
- `adjustWeeklyPlanProactive` no botão de ajuste proativo;
- ritmos por faixa na estratégia de prova.

## 9.2 Provedor, modelo e parâmetros

| Item | Valor |
|---|---|
| Provedor | Groq (API compatível com OpenAI), `fetch` puro, sem SDK |
| URL | `https://api.groq.com/openai/v1/chat/completions` |
| Modelo | `openai/gpt-oss-120b` (constante `MODEL` em `src/lib/ai.ts`; sobrescrevível por `GROQ_MODEL`) |
| Histórico | GPT-4o-mini (maio) → `llama-3.3-70b-versatile` (jun–ago) → `openai/gpt-oss-120b` (desde 16/08/2026, quando a Groq aposentou o Llama) |
| `reasoning_effort` | `"low"`, **enviado só para modelos de raciocínio** (`supportsReasoningEffort`: `openai/gpt-oss*`, `qwen/qwen3*`, `deepseek-r1*`). Com esforço padrão, o modelo gastou 198 de 200 tokens pensando e devolveu 3 caracteres. Modelo que não raciocina devolve 400 se receber o parâmetro |
| `temperature` | 0,7 em `callGroq` (todas as funções de `ai.ts`, **inclusive as que exigem JSON**); 0,65 em `full-analysis` |
| `max_tokens` | Varia por função (tabela 9.3) |
| Formato | `messages: [system, user]`; **não usa `response_format: json_object`**, tools nem streaming |
| Falha | `callGroq` devolve `null` em qualquer erro (chave ausente, HTTP ≠ 200, exceção). Cada feature degrada em silêncio |
| Chave | `GROQ_API_KEY`, com remoção de BOM (U+FEFF). Um pipe do PowerShell já injetou BOM na variável e derrubou tudo |
| Rejeitado | `qwen/qwen3.6-27b`: escreve `<think>` dentro de `content` e quebraria todos os `JSON.parse` |

## 9.3 Inventário de chamadas

| # | Função (arquivo) | Quem chama | Saída | max_tokens | Contexto enviado | Estado |
|---|---|---|---|---|---|---|
| 1 | `analyzeRun` (`ai.ts`) | Webhook do Strava (cada corrida nova), `/api/strava/sync` (3 mais recentes), `/api/runs/[id]/analyze` | Prosa, 3–5 parágrafos → `runs.coach_feedback` | 600 | Detalhes da corrida + **histórico completo** de corridas (1 linha por corrida) | ✅ |
| 2 | ~~`generateWeeklySummary`~~ | — | — | — | — | ❌ removida em 17/09 (devolutiva determinística) |
| 3 | ~~`generateStructuredWeeklyPlan`~~ | — | — | — | — | ❌ fora do cron em 17/09; o plano vem do motor |
| 4 | `adjustWeeklyPlanProactive` | `/api/coach/weekly-plan/adjust` | JSON dos dias restantes + mensagem | 1000 | Plano, adesão por dia, TSB, dia de hoje | ⚠️ viola 9.1 e a trava de semana |
| 5 | `processPlanFeedback` | `/api/coach/weekly-plan/chat` | JSON `{edits[], message}` → `applyPlanEdits` | 1500 | Plano (JSON enxuto), 5 corridas, notas, 6 últimas mensagens | ✅ |
| 6 | `extractAthleteNotes` | Chat (após cada troca) | JSON `[{category, content}]` → `athlete_notes` | 300 | Mensagem do atleta + resposta | ✅ |
| 7 | `generateCoachNote` | `ensureWeeklyPlan` | Prosa 2–3 frases → `ai_message` | 220 | Fase, volume planejado/recente, VDOT, prova, notas | ✅ |
| 8 | `generateRaceAnalysis` | `race-analysis.ts` (`/api/races/[id]/analysis`) | JSON `{summary, what_worked, what_to_improve, next_cycle_focus}` | 1200 | Tempo real × previsto × alvo, VDOT antes e implicado, FC, splits, preparação | ✅ |
| 9 | `generateRaceStrategy` | `race-strategy.ts` (`/api/goals/strategy`, cron D-14/D-3) | JSON `{title, scenario, target_time_seconds, strategy_text, hydration_plan, gel_plan, splits[]}` → `race_strategies` | 1400 | Prova, alvo, previsão, VDOT, volume, maior longão recente, resumo | 🟡 ritmos vêm da IA |
| 10 | `generateDietTip` | `/api/health/diet-tip` | Prosa 2–3 frases | 250 | Treino de hoje, objetivo, meta kcal, carbo | ✅ |
| 11 | `callGroq` local (`src/app/api/coach/full-analysis/route.ts`) | Botão "Análise completa por IA" | Prosa longa em 6 seções → `coach_reports` (`general`) | 1500 | Testes, métricas atuais, 60 corridas de 90 dias, distribuição de zonas (**LTHR 0,925**), academia, metas | 🟡 duplica `callGroq`; pode contradizer o plano |
| 12 | `generateMacroPlan` | ninguém | — | 3000 | — | ⚪ código morto (substituído por `macro-builder.ts`) |
| 13 | `adaptMacroPlan` | ninguém | — | 2500 | — | ⚪ código morto |

## 9.4 System prompts (resumo fiel; o texto integral está em `src/lib/ai.ts`)

- **analyzeRun:**
  - "treinador de corrida experiente, analítico e direto, trabalhando com um corredor intermediário brasileiro";
  - usar o histórico para padrões;
  - 3–5 parágrafos curtos, sem introdução;
  - foco em qualidade do esforço, comparação com similares, tendência, um ponto de atenção, uma recomendação prática.
  - ⚠️ Assume "intermediário" para todo usuário.
- **generateWeeklySummary:** treinador com histórico e dados de força, "considere a fadiga acumulada de ambos"; estrutura em 4 partes (balanço × histórico, tendência, atenção, plano da próxima semana). ⚠️ "Plano para a próxima semana" em prosa pode contradizer o motor.
- **generateStructuredWeeklyPlan:**
  - "RESPONDA SOMENTE com um objeto JSON válido" + schema completo;
  - regras: 7 dias; **domingo sempre descanso**; esporte obrigatório e da lista do atleta; musculação 2–4×; corrida ≤3×; natação/ciclismo 1–2×; taper se houver prova; `structure` só para qualidade e longão.
  - Essas regras **divergem do motor** (o motor respeita os dias do atleta e não força domingo de descanso).
- **adjustWeeklyPlanProactive:** replanejar **só** de hoje a domingo; "NUNCA tente compensar tudo, priorize segurança"; domingo descanso; TSB < −20 reduz; treino-chave perdido pode mover 1×; manter musculação; ≤3 corridas na semana. O código ainda força domingo = descanso como rede de segurança.
- **processPlanFeedback:**
  - "Você é o tradutor de pedidos de um treinador… converte em EDIÇÕES ESTRUTURADAS. Você NÃO escreve o plano."
  - Edições permitidas: `set_distance`, `set_rest`, `swap_days`, `scale_week`.
  - "NUNCA prometa no message uma mudança que não esteja em edits."
  - O código **reescreve a confirmação** a partir de `applyPlanEdits` (`changes` e `rejected`) e ignora o texto do modelo quando houve mudança.
- **extractAthleteNotes:** extrator com categorias `injury`, `preference`, `availability`, `goal`, `observation`; só fatos novos, específicos e acionáveis; máximo 3; `[]` se nada.
- **generateCoachNote:** "NÃO prescreva treinos, distâncias ou ritmos"; explicar a intenção da fase + ponto de atenção; sem markdown, emojis ou listas.
- **generateRaceAnalysis:** "Use os NÚMEROS fornecidos. Não invente dados"; positive split → dizer e ligar à causa provável; direto, nunca condescendente; foco do próximo ciclo acionável.
- **generateRaceStrategy:** ritmos pelo condicionamento atual, não por desejo (alvo irreal → conservador); splits contíguos em 3–6 faixas; negative split padrão; mais conservador com pouco volume; géis a cada 35–45 min acima de 75 min.
- **generateDietTip:** "nutricionista esportivo"; uma dica de timing e escolhas, não de contagem; lembrar que não substitui profissional "só se relevante".
- **full-analysis:** "treinador de corrida especialista"; 6 seções: nível e evolução; distribuição de zonas; pontos fortes; gargalo; **plano detalhado para as próximas 8 semanas**; previsões.

## 9.5 Contexto, memória e processamento

- **Memória do atleta:** `athlete_notes`, extraídas do chat (`extractAthleteNotes`) e de padrões do cron semanal (`patterns.ts#detectPatterns`, `source='pattern'`).
  - Viram texto `[categoria] conteúdo` (até 30 notas ativas) e entram nos prompts de plano, nota da semana, chat e ajuste.
  - A tela Treinador → Perfil IA (`AthleteProfileCard`) permite ver, adicionar à mão e desativar notas (`/api/coach/memory`: GET, POST, DELETE com soft delete via `active=false`).
  - **Não há resumo, deduplicação semântica nem expiração.**
- **Histórico do chat:** `coach_chat_messages`; as últimas 6 mensagens entram no prompt.
- **Structured outputs:** por instrução no prompt + `replace(/^```json/…)` + `JSON.parse` em `try/catch`. Validação posterior:
  - `normalizeWeeklyPlanDays` (sempre 7 dias bem formados, tipo válido, esporte inferido);
  - `normalizePlanEdits` (whitelist de edições);
  - filtros de categoria nas notas;
  - cenário da estratégia com fallback `balanced`;
  - `splits` filtrados.

  **Sem schema formal (zod), sem retry, sem `response_format`.**
- **Tools/function calling:** não usamos.
- **Síncrono:** todas as chamadas rodam dentro do request (webhook, rota ou cron). Não há fila; a análise de corrida no webhook aumenta a latência da resposta ao Strava.
- **Observabilidade:** só `console.error` nos logs da Vercel. Nenhum registro de tokens, latência ou taxa de falha.

## 9.6 Limitações conhecidas

1. **Contexto sem limite:** `analyzeRun` e `generateWeeklySummary` mandam **todas** as corridas do atleta. Com centenas de corridas, são milhares de tokens por chamada. O comentário no topo de `ai.ts` ("janela de 128k comporta centenas") vem da era do Llama e desconsidera custo e latência.
2. **Temperatura 0,7 para JSON** aumenta a chance de saída inválida (não medido).
3. **Falha silenciosa:** o usuário vê "sem análise" e ninguém é alertado.
4. **Persona fixa:** "corredor intermediário brasileiro" para todos.
5. **Prompts com regras de treino** (domingo descanso, ≤3 corridas) que não refletem mais o motor.
6. **Comentários desatualizados:** topo de `ai.ts` fala em "Llama 3.3 70B"; webhook fala em "GPT-4o-mini".
7. **Duplicação:** `full-analysis/route.ts` reimplementa `callGroq`.

## 9.7 Custos

- **Não medido.** Não há registro de uso de tokens no app e **não verifiquei o plano/fatura da conta Groq**.
- **Estimativa grosseira (não verificada):** uma linha de corrida em `fmtRun` tem ~25–35 tokens. Um atleta com 150 corridas gera ~5 mil tokens de entrada por `analyzeRun`. Com 7 usuários, o volume é baixo; o risco é de **escala** (custo por corrida importada cresce linearmente com o histórico) e de **limite de taxa** da Groq em sync em lote.
- **Env órfã:** `OPENAI_API_KEY` configurada na Vercel e sem uso.

## 9.8 Decisões de IA (resumo; ADRs na seção 11)

- Groq pelo custo e latência → `gpt-oss-120b` por JSON limpo e português bom.
- IA fora da prescrição.
- Chat como tradutor de edições.
- Falhar para `null` em vez de derrubar a tela.
- Modelo sobrescrevível por env para a próxima aposentadoria virar redeploy.

---

# 10. LÓGICA DE SAÚDE E PERFORMANCE

> Todas as fórmulas abaixo estão em funções puras com testes em `tests/`. Base científica comentada em `TRAINING_SCIENCE.md`.

## 10.1 VDOT (Daniels & Gilbert) — `src/lib/performance.ts`

Para um esforço de distância `D` (m) em `T` minutos, com velocidade `v = D/T` (m/min):

```
VO2(v)       = −4,60 + 0,182258·v + 0,000104·v²            (custo de O2, ml/kg/min)
%VO2max(T)   = 0,8 + 0,1894393·e^(−0,012778·T) + 0,2989558·e^(−0,1932605·T)
VDOT         = VO2(v) / %VO2max(T)
```

- **Velocidade para um VO2 dado** (inversa): `v = (−b + √(b² + 4a·(VO2 + 4,60))) / 2a`, com `a = 0,000104`, `b = 0,182258`.
- **Tempo de prova previsto** (`danielsRaceTime(vdot, metros)`): bissecção (200 iterações, entre 30 s e 12 h) até `VO2(D/T) / %VO2max(T) = vdot`.
- **Riegel** (alternativa em `predictRaceTimes`): `T2 = T1 × (D2/D1)^1,06`.

## 10.2 Ritmos de treino — `buildTrainingPaces(vdot)`

| Ritmo | Faixa | Âncora |
|---|---|---|
| Regenerativo | 59%–65% VO2max | Fisiológica (inversa do custo de O2) |
| Fácil | 65%–74% VO2max | Fisiológica |
| Maratona | previsão de maratona ×1,02 a ×0,98 | Tempo de prova |
| Limiar | pace a `%VO2max(60 min)` ×1,015 a ×0,985 | "O que se sustenta por uma hora" |
| Intervalo | pace de 5 km a pace de 3 km | Tempo de prova |
| Repetição | pace de 1.500 m a ×0,96 | Tempo de prova |

A versão anterior multiplicava vVO2max por percentuais. O fácil ficava 29 s/km lento e o regenerativo virava caminhada. **Não volte a ela.**

## 10.3 FC: LTHR, FC máx e zonas (Friel) — `performance.ts`

```
LTHR   = round( min( FCmédia_teste × 0,95 , FCmáx_teste × 0,92 ) )   (sem FC máx: só o primeiro termo)
FCmáx  = FC máx medida, se existe; senão FCmédia / 0,95
Z1: 0 … round(0,81·LTHR) − 1
Z2: Z1+1 … round(0,89·LTHR)
Z3: Z2+1 … round(0,93·LTHR)
Z4: Z3+1 … LTHR − 1
Z5: ≥ LTHR
```

- As zonas são **contíguas por construção**. Com percentuais independentes, 148 bpm caía fora de todas as zonas.
- ⚠️ `full-analysis/route.ts` usa `LTHR = FCmédia × 0,925` e zonas **não contíguas**. Está inconsistente.
- No motor de treino, `hrFor(intensidade, lthr)` mapeia E/M/T/I/R para faixas dessas zonas.

## 10.4 Carga de treino — `src/lib/training-load.ts`

**TSS por corrida** (horas = tempo em movimento), na primeira forma disponível:
1. Com FC média e LTHR: `TSS = h × (FC/LTHR)² × 100`.
2. Com ritmo e ritmo de limiar: `TSS = h × (ritmo_limiar / ritmo)² × 100`.
3. Por tipo: `TSS = h × IF² × 100`, com IF: recovery 0,60 · easy 0,70 · long_run 0,75 · steady 0,80 · progression 0,85 · tempo 0,90 · intervals 0,97 · race 1,00 · other 0,70.

**Médias exponenciais diárias** (pré-aquecidas 42 dias antes da janela):
```
K_CTL = 1 − e^(−1/42) ≈ 0,0235      CTL_d = CTL_{d−1} + K_CTL·(TSS_d − CTL_{d−1})   "Fitness"
K_ATL = 1 − e^(−1/7)  ≈ 0,1335      ATL_d = ATL_{d−1} + K_ATL·(TSS_d − ATL_{d−1})   "Fadiga"
TSB_d = CTL_d − ATL_d                                                               "Forma"
```

**Rótulos de TSB:** >15 muito descansado · >5 descansado · >−5 equilíbrio · >−20 em treinamento · >−35 fatigado · ≤−35 overreaching.

**Overtraining** (`overtraining.ts`): `ACWR = ATL/CTL` (faixa ideal 0,8–1,3; alerta ≥1,3; risco ≥1,5), mais sinais de TSB, monotonia e salto de volume.

⚠️ **Só corridas geram TSS.**

## 10.5 Volume semanal — `src/lib/workout-builder.ts`

**`planWeeklyVolume(recentes[4], {weekIndex, phase, provenWeeklyKm, raceAhead})`:**
```
treinadas  = semanas recentes com ≥ 3 km
vazias     = 4 − treinadas               → só UMA semana vazia é perdoada; as demais contam como 0
consideradas = se há 4 valores: as 3 maiores (descarta a mais leve); senão todas
base       = média(consideradas)
             | sem nada e com capacidade comprovada: max(3, 0,6 × comprovada)
             | sem nada: 20 km
taper                         → round(base × 0,55)
weekIndex>0 e weekIndex%4==3  → round(base × 0,70)      (semana 4 do bloco, só se "merecida")
volta de pausa (base < 0,9 × comprovada):
     retorno = min(0,6 × comprovada, 2 × base)
     subida  = raceAhead ? 1,2 : 1,1
     → round( min( max(base × subida, retorno), comprovada ) )
normal → round( min( base × (raceAhead ? 1,10 : 1,05), base + 8 ) )
```

- **Capacidade comprovada** (`provenCapacity`): a melhor média móvel de 4 semanas do histórico (ou a melhor semana, se não há 4); maior corrida já feita.
- **Semana de recuperação merecida** (`mesocycle.ts#recoveryApplies`): alguma das 3 últimas semanas ≥ 60% da base. `cutbackWeekIndex(posição, merecida)` só passa `weekIndex` quando é a semana 4 **e** merecida. Antes de 13/09, um `+1` fazia a semana 3 cair.

**`volumeWithRatchet(proposto, {previousPlannedKm, previousActualKm, lighterByDesign, raceAhead, alreadyPlannedThisWeekKm})`:**
```
piso_hoje = já prometido nesta semana (semana em andamento nunca encolhe)
sem semana anterior ou semana leve por design → proposto
executado < 34% do planejado anterior → proposto (atleta parou; não é "semana ruim")
cumprimento ≥ 100% → max(proposto, raceAhead ? executado×1,05 : executado)
cumprimento ≥ 90%  → max(proposto, planejado_anterior)
senão              → max(proposto, round(executado))
```

**Distribuição** (`distributeWeeklyVolume`):
```
qualidade   = parcela da sessão de qualidade (ver 10.6)
resto       = semana − qualidade
unidade     = resto / (dias_leves + 1,8)
longão      = unidade × 1,8, limitado a
              [ max(22% semana, …) ; teto 60% (2 corridas) | 45% (3) | 38% (4) | 33% (5+) ]
longão      ≥ 5 km ; ≥ min(0,45 × maior_longão_já_feito , 0,5 × semana)
              ≥ longão mínimo pedido, se o histórico já tem essa distância
leves       = (resto − longão) / dias_leves, respeitando o mínimo por corrida (padrão 5 km),
              que cede antes de estourar o total semanal
```

**Sessões:**
- **Leve:** `max(3, arred0,5(km))`.
- **Longão:** base 26% da semana (peak 30%, taper 20%); ≤1,2× a prova-alvo se < 42 km; em build/peak com ≥10 km, últimos 3 km em ritmo M.
- **Qualidade:**
  - Intervalos: volume em I ≤ min(8% semana, 10 km).
  - Repetições: R ≤ min(5% semana, 8 km), 6–12 × 200 m com 2 min.
  - Subidas: 6–12 × 45 s (≈ semana/3).
  - Fartlek: 4–10 × 2 min T / 2 min E.
  - Aquecimento: `max(1,5, 6% semana)`; desaquecimento: `max(1, 4% semana)`.
  - A recuperação trotada é somada à distância (`recoveryKm`).
- **Teste de 3 km:** aquecimento ≥2 km + 3 km T + desaquecimento ≥1 km.

## 10.6 Mesociclo — `src/lib/mesocycle.ts`

```
âncora      = segunda-feira da 1ª corrida do atleta
semanas     = (segunda_da_semana − âncora) / 7
semana_bloco = (semanas % 4) + 1 ; bloco = floor(semanas/4) + 1 ; recuperação = semana_bloco == 4
cardápio    = [intervalos, limiar, repetições, intervalos_densos, subidas, fartlek, progressivo]
qualidade(semana_bloco, bloco) = semana 4 → strides
                               ; senão cardápio[ ((bloco−1)×3 + semana_bloco − 1) % 7 ]
repBonus(bloco) = min(2, max(0, bloco − 1))       (repetições extras em blocos seguintes)
fase peak/taper → sempre limiar
teste devido e semana_bloco == 1 → teste substitui a qualidade
```

**Trava:** `regenerationTarget(weekStart, hoje, semanaSemPlano)` → se a semana já começou (`segunda ≤ hoje`) e tem plano, **não regenera**; sugere a semana seguinte.

## 10.7 Status do teste — `src/lib/test-status.ts`

- **Estados:** `missing` · `no_hr` (ritmos sim, zonas não) · `fresh` (<8 sem) · `aging` (8–16 sem) · `stale` (16+ sem).
- **Liberações:** ritmos e previsões precisam de teste; zonas de FC e conselheiro precisam de teste com FC.
- **Agendamento no plano:** `nudge ≠ none` **e** semana 1 do bloco.

## 10.8 Recuperação (Limiar Score) — `src/lib/readiness.ts`

> ⚠️ **Modelo revisto em 16/09/2026 (opção A, `docs/readiness-garmin.md`).** Mudou: pesos (fabricante/Garmin 0,25 · sono 0,25 · **sono das últimas noites 0,10** · HRV 0,20 · FC repouso 0,10 · forma 0,20 · dor 0,10 · RPE 0,05); **teto por noite curta** (< 4 h 30 → máx. 40; < 5 h 30 → máx. 60); com relógio, **sinal central ausente conta como neutro 50** em vez de renormalizar; cobertura exibida ("3 de 4 sinais"); base da FC de repouso passou a **mediana**; a forma inclui **musculação e outros esportes** (`activityTSS`). Opcional (B): número do Garmin informado pelo atleta entra no espaço do fabricante. A tabela abaixo descreve o modelo **anterior** e fica como histórico.

**Componentes** (cada um de 0 a 100; entram só os disponíveis e **os pesos são renormalizados** pela soma dos presentes):

| Componente | Peso | Fórmula |
|---|---|---|
| Recuperação do fabricante (`body_battery` ?? `recovery_score`) | 0,30 | valor direto |
| Sono | 0,22 | `sleep_score` do relógio; senão duração: 7,5–9 h → 100 · ≥6,5 → 80 · ≥5,5 → 55 · ≥4,5 → 35 · >9,5 → 85 · resto → 20. Manual: `0,6×duração + 0,4×((qualidade−1)/4×100)` |
| HRV | 0,18 | `hrv_status` (balanced 92 / unbalanced 55 / low 30 / poor 25) ou razão hoje/base: ≥0,95 → `85 + (r−0,95)×100`; ≥0,85 → `60 + (r−0,85)×250`; ≥0,75 → `35 + (r−0,75)×250`; senão `15 + max(0, r−0,60)×133`. **Base = mediana, exige ≥7 noites** |
| FC de repouso | 0,10 | `Δ = FCR − base`; `90 − max(0,Δ)×6 + max(0,−Δ)×2`. **Base = média, exige ≥3 dias** |
| Forma (TSB) | 0,20 | TSB ≥10 → 100; ≤−30 → 15; entre os dois: `15 + ((TSB+30)/40)×85` |
| Dor muscular (check-in 1–5) | 0,10 | `(5 − dor)/4 × 100` |
| Esforço de ontem (RPE 1–10) | 0,06 | `100 − max(0, RPE−3)×8,5` |

```
score    = Σ (score_i × peso_i / Σ pesos presentes)
veredito = score ≥ 70 → "alta" ; ≥ 45 → "moderada" ; senão "baixa"
fonte    = relógio / manual / misto / nenhuma
```

- **Base da época** (`health-view.ts#readinessOn`): as bases usam as linhas dos 30 dias **anteriores** à data julgada (exclui a própria noite). O histórico de 14 dias é recalculado dia a dia com as bases de cada época.
- **Base do score** (`recovery-today.ts`):
  - "Relógio + carga" se há componente automático além do TSB;
  - "Relógio calibrando · faltam N noites" se há HRV mas menos de 7 noites de base;
  - "Check-in + carga";
  - "Só carga de treino";
  - "Sem dados".
- **Pede check-in** quando não há relógio, não está calibrando e não há check-in hoje.
- `health_checkins.energy` **não entra**.

## 10.9 Sinais vitais contra a média — `src/lib/health-view.ts`

```
base (vital) = mediana dos valores dos 30 dias anteriores à data (≥ 3 leituras), excluindo a própria data
calibrando   = menos de 7 leituras na base
Sono  (horas): ≥7 bom · ≥6 atenção · <6 alerta            (piso absoluto, independe do hábito)
HRV   (% vs base): ≥+3% bom · ≥−7% neutro · ≥−15% atenção · pior alerta
FCR   (Δ bpm vs base): ≤−1 bom · ≤+2 neutro · ≤+5 atenção · pior alerta
Meta de sono: 7,5 h (SLEEP_TARGET_H)
Tendência: média de recuperação dos últimos 7 dias × 7 anteriores (≥3 dias pontuados em cada)
```

⚠️ **Inconsistência:** a FCR do **score** usa a **média** dos 30 dias anteriores (`restingHrBaseline`); a do **card de vitais** usa a **mediana** dos mesmos 30 dias. Com um valor atípico, o tile e o score podem discordar.

## 10.10 Conselho e troca — `health-view.ts#sessionAdvice`, `session-swap.ts`

**Sessões duras:** intervalos, limiar, teste, prova, HIIT, longão. Prova nunca é trocada.

**Treino já feito** → "Treino de hoje feito" + orientação para o resto do dia + amanhã. Caso contrário, a tabela abaixo:

| Veredito | Dia duro | Dia leve | Força | Descanso |
|---|---|---|---|---|
| alta | "Pronto para treinar forte" · faça como planejado | "Corpo recuperado" · leve de verdade | siga o plano | aproveite |
| moderada | "Treine, mas com margem" · limite de baixo das faixas, encerre se pesar | leve de verdade | siga | descanso |
| baixa | "Dia de priorizar recuperação" · troque por 30–40 min leve ou passe para amanhã | encurte ou descanse | reduza carga / mobilidade | "o corpo concorda" |

**Oferta de troca:**
- **Leve:** veredito ≠ alta, sessão dura e não feita. Vira `max(4, round(km × 0,5))` km no ritmo fácil.
- **Amanhã:** amanhã é leve/descanso e sem troca; depois de amanhã não é duro; hoje não é domingo.

## 10.11 Energia e nutrição — `src/lib/nutrition.ts`

```
TMB (Mifflin-St Jeor) = 10·peso + 6,25·altura − 5·idade + (M: +5 | F: −161)
TMB do dia  = mediana de resting_kcal dos 14 dias anteriores, só valores em [0,75; 1,5] × TMB_fórmula
              (senão TMB_fórmula)
ativo_est   = 0,2 × TMB + kcal_treino (corridas + atividades do dia)
ativo       = max(ativo_est, active_kcal medido hoje)
gasto (TDEE)= TMB + ativo                    (sem dados: TMB×1,2 + treino = tdeeForDay)
meta        = TDEE + (cut −400 | maintain 0 | gain +300)
proteína    = 1,8 g/kg ; gordura = 25% das kcal / 9 ; carbo = resto / 4
combustível em treino: > 75 min → 50 g/h (leve) | 75 g/h (prova); gel ≈ 25 g
```

## 10.12 Execução, adesão e eficiência

- **Adesão** (`plan-adherence.ts`):
  - Dia de corrida: `feito/planejado ≥ 0,8` → feito · `> 0,25` → parcial · algum km → parcial · nada → perdido.
  - Dia de força: qualquer academia ou corrida → feito.
  - Hoje nunca é "perdido".
  - `% = (feitos + 0,5 × parciais) / dias pontuados`.
- **Previsto × executado** (`workout-execution.ts`): lê a faixa de ritmo do texto (`parsePaceRange`), compara com os splits em tempo de movimento e calcula consistência dos splits (`splitConsistency`) e padrão (saiu rápido, rodagem forte, tiros desabaram), que alimenta o conselheiro.
- **Eficiência aeróbica** (`aerobic-efficiency.ts`): em corridas fáceis (easy, recovery, steady, long_run), velocidade por batimento ao longo de até 12 semanas.
- **Best efforts** (`best-efforts.ts`):
  - Janela de dois ponteiros sobre `distance`/`time` dos streams, com **tempo total**; menor tempo para cobrir exatamente a distância, com interpolação.
  - Descarta velocidades > 12,5 m/s.
  - A atividade inteira substitui o best effort se a distância está entre 0,995 e 1,05 da alvo.

## 10.13 Fuso horário

- Todo "hoje" e "esta semana" usa **BRT fixo (UTC−3)** (`week.ts#toAthleteTime`, `plan-notify.ts#brtDateStr`).
- Não há fuso por usuário.
- ⚠️ Alguns caminhos de servidor ainda usam `localDateStr(new Date())`, que no servidor é UTC. Exemplo: a trava de regeneração em `weekly-plan.ts`. Entre 21:00 e 00:00 BRT de domingo, o servidor já considera segunda-feira **(efeito exato não verificado)**.

---

# 11. DECISÕES IMPORTANTES (ADR)

> Formato: DECISÃO / MOTIVO / ALTERNATIVAS / TRADE-OFF / AINDA FAZ SENTIDO? (a última é opinião minha)

### ADR-01 — Next.js App Router + Supabase + Vercel
- **Decisão:** um monólito Next.js (páginas + API) na Vercel, com Supabase para banco, auth e RLS.
- **Motivo:** velocidade de construção por uma pessoa + IA, plano gratuito e auth pronto.
- **Alternativas:** backend separado (Node/Python) + SPA; Firebase; app nativo.
- **Trade-off:** crons limitados a 1×/dia no Hobby; lógica pesada em funções serverless; acoplamento ao Supabase.
- **Ainda faz sentido?** Sim para o estágio atual. Revisar ao passar de dezenas de usuários ativos ou precisar de filas.

### ADR-02 — Motor determinístico prescreve; IA só narra
- **Decisão:** todo número do plano sai de funções puras (Daniels/Friel); LLM só escreve texto e traduz pedidos.
- **Motivo:** planos de LLM eram vagos, inconsistentes, inauditáveis e quebravam a UI.
- **Alternativas:** LLM com JSON schema; LLM + validação; híbrido com LLM escolhendo sessões.
- **Trade-off:** menos "criatividade" e flexibilidade conversacional; muito código de regra para manter.
- **Ainda faz sentido?** **Sim, é o diferencial do produto.** Falta aplicar a regra às 3 exceções vivas (9.1).

### ADR-03 — Teste de 3 km como calibração única
- **Decisão:** VDOT, ritmos, LTHR e zonas saem do último teste de 3 km.
- **Motivo:** protocolo simples, reprodutível, do treinador humano original de Sérgio.
- **Alternativas:** estimar por corridas do Strava; teste de 30 min (Friel); FC máx por idade.
- **Trade-off:** sem teste o app fica "sem ritmos"; 4 de 6 atletas nunca testaram antes do teste entrar no plano.
- **Ainda faz sentido?** Sim como padrão-ouro, mas faltam calibrações secundárias (prova recente, esforços do Strava) para quem não testa.

### ADR-04 — Plano como JSON em `coach_reports.full_report`
- **Decisão:** uma linha por semana com o documento inteiro.
- **Motivo:** o formato mudou toda semana por meses; a tabela já existia.
- **Alternativas:** `weekly_plans` + `plan_days` normalizadas; JSONB tipado.
- **Trade-off:** sem integridade; parse espalhado; colisão com resumos e análises na mesma tabela.
- **Ainda faz sentido?** **Não.** O formato estabilizou. Migrar para tabela própria (pelo menos JSONB com `period_type` exclusivo).

### ADR-05 — Semana em andamento é congelada
- **Decisão:** `regenerationTarget` impede reescrever uma semana que já começou, mesmo com `force`. Melhorias entram na semana seguinte.
- **Motivo:** incidente de 31/08, quando a regeneração mudou o treino no meio da semana ("não é aceitável").
- **Alternativas:** regenerar só dias futuros; pedir confirmação com diff.
- **Trade-off:** correções de bug no motor demoram até uma semana para chegar ao atleta.
- **Ainda faz sentido?** Sim. Mas o ajuste proativo por IA (6.3) fura essa regra e precisa ser alinhado.

### ADR-06 — Ratchet ancorado no executado + progressão calma
- **Decisão:** o volume novo nunca fica abaixo do que o atleta **fez** (quando cumpriu); rampa de 5% sem prova e 10% com prova, teto de +8 km.
- **Motivo:** o piso no planejado congelou o plano por 6 semanas; política explícita de Sérgio.
- **Alternativas:** ACWR como regulador; progressão fixa de 10%.
- **Trade-off:** progressão lenta para quem quer evoluir rápido.
- **Ainda faz sentido?** Sim. Considerar modular pela recuperação (HRV/sono), ideia 6.

### ADR-07 — Mesociclo de 4 semanas com cardápio de sessões
- **Decisão:** 3 semanas de trabalho + 1 de recuperação, com tipo de qualidade rotativo.
- **Motivo:** 6 semanas idênticas de "3×400 m"; pedido de variedade.
- **Alternativas:** progressão só por repetições; periodização linear por fases.
- **Trade-off:** âncora fixa na 1ª corrida (não reinicia após pausa); cardápio igual para todos.
- **Ainda faz sentido?** Sim. Âncora e cardápio por objetivo merecem revisão.

### ADR-08 — Groq com `openai/gpt-oss-120b`
- **Decisão:** um provedor, um modelo, via `fetch`, sobrescrevível por env.
- **Motivo:** custo/latência baixos; JSON limpo; português bom; Llama aposentado.
- **Alternativas:** OpenAI (chave existe, sem uso), Anthropic, `qwen3` (rejeitado por `<think>` no conteúdo).
- **Trade-off:** dependência de um provedor com histórico de aposentar modelos; sem `response_format`.
- **Ainda faz sentido?** Sim para narrativa. Para o chat e a estratégia valeria testar um modelo com structured outputs nativos.

### ADR-09 — Chat traduz pedido em edições estruturadas
- **Decisão:** a IA devolve `edits` numa whitelist; o código aplica e escreve a confirmação.
- **Motivo:** o chat antigo confirmava mudanças que não fazia.
- **Alternativas:** IA reescrevendo o plano; formulário em vez de chat.
- **Trade-off:** só 4 tipos de edição.
- **Ainda faz sentido?** Sim. Expandir a whitelist (trocar tipo de sessão, mover força) em vez de voltar à reescrita.

### ADR-10 — Recordes por janela nos streams com tempo total, fonte única
- **Decisão:** `records.ts` é a única definição; best effort por dois ponteiros com tempo decorrido.
- **Motivo:** três definições diferentes em três telas; divergência com o Strava; pausas criavam recordes falsos.
- **Alternativas:** usar os `best_efforts` do próprio Strava (só para corridas, e dependem do plano do atleta); tempo em movimento.
- **Trade-off:** backfill caro em chamadas ao Strava.
- **Ainda faz sentido?** Sim (validado 74/74).

### ADR-11 — Derivados calculados na leitura
- **Decisão:** recordes (exceto os efforts), conquistas, carga e prontidão são recalculados sempre.
- **Motivo:** nunca ficar velho nem divergente.
- **Alternativas:** materializar com triggers/jobs.
- **Trade-off:** custo de CPU e consultas grandes (dashboard carrega todas as corridas).
- **Ainda faz sentido?** Sim com 7 usuários. Com histórico grande, cachear agregados semanais.

### ADR-12 — Garmin via intervals.icu; calorias via Atalho do iPhone
- **Decisão:** chave pessoal do intervals.icu para HRV/sono/FCR; Apple Saúde via Atalho para kcal.
- **Motivo:** programa de desenvolvedores da Garmin fechado; o Garmin não escreve HRV na Apple Saúde.
- **Alternativas:** app nativo com HealthKit (sem HRV do Garmin); Terra/Rook/Spike (agregadores pagos, **não avaliados em profundidade**); scraping do Garmin Connect (viola termos).
- **Trade-off:** atrito de configuração (conta no intervals.icu + chave + Atalho); chave pessoal não é o modelo recomendado pelo intervals.icu para multiusuário.
- **Ainda faz sentido?** Como ponte, sim. Para escalar: OAuth do intervals.icu ou agregador pago.

### ADR-13 — `wellness_data` uma linha por dia, merge sem apagar
- **Decisão:** várias fontes escrevem a mesma linha; o upsert só grava chaves não nulas, agrupando por assinatura de colunas.
- **Motivo:** as calorias das 22h apagavam a HRV das 8h.
- **Alternativas:** uma linha por fonte por dia + visão consolidada.
- **Trade-off:** perde-se a proveniência por campo; `source` é o último escritor.
- **Ainda faz sentido?** Aceitável agora. Com 2+ fontes por usuário, migrar para linha por fonte.

### ADR-14 — Recuperação comparada à média do próprio atleta
- **Decisão:** HRV e FCR contra a base pessoal (30 dias, excluindo a noite julgada; HRV exige 7 noites), com pesos fixos e renormalização.
- **Motivo:** valores absolutos de HRV não comparam pessoas; incluir a noite na base achata o sinal.
- **Alternativas:** usar o score do fabricante direto; z-score com desvio-padrão.
- **Trade-off:** 7 dias de calibração; pesos definidos por julgamento, **não validados contra desfecho**.
- **Ainda faz sentido?** Sim. Próximo passo: validar contra o Training Readiness do Garmin e o RPE real.

### ADR-15 — Troca de sessão manual e reversível
- **Decisão:** recuperação baixa **oferece** "leve" ou "amanhã"; nunca aplica sozinha; sempre há desfazer.
- **Motivo:** a sugestão das 05:30 chegava antes dos dados e cortava o treino sem volta.
- **Alternativas:** ajuste automático; só texto.
- **Trade-off:** depende de o atleta abrir o app.
- **Ainda faz sentido?** Sim.

### ADR-16 — Notificação da manhã orientada a dados
- **Decisão:** várias passadas (pg_cron a cada 15 min + crons da Vercel) e envio quando a noite chega, com trinco em `notification_log`; passada final às 08:30.
- **Motivo:** Hobby limita crons; notificação às 05:30 saía sem dados.
- **Alternativas:** Vercel Pro (cron por hora); webhook do intervals.icu (não existe para wellness, **não verificado**).
- **Trade-off:** infra fora do repo (pg_cron + Vault); quem sincroniza a pulseira tarde recebe "a noite ainda não chegou". Sérgio decidiu **não** estender o prazo.
- **Ainda faz sentido?** Sim. Versionar o SQL do job no repositório.

### ADR-17 — PWA em vez de app nativo
- **Decisão:** web instalável com push e offline básico; Capacitor só como scaffold.
- **Motivo:** uma base de código, deploy instantâneo, sem loja.
- **Alternativas:** React Native/Expo; Capacitor publicado.
- **Trade-off:** push no iOS exige instalação; sem HealthKit, sem Apple Watch, sem envio de treino ao relógio.
- **Ainda faz sentido?** Para o núcleo, sim. O próximo salto de dados (HealthKit/Health Connect, WorkoutKit) exige nativo.

### ADR-18 — Migrations manuais + código que degrada
- **Decisão:** SQL colado à mão; rotas funcionam (com menos recursos) se a tabela não existe.
- **Motivo:** sem `DATABASE_URL` na máquina e sem CLI do Supabase configurado.
- **Alternativas:** Supabase CLI com migrations versionadas e CI.
- **Trade-off:** banco irreprodutível; erros silenciosos (`try/catch` "table may not exist").
- **Ainda faz sentido?** **Não.** É a primeira coisa a profissionalizar.

### ADR-19 — Cadastro por convite
- **Decisão:** código obrigatório no cadastro.
- **Motivo:** base pequena de amigos; controle de custos e privacidade.
- **Alternativas:** aberto; lista de espera.
- **Trade-off:** crescimento só por indicação.
- **Ainda faz sentido?** Sim até resolver segurança (alerta 4) e onboarding.

### ADR-20 — Testes só de funções puras
- **Decisão:** Vitest sobre libs; sem testes de rota, componente ou E2E.
- **Motivo:** os bugs caros eram de lógica que "falha certo".
- **Alternativas:** Playwright, testes de integração com Supabase local.
- **Trade-off:** regressões de UI e de consulta passam (ex.: campo `strength` sumindo na normalização).
- **Ainda faz sentido?** Como base, sim. Faltam smoke E2E das 5 telas principais e testes de rotas críticas.

### ADR-21 — Service role nas rotas, autorização no código
- **Decisão:** rotas autenticam o usuário e usam o admin client com `.eq("user_id", user.id)`.
- **Motivo:** leituras cruzadas (amigos), tabelas sem policy, simplicidade.
- **Alternativas:** RLS completo e cliente do usuário; funções `security definer`.
- **Trade-off:** um `.eq` esquecido vaza dados; RLS vira decoração em boa parte do app.
- **Ainda faz sentido?** Parcialmente. Rotas só do próprio usuário deveriam usar o cliente com RLS.

### ADR-22 — Deploy local via Vercel CLI
- **Decisão:** `npx vercel deploy --prod --yes` da pasta de Sérgio.
- **Motivo:** trabalho não commitado; rapidez.
- **Alternativas:** deploy por push no GitHub.
- **Trade-off:** produção = disco local; sem revisão e sem rollback por commit.
- **Ainda faz sentido?** **Não.** Commit + push + deploy pelo Git.

### ADR-23 — Design próprio estilo Whoop, sem biblioteca de componentes
- **Decisão:** Tailwind + primitivas próprias (`components/ui`); telas ricas e animadas; sem emojis na UI.
- **Motivo:** Sérgio rejeitou versões "clean demais" e acordeões; quer "UAU", animado e completo.
- **Alternativas:** shadcn/ui, Radix.
- **Trade-off:** acessibilidade e consistência dependem de disciplina; estilos antigos convivem.
- **Ainda faz sentido?** Sim. Terminar a migração das telas antigas.

### ADR-24 — Fuso fixo BRT
- **Decisão:** "hoje" = São Paulo para todos.
- **Motivo:** todos os usuários estão no Brasil; bugs de UTC às 21h.
- **Alternativas:** fuso no perfil.
- **Trade-off:** usuário fora do Brasil vê dias errados.
- **Ainda faz sentido?** Sim até existir usuário fora do Brasil.

### ADR-25 — Musculação e outros esportes dentro do mesmo plano
- **Decisão:** o plano semanal integra força periodizada, natação e ciclismo com a corrida.
- **Motivo:** Sérgio treina força 3×/semana; um plano só de corrida ignora metade da semana.
- **Alternativas:** app só de corrida.
- **Trade-off:** complexidade; a força não entra na carga (TSS).
- **Ainda faz sentido?** Sim. Falta a carga unificada.

---

# 12. DÍVIDA TÉCNICA

> Transparência total. "Confirmado" = visto no código ou no banco. "(não verificado)" = inferência que precisa ser checada.

## 🔴 CRÍTICA — risco de perder o produto, vazar dados ou não conseguir reconstruir

| # | Dívida | Evidência | Impacto | Correção sugerida |
|---|---|---|---|---|
| C1 | **3 meses de código fora do git** | Último commit 16/06/2026; 102 modificados, 186 novos, 11 apagados | Uma sincronização ruim do OneDrive, um disco perdido ou um `git checkout` descuidado apaga o motor, a Saúde, os testes e tudo de jul–set | `git add -A && git commit && git push` **antes de qualquer outra coisa**. Revisar `.gitignore` antes (nenhum `.env*` pode entrar) |
| C2 | **Deploy feito do disco local** | `npx vercel deploy --prod` | Produção sem rastreabilidade; impossível saber que código está no ar ou fazer rollback por commit | Conectar a Vercel ao GitHub; deploy só por push na `main` |
| C3 | **Possível vazamento de todas as colunas de `profiles`** | Policy `"Authenticated can search profiles"` em `002_social.sql` (`for select using (auth.role() = 'authenticated')`) | E-mail, data de nascimento, altura, sexo e **`wellness_token`** de todos legíveis por qualquer usuário logado com a anon key. Com o token dá para gravar dados de saúde falsos em nome de outro | Verificar `pg_policies` em produção; trocar por view `public_profiles (id, username, name)` ou por RPC; mover `wellness_token` para tabela sem policy; rotacionar todos os tokens |
| C4 | **Banco não reconstruível** | Sem DDL de `activities`, `performance_tests`, `races`; migrations coladas à mão; `pg_cron`/Vault só no Supabase | Novo ambiente (staging, dev, recuperação de desastre) exige engenharia reversa | `supabase db dump --schema-only` do projeto de produção → `supabase/migrations/000_baseline.sql`; adotar Supabase CLI; versionar o SQL do job `limiar-morning` (sem o segredo) |
| C5 | **Backups não verificados** | Supabase plano gratuito **(não verifiquei se há backup diário acessível)** | Perda de dados irreversível em caso de erro humano | Verificar o plano; agendar `pg_dump` externo |

## 🟠 ALTA — produto errado para o usuário ou risco operacional relevante

| # | Dívida | Evidência | Impacto | Correção |
|---|---|---|---|---|
| A1 | ~~**Cron `weekly-report` quebrado e contraditório**~~ **resolvida em 17/09** (resumo por IA removido; plano pelo motor via `ensureWeeklyPlan`; devolutiva determinística em `week-recap.ts`) | `src/app/api/cron/weekly-report/route.ts` | (a) O resumo semanal procurava `coach_reports` `week` da semana passada com `summary` não nulo, mas **a linha do plano sempre tem `summary`** (`weekly-plan.ts:669`), então o resumo **nunca é gerado para quem teve plano**. Se fosse gerado, **sobrescreveria o `full_report` do plano** da semana passada com texto. (b) Para quem não tem plano na semana (sem corridas em 60 d), **gera plano por LLM**, que `ensureWeeklyPlan` considera "usável" (tem `sport`) e **nunca substitui**, e a trava de semana congela | Separar resumos em `period_type='week_summary'` (ou tabela própria); remover `generateStructuredWeeklyPlan` e chamar `ensureWeeklyPlan`; checar produção por planos sem `fingerprint` |
| A2 | ~~**Ajuste proativo por IA reescreve a semana em andamento**~~ **resolvida em 21/09** (rota e `adjustWeeklyPlanProactive` removidas; o banner agora usa `fitWeek` sobre os dias que sobraram, com prévia e confirmação) | `ProactiveAdjustBanner` + `week-fit.ts` | — | — |
| A3 | **Autorização por convenção** | Maioria das rotas usa `createAdminClient()` + `.eq("user_id", user.id)` | Um filtro esquecido = vazamento entre usuários; nenhum teste cobre rotas | Cliente com RLS nas rotas do próprio usuário; testes de autorização nas rotas sensíveis; revisar cada `createAdminClient` |
| A4 | **Next.js 14.2.35 com vulnerabilidades** | `npm audit` (5 avisos no `next`; a correção pede Next 16) | Exposição a CVEs do framework | Planejar upgrade 14 → 15 → 16 (mudanças em cookies/headers assíncronos, cache) com smoke tests |
| A5 | **Sem observabilidade** | Sem Sentry; crons sem alerta; IA falha para `null`; logs só na Vercel (retenção curta no Hobby) | Falhas silenciosas (o resumo semanal morto passou meses sem ninguém notar) | Sentry (ou Axiom/Logtail); o cron grava resultado em tabela `job_runs`; alerta se um cron não roda |
| A6 | **Home carrega o histórico inteiro de corridas** (parcial em 20/09) | `src/app/page.tsx` | O `select("*")` com `strava_raw_json` e `map_polyline` acabou em 18/09; em 20/09 o recorte de 180 dias caiu de novo, porque "Seus números" e os recordes falam da vida toda. Hoje são ~10 colunas numéricas por corrida, serializadas para o cliente — o payload ainda cresce com o histórico, só que ~40× menor | Agregar no servidor (total, soma, sequência) e mandar só os recordes calculados |
| A7 | **Contexto de IA sem limite** | `analyzeRun`/`generateWeeklySummary` enviam todas as corridas | Custo e latência crescem com o histórico; risco de limite de taxa no sync em lote | Resumo estatístico + N corridas similares |
| A8 | ~~**Carga de treino só de corrida**~~ **resolvida em 16/09** (`activityTSS`) | `training-load.ts` | TSB e recuperação subestimam fadiga de quem faz força 3×/semana (caso de Sérgio) | TSS por sRPE × duração para `activities`; calibrar com o atleta |
| A9 | **Webhook do Strava aceita eventos forjados** | `strava/webhook/route.ts` não confere `subscription_id`; o delete marca `runs.deleted_at` só pelo `object_id` | Qualquer pessoa pode apagar (soft delete) corridas de usuários conhecendo o ID da atividade no Strava; eventos falsos geram custo de API/IA | Validar `subscription_id`; no delete, confirmar com a API do Strava (404) antes de marcar |
| A10 | **Análise por IA síncrona no webhook do Strava** | `strava/webhook/route.ts` | Webhook lento → Strava reenvia; atividade só é salva se a função não estourar | Salvar e responder 200; análise em job posterior (fila simples em tabela) |
| A11 | ~~**Card de adesão mostra a semana seguinte como "esta semana"**~~ **resolvida em 21/09** (`computeAdherenceHistory` ignora semanas que ainda não começaram) | `plan-adherence.ts` | — | — |
| A12 | ~~**Musculação do dia conta como perdida antes de o dia acabar**~~ **resolvida em 21/09** (a regra "hoje ainda está pendente" passou a valer para qualquer esporte) | `plan-adherence.ts` | — | — |

## 🟡 MÉDIA — atrito, inconsistência ou custo de manutenção

| # | Dívida | Onde |
|---|---|---|
| M1 | `coach_reports` multiuso com plano em JSON como texto | ADR-04 |
| M2 | `plan_suggestions` e `session-swap` coexistem para o mesmo conceito | `012_plan_suggestions.sql`, `/api/coach/suggestion` |
| M3 | `advisor_suggestions` com unique por semana → duplicatas no banco; deduplicação em código | `018`, `advisor-inbox.ts` |
| M4 | `goals` e `races` modelam a mesma coisa (prova-alvo) | `/goals`, `/races` |
| M5 | `full-analysis` usa LTHR 0,925 e zonas não contíguas; reimplementa `callGroq` | `src/app/api/coach/full-analysis/route.ts` |
| M6 | Base de FC de repouso: média no score × mediana nos vitais | `readiness.ts` × `health-view.ts` |
| M7 | `localDateStr(new Date())` no servidor (UTC) em caminhos de "hoje" (ex.: trava de regeneração) | `weekly-plan.ts#ensureWeeklyPlan` |
| M8 | Delete do Strava não marca `activities.deleted_at` | `strava/webhook/route.ts` |
| M9 | JSON do LLM sem schema (zod), sem `response_format`, `temperature` 0,7 | `ai.ts` |
| M10 | Arquivos gigantes: `workout-builder.ts` (~1.450 l), `ai.ts` (~1.100), `CoachContent.tsx` (643), `GoalsContent.tsx` (526), `RunDetailContent.tsx` (486), `RacesContent.tsx` (464) | — |
| M11 | Paleta: **312 classes de cor fora dos 5 tons** em 75 arquivos de componentes; estilos antigos (`.card`, `.btn-*`) convivendo com as primitivas novas | seção 16 |
| M12 | Emojis remanescentes: 108 ocorrências em 24 arquivos (conquistas, esportes, tour, pushes "📊", kudos "🔥"), contra o pedido de Sérgio | `achievements.ts`, `sports.ts`, `OnboardingTour.tsx` etc. |
| M13 | Push chega a 4 de 7 usuários; nenhum fluxo guia a reinscrição | `PushNotificationButton`, `NotificationNudge` |
| M14 | Estado de onboarding/tour em `localStorage` (repete em outro dispositivo) | `OnboardingGate`, `OnboardingTour`, `SetupChecklist` |
| M15 | Service worker: estratégia de versionamento do cache **não verificada** (risco de servir JS antigo após deploy) | `public/sw.js` |
| M16 | Âncora do mesociclo fixa na 1ª corrida da vida; não reinicia após pausa longa | `mesocycle.ts` |
| M17 | `health_connected` legado ainda escrito | `profiles`, `/api/health/connection`, `/api/integrations/intervals` |
| M18 | Prompts com regras de treino desatualizadas (domingo descanso, ≤3 corridas, "intermediário") | `ai.ts` |

## 🟢 BAIXA — higiene

| # | Dívida |
|---|---|
| B1 | Documentos desatualizados: `README.md` (v1), `ROADMAP.md` (jun), `PROJETO_LIMIAR.md` (mai), `ADMIN_ROUTES_AUDIT.md` (rotas apagadas), `BUILD_NATIVE.md`/`PUSH_*.md` (não reverificados); comentários "Llama 3.3 70B" (`ai.ts`) e "GPT-4o-mini" (webhook) |
| B2 | Pastas vazias: `src/app/api/{coach-reports,projections,sync}`, `src/{auth,strava,hooks}`; `_rich.mjs` solto na raiz; zip de sessão antigo na pasta pai |
| B3 | Código morto: `generateMacroPlan`, `adaptMacroPlan`; campos v1 em `runs` (`hydration`, `gel_usage`, `relevance`, `workout_score`, `raw_text`); tabelas `training_cycles`, `projections` |
| B4 | Sem uso: Whoop (inativo), ponte Capacitor/`NativeHealthSync`, `OPENAI_API_KEY` |
| B5 | `health_checkins.energy` coletado em rotas antigas e ignorado |
| B6 | `type Admin = any` em `morning-dispatch.ts`; outros `any` pontuais |
| B7 | Três implementações de "segunda-feira da semana" (`week.ts`, `mesocycle.ts#mondayOf`, `plan-notify.ts#getMondayStr`, e locais em crons) |
| B8 | Sem ESLint/typecheck automatizado (sem CI); roda-se `npx tsc --noEmit` à mão |

---

# 13. BUGS E LIMITAÇÕES CONHECIDAS

## 13.1 Bugs

| # | Bug | Status | Reprodução / evidência | Severidade |
|---|---|---|---|---|
| 1 | Resumo semanal por IA nunca é gerado para quem teve plano na semana anterior | Confirmado por leitura de código; **não verificado em produção** (buscar `coach_reports` com título "Resumo da semana") | Cron de segunda: `existingSummary` encontra a linha do plano (tem `summary`) → `already-exists` | Alta (feature morta) |
| 2 | Atleta sem corridas nos últimos 60 dias recebe plano **gerado por LLM** na segunda às 07:00 e fica com ele a semana toda | Confirmado por leitura; não verificado em produção | Cron `weekly-plan` pula quem não correu em 60 d → `weekly-report` não acha plano → `generateStructuredWeeklyPlan` → `ensureWeeklyPlan` considera usável | Alta |
| 3 | Ajuste proativo apaga passos com intensidade e a prescrição de musculação dos dias reescritos | Confirmado por leitura | Semana com treino perdido → banner → "Ajustar" | Alta |
| 4 | Sono da noite 13→14/09 de Sérgio nunca chegará | Confirmado, permanente | A pulseira sincronizou antes da conexão com o intervals.icu | Baixa (pontual) |
| 5 | Notificação da manhã diz "a noite ainda não chegou" se a pulseira sincronizar depois de 08:30 | Comportamento **aceito** por Sérgio | Sincronizar tarde | Baixa |
| 6 | Atividade não-corrida apagada no Strava continua no Limiar | Confirmado por leitura | Apagar uma musculação no Strava | Média |
| 7 | Entre 21:00 e 00:00 BRT de domingo, o servidor pode tratar a semana seguinte como "em andamento" | **Suspeito** (`localDateStr` em UTC) | Gerar/atualizar plano no domingo à noite | Média |
| 8 | Tile de FC de repouso e componente do score podem discordar | Confirmado por leitura (média × mediana) | Semana com um valor atípico | Baixa |
| 9 | "Análise completa por IA" mostra zonas diferentes das da tela de zonas e pode prescrever um plano de 8 semanas diferente do motor | Confirmado por leitura | Rodar a análise | Média |
| 10 | Sugestões do conselheiro duplicadas no banco | Confirmado (deduplicação só na exibição) | Ver `advisor_suggestions` por `finding_key` | Baixa |
| 11 | Textos com emoji fora do padrão ("Resumo da semana pronto 📊", conquistas, esportes) | Confirmado | — | Baixa |

## 13.2 Limitações conhecidas (não são bugs, são fronteiras)

- **Push no iOS** só com a PWA instalada na tela inicial e permissão concedida dentro dela.
- **Strava:** 100 req/15 min e 1.000/dia para o app todo; o backfill de recordes é lento de propósito.
- **Garmin:** sem Body Battery, estágios de sono, estresse em tempo real nem batimento ao vivo (o intervals.icu só recebe resumos diários); o peso diário é a configuração do perfil; noites anteriores à conexão se perdem.
- **Calorias** só no iPhone com Atalho configurado.
- **Fuso** fixo em BRT.
- **Calibração** só pelo teste de 3 km; sem teste, o plano não tem ritmos nem FC.
- **HRV** leva 7 noites para entrar no score.
- **Carga** ignora musculação e outros esportes.
- **Sem app nativo:** não lê HealthKit/Health Connect, não envia treino ao relógio, não integra Apple Watch.
- **Plano Hobby da Vercel:** crons 1×/dia (mitigado com pg_cron para a manhã).
- **Grátis do Supabase:** limites de banco e egress **(não medidos)**.
- **Escala não testada:** 7 usuários; consultas "lê tudo" (sugestões de amigos, dashboard) não escalam.

## 13.3 Problemas de UX recorrentes (reclamações de Sérgio que voltam)

- "Está desatualizado" → o app mostra estado velho quando o dia "andou" (treino feito, noite chegou). Mitigado com sync ao voltar ao app e "Treino de hoje feito". **Qualquer tela nova precisa responder "o que mudou desde a manhã?"**.
- Contradições entre título e texto (ex.: "Pronto para treinar forte" num dia leve). O título precisa seguir o dia do plano.
- Não saber o que é clicável.
- Telas "vazias" ou "sem UAU".
- Emojis.

---

# 14. FEATURES INCOMPLETAS

| Feature | O que existe | O que falta | Por que parou |
|---|---|---|---|
| **Resumo semanal por IA** | Função, prompt, push | Funcionar (bug 13.1-1); incluir sono/HRV (ideia 9) | Colisão de modelagem não percebida |
| **Whoop** | OAuth, sync, mapeamento testado, card | Credenciais, teste com conta real | Ninguém tem Whoop |
| **App nativo (Capacitor)** | `capacitor.config.ts`, `native-shell/`, `NativeHealthSync`, `/api/health/wellness`, `BUILD_NATIVE.md` | Build, conta de desenvolvedor, publicação, HealthKit real | Custo/tempo; o PWA atende o núcleo |
| **intervals.icu OAuth** | Chave pessoal funcionando | Registrar app OAuth no intervals.icu; fluxo de consentimento | Priorizamos fazer funcionar para Sérgio |
| **`readiness` do intervals.icu no score** | Guardado em `raw` | Validar contra o Training Readiness do Garmin Connect | Sem validação, poderia dobrar a contagem de sinais |
| **Brainstorm Saúde × app (14/09)** | Itens 1, 2, 5 e versão sem relógio | **3** (bolinha de recuperação por dia no Treinador), **4** (como você chegou em cada corrida: HRV/sono × ritmo), **6** (volume da semana seguinte pela tendência de HRV/FCR), **7** (semana de recuo antecipada), **8** (descobertas pessoais), **9** (relatório semanal com sono/HRV), **bônus** (enviar treinos ao Garmin pelo intervals.icu) | Lote 1 entregue; Sérgio não pediu o lote 2 ainda |
| **Macro-plano adaptativo** | Determinístico, adaptação semanal | Remover funções de IA mortas; UX de viabilidade mais clara | — |
| **Metas × provas** | Duas telas | Unificação | Evoluíram separadas |
| **Estratégia de prova** | IA gera JSON | Ritmos calculados pelo motor; imprimível/pulseira | — |
| **Conselheiro** | 13 achados de treino/força | Achados de saúde (sono, HRV); limpar duplicatas | Saúde chegou depois |
| **Check-in pós-corrida → motor** | Entregue em 16/09: o contexto do check-in decide se o volume segura ou cai (`week-reading.ts`, migrations 028 e 029) | Fazer o mesmo para musculação e outros esportes, que continuam fora da carga | — |
| **Carga de musculação** | Logs de séries, sessões | TSS/sRPE integrados à forma e à recuperação | Não priorizado |
| **Recalibração sem teste** | VDOT implicado na análise de prova | Gravar como calibração; detectar "isso foi um teste?" | — |
| **Notificações** | 9 tipos | Reinscrição guiada; alertas sem emoji; central de notificações no app | — |
| **Onboarding** | Fluxo completo | Estado no servidor; métricas de conclusão | — |
| **LGPD** | Nada | Exportar dados, excluir conta, política de privacidade, consentimento para dados de saúde | Base de amigos |
| **Admin** | Convites, diagnóstico de push | Painel de saúde dos crons, uso de IA, usuários | — |
| **Export `.FIT`** | Arquivo por treino | Envio direto ao relógio (via intervals.icu ou nativo) | Garmin Training API fechada |

---

# 15. BACKLOG / IDEIAS DISCUTIDAS

> Separado por origem, como pedido. "Sérgio" = ideia que veio de Sérgio. "Claude" = sugestão minha (ou do assistente anterior, que também era IA). "Decidido" = já está resolvido e não deve ser rediscutido sem motivo novo. "Hipótese" = não validada.

## 15.1 Ideias de Sérgio

1. **App "estilo Whoop"**: clean, porém cheio de features, animado, "UAU", profissional; home = "o treino de hoje"; usar os dados dos usuários para adaptar tudo.
2. **Progressão com calma sem prova; variedade de estímulos** ("10 tiros de 200 m… sermos criativos"); cumprir mais do que o plano deve render aumento, "mesmo que só estímulo".
3. **Estrutura da semana de corrida: leve → tiro → longão**, nessa ordem (restrição de Sérgio).
4. **Treinos com aquecimento e desaquecimento**; `.FIT` "por tempo/distância, estilo planilha, não trajeto".
5. **Conectar o Garmin CIRQA** para saúde, prontidão e calorias; "pedir acesso à Garmin".
6. **Dados "live"** e atualização automática ("isso vai atualizar sozinho?").
7. **Integrar a Saúde com o resto do app** e ter versões **com e sem relógio**.
8. **Sem emojis** (pelo menos no dashboard: corridas, kcal).
9. **Nunca mudar uma semana no meio.**
10. Apple Watch e balança Xiaomi S400 (investigados; sem caminho viável no PWA).
11. **Dashboard confuso e poluído** (16/09): *"tem o círculo relacionado aos treinos, outro indicador/círculo de disposição, além de várias outras informações [...] sem uma hierarquia ou conexão muito clara entre os elementos"*. Não é para agora: juntar com a análise da outra IA ("uma Home que encerra uma decisão", reorganizar significados antes da navegação) e repensar a estrutura em conjunto.
12. **Disposição mais fiel ao corpo** (16/09): o Limiar mostrou ~60 enquanto o Garmin mostrou 20–40 depois de uma noite de 4 h e semana puxada, e o Garmin *"condiz muito mais com como estou me sentindo"*. Diagnóstico em `docs/readiness-garmin.md` — o intervals.icu não entrega a disposição do Garmin para esta conta. **Aplicado em 16/09:** opção A como padrão e B (número do Garmin digitado) como opção.
13. **"Não faço treino em ladeira"** (16/09, observação no check-in): o cardápio do mesociclo prescreveu subidas. **Aplicado em 16/09:** chave "Não faço treino em ladeira" (`training_prefs.excludedQuality`, `docs/excluir-tipos-de-treino.md`).
14. Handoff para outra IA fazer revisão profunda e levar o produto ao próximo estágio (este documento).

## 15.2 Ideias sugeridas por Claude (não implementadas)

**Do brainstorm de 14/09** (Sérgio escolheu 1, 2 e 5; os demais seguem abertos):
- 3 — bolinha de recuperação em cada dia do plano no Treinador;
- 4 — cada corrida mostra como o atleta chegou nela ("10 s/km mais lento que o alvo, mas o HRV estava 14% abaixo da média");
- 6 — volume da semana seguinte pela tendência de HRV/FCR (queda sustentada → mantém; bem → aumento normal);
- 7 — semana de recuo antecipada quando a queda de HRV se sustenta;
- 8 — descobertas pessoais ("seus melhores tiros vieram com recuperação > 75"; "depois de < 6 h de sono, seu leve fica 12 s/km mais lento");
- 9 — relatório semanal com sono e HRV;
- bônus — enviar a semana ao Garmin pelo calendário do intervals.icu.

**Do `ROADMAP.md` de junho** (escrito por IA; ainda não feitas):
- Saúde: correlação dor × volume; taxa de suor; ciclo menstrual; diário de lesões.
- Treinador: detecção automática de teste; VDOT por prova real; perguntas analíticas em linguagem natural; previsão de lesão.
- Provas: calendário de provas no Brasil; simulador "e se"; card de resultado compartilhável.
- Social: grupos/assessorias (B2B); comentários; desafios customizados; perfil público.
- Integrações: GPX; clima nas corridas; mapa de calor.
- Gamificação: níveis/XP; desafios sazonais; provas virtuais; proteção de sequência.
- Nutrição: carb loading.
- Plataforma: Sentry; CI; migrations versionadas; LGPD; app nas lojas.
- Produto: Limiar Pro (freemium), painel B2B para treinadores, landing page.

**Desta revisão de handoff** (seção 21 detalha):
- tabela `weekly_plans`;
- fila de jobs;
- carga de força;
- recalibração sem teste;
- unificar metas/provas;
- OAuth do intervals.icu ou agregador (Terra, Rook, Spike).

## 15.3 Decisões já tomadas (não rediscutir sem fato novo)

- Motor determinístico prescreve; IA só narra/traduz (ADR-02).
- Semana em andamento não é reescrita (ADR-05).
- Troca de treino nunca automática, sempre reversível (ADR-15).
- Garmin via intervals.icu enquanto o programa da Garmin estiver fechado; **nenhum pedido foi enviado à Garmin** (ADR-12).
- Não usar o peso diário do Garmin sem confirmação.
- Não estender o prazo da notificação da manhã além das 08:30 ("Não precisa", 15/09).
- Só uma semana vazia é perdoada no cálculo de volume.
- Recordes por tempo total, com fonte única.
- Dashboard rico e animado, sem acordeões em tudo (duas tentativas rejeitadas).
- Emojis fora do dashboard.
- Cadastro por convite.
- Não regenerar planos de outros usuários sem aprovação de Sérgio; backup de linhas antes de qualquer delete.

## 15.4 Hipóteses (não validadas)

- Os pesos do score de recuperação (0,30/0,22/0,18/0,10/0,20/0,10/0,06) refletem bem o estado do atleta. **Nunca validado contra desfecho** (desempenho no treino, RPE, lesão).
- 7 noites bastam para a base de HRV.
- Volume de +5%/semana sem prova é "calmo" o suficiente e ainda motiva.
- O teste de 3 km a cada 8–16 semanas é aceitável pelos usuários (4 de 6 nunca tinham feito antes de entrar no plano).
- O cardápio de 7 tipos de qualidade serve para todas as distâncias-alvo.
- A narrativa por IA agrega valor percebido (nunca medido; não há telemetria de leitura).
- Os usuários além de Sérgio seguem o plano (a adesão existe por usuário, mas nunca foi analisada).
- O intervals.icu é um caminho aceitável para usuários não técnicos (atrito de conta + chave).
- `readiness` do intervals.icu ≈ Training Readiness do Garmin.

---

# 16. DESIGN SYSTEM

## 16.1 Fundamentos

- **Referência estética:** Whoop (quase monocromático, cor só onde é informação), com a exigência de Sérgio de "animado, completo, UAU".
- **Tema:** escuro por padrão (`<html class="dark">`), claro via `:root.light` (`globals.css`), escolha claro/escuro/sistema em `lib/theme.ts` (script inline evita piscar).
- **Tokens de cor** (`globals.css`, RGB para aceitar opacidade no Tailwind):
  - `--color-surface-900…100`: escala semântica. **900 é sempre o fundo da página e 100 sempre o título**, com valores invertidos por tema:
    - escuro: 900 = `#0a0a0a`, 800 = card `#141414`, 700 = borda `#232323`;
    - claro: 900 = `#f4f4f5`, 800 = card branco, 100 = quase preto.
  - `--color-brand` laranja (`#f97316` no escuro; `#ea580c` no claro, para contraste); `brand-300/400` variam por tema.
  - `--gradient-surface`, `--shadow-card`, durações de animação (150/300/500 ms).
- **Tipografia:** `Inter, system-ui` (sans) e `JetBrains Mono` (mono), configuradas no Tailwind. **A Inter não é carregada**: não há `next/font` nem `<link>` de fonte no `layout.tsx`. Ela só aparece onde já está instalada; no iPhone, o texto sai em San Francisco (`system-ui`). Hierarquia por tamanho e peso; números grandes com `tabular-nums`.
- **Paleta semântica** (`src/components/ui/tone.ts`): **5 tons e só**:
  - `neutral` (cinzas, o padrão);
  - `brand` (ação/voz do app);
  - `good` (emerald);
  - `warn` (amber);
  - `alert` (red).

  Helpers: `toneForRatio` (≥0,8 good, ≥0,4 warn) e `toneForTsb`. Regra escrita no arquivo: *"qualquer coisa que queira uma sexta cor está pedindo ênfase que não mereceu"*.
- **Movimento** (`globals.css`, `tailwind.config.ts`):
  - keyframes `slideInUp`, `slideInDown`, `fadeInScale`, `shimmer`, `pulse-smooth`, `confetti-fall`, `float`;
  - `.stagger-in` (filhos entram em cascata, 60 ms de intervalo);
  - `bounce-spring` `cubic-bezier(0.34, 1.56, 0.64, 1)`;
  - tudo desligado com `prefers-reduced-motion`.
- **Mobile-first:** bottom nav com safe-area (`pb-safe`), sheets que sobem de baixo, alvos de toque grandes, haptics (`lib/haptics.ts`).

## 16.2 Primitivas (`src/components/ui/`)

| Primitiva | Arquivo | Uso |
|---|---|---|
| `Card`, `Section` (título + subtítulo + ação), `Row`, `RowGroup` (listas estilo iOS), `Reveal` (entrada ao aparecer) | `Surface.tsx` | Estrutura de toda tela nova |
| `Metric`, `MetricGrid`, `Bar`, `Pill` | `Metric.tsx` | Números com rótulo, barras de progresso, chips de tom |
| `Ring` (anel que se desenha com rAF), `Sparkline` | `Ring.tsx` | Recuperação, progresso semanal |
| `Disclosure` | `Disclosure.tsx` | Conteúdo secundário recolhível (**com moderação**, ver 2.5) |
| `PageHeader` (título + ações persistentes com badge) | `PageHeader.tsx` | Topo das telas |
| `Skeleton` | `Skeleton.tsx` | Carregamento |
| `tone.ts` | — | Cores |

**Componentes compartilhados fora de `ui/`:**
- `CountUp` (números que contam), `Confetti`, `LimiarMark` (logo);
- `shared/Badges.tsx` (tipo de corrida, fonte, tags);
- `shared/OfflineBanner`, `SportIcon`/`ActivityIcon`;
- `today/SwapActions`.

## 16.3 Padrões de interface

- **Herói por tela:** Dashboard → `TodayCard`; Saúde → `RecoveryHero`. Um número grande + veredito em palavras + uma ação.
- **"Porquê" em uma linha** para cada sessão/recomendação (`session-why.ts`, `sessionAdvice`).
- **Rótulo de proveniência** sempre que um número pode vir de fontes diferentes ("Relógio + carga", "Check-in + carga", "Só carga de treino", "ontem").
- **Nada de número sem contexto:** vitais contra a média do próprio atleta, com série de 30 dias ao tocar.
- **Estados vazios que ensinam** (`TestCalibrationCard`, `EnergyCard` sem peso, `CheckinPanel`).
- **Português do Brasil**, frases diretas, vírgula decimal (`toFixed(1).replace(".", ",")`), primeira letra da data em maiúscula.
- **Sem emojis na interface** (pedido de Sérgio; ícones `lucide-react` no lugar).

## 16.4 Inconsistências atuais (para quem for evoluir o design)

1. **312 classes de cor fora da paleta** (`text-green-400`, `bg-blue-500/10`, `indigo`, `purple`, `cyan`, `teal`…) em 75 arquivos. Os piores: `shared/Badges.tsx` (14), `FitnessCard.tsx` (13), `WeeklyPlanCard.tsx` (11), `ExecutionCard.tsx` (10), `ActivityCalendar.tsx` (10). As zonas de FC em `performance.ts` também carregam classes de cor próprias (azul/verde/amarelo/laranja/vermelho), o que é aceitável como exceção de dado.
2. **Duas gerações de estilo:**
   - classes utilitárias antigas em `globals.css` (`.card`, `.card-hover`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.input`, `.badge`, `.section-title`);
   - primitivas novas (`Card`, `Section`).

   Telas antigas (Gráficos, Metas, Provas, Calendário, detalhe de corrida) ainda usam a primeira.
3. **Sono em índigo**, fora dos 5 tons: barras do `SleepCard`, seleção de qualidade no `CheckinSheet`, histórico no `CheckinPanel`, além do selo `steady` em `Badges.tsx`. Contradiz o contrato do `tone.ts`. Decidir: oficializar como cor de dado (como as zonas de FC) ou remover.
4. **Emojis** em conquistas, esportes, tour de onboarding e alguns pushes.
5. **Treinador** com camadas de `Disclosure` demais (resquício da tentativa rejeitada).
6. **Sem biblioteca de componentes acessíveis** (Radix/shadcn). Foco, `aria-*` e navegação por teclado dependem de cada componente **(acessibilidade não auditada)**.
7. **Ícones:** `lucide-react@0.383` é antigo; alguns ícones novos não existem (`CalendarArrowDown` → usamos `CalendarClock`).
8. **Não há Storybook** nem página de catálogo de componentes; as cenas do onboarding (`onboarding-scenes.ts`) são o mais próximo disso.

---

# 17. SEGURANÇA E PRIVACIDADE

## 17.1 Autenticação e sessão

- Supabase Auth com e-mail e senha. Sessão em cookies HTTP-only renovada pelo middleware (`src/lib/supabase/middleware.ts`). Não há OAuth social nem MFA.
- **Cadastro por convite** (`invite_codes`/`invite_redemptions`). A validação do código tem rate limit por IP em memória (fraco em serverless).
- **Rotas públicas** (liberadas no middleware): `/auth*`, `/api/auth`, `/api/strava/webhook`, `/api/admin`, `/api/cron`, `/api/icons`, `/api/ingest`, `/sw.js`, `/manifest.json`, `/offline`. Cada uma se protege sozinha:

| Rota | Proteção |
|---|---|
| `/api/cron/*` | `CRON_SECRET` por `Authorization: Bearer` (a Vercel envia) ou `?secret=` (uso manual; **query string pode aparecer em logs**). Comparação em tempo constante (`cron-auth.ts`). Sem segredo configurado: bloqueia em produção |
| `/api/admin/*` | `ADMIN_SECRET` (fallback `CRON_SECRET`) e/ou e-mail em `ADMIN_EMAILS` |
| `/api/strava/webhook` | GET valida `STRAVA_VERIFY_TOKEN`. O POST **não valida nada**: o Strava não assina eventos e a rota não confere `subscription_id`. Consequências (confirmadas por leitura): **(a)** um POST forjado com `aspect_type: "delete"` e um `object_id` faz **soft delete da corrida de qualquer usuário** (os IDs de atividade são visíveis em links públicos do Strava); **(b)** eventos `create`/`update` forjados com `owner_id` de um atleta conectado disparam chamadas ao Strava e à IA (custo e limite de taxa). Mitigação mínima: conferir `subscription_id` contra o ID da assinatura e, no delete, rebuscar a atividade no Strava e só apagar se ela retornar 404 |
| `/api/ingest/wellness` | `profiles.wellness_token` (`wlt_` + 48 hex de `randomBytes(24)`), no corpo ou Bearer. Regenerável pelo usuário (`POST /api/health/wellness-token`); sem expiração |

**Histórico:** houve um bypass literal de cron embutido no bundle do cliente. Foi removido (comentário em `cron-auth.ts`).

## 17.2 Autorização e dados

- **RLS ligado** na maioria das tabelas: 73 declarações de `enable row level security`/`create policy` nos SQL do repositório. Tabelas sem DDL (`activities`, `performance_tests`, `races`) têm RLS **desconhecido**.
- **`intervals_connections`:** RLS ligado e **sem policy** (a chave de API só é lida pelo service role).
- **Service role em rotas:** a autorização efetiva de muitas rotas é o filtro `user_id` no código (ADR-21). `createAdminClient` não é importado em nenhum componente cliente (verificado).
- **🔴 `profiles`:** a policy de leitura para qualquer autenticado expõe todas as colunas (alerta 4 / C3).
- **Social:** o feed expõe só campos resumidos (sem notas, FC ou GPS, segundo o comentário da rota); o perfil do amigo lê via service role; silenciar e amizade aceita são checados no código.

## 17.3 Segredos

- **Onde vivem:**
  - variáveis de ambiente do projeto `limiar-app` na Vercel (Production);
  - `.env.local` na máquina de Sérgio (no `.gitignore`);
  - segredo `limiar_cron_secret` no Vault do Supabase (lido pelo job `pg_cron`).
- **Arquivos locais com segredos, sincronizados pelo OneDrive:** `.env.local` e `.env.vercel.check` (resultado de `vercel env pull`, ignorado no git). **Estão na nuvem da Microsoft junto com a pasta.** Não li o conteúdo durante o handoff.
- **Tokens de terceiros em texto puro no banco:** `strava_connections` (access/refresh), `intervals_connections.api_key`, `whoop_connections`. Não há criptografia em repouso além da do Supabase.
- **Regras de trabalho que seguimos:**
  - nunca pedir a Sérgio para colar segredo no chat;
  - chaves de terceiros (intervals.icu, Whoop) são geradas e coladas pela pessoa na tela do app;
  - o segredo do cron foi copiado para o Vault programaticamente, sem ser exibido.
- **Armadilha conhecida:** colar variáveis na Vercel por pipe do PowerShell injeta BOM (U+FEFF). `ai.ts` e `push.ts` removem BOM por isso. Prefira o painel da Vercel ou `printf` no bash.

## 17.4 Privacidade e LGPD

- **Dados sensíveis tratados:** saúde (HRV, FC de repouso, sono, peso, composição corporal, dor muscular, lesões nas notas), localização (polylines de corrida), data de nascimento. Pela LGPD, dados de saúde são **dados pessoais sensíveis**.
- **O que não existe:** política de privacidade, termo de consentimento, exportação de dados, exclusão de conta, registro de consentimento para envio de dados a terceiros.
- **Terceiros que recebem dados de usuários:**
  - **Groq:** histórico de corridas, notas do atleta (inclusive lesões), metas;
  - **Strava** e **intervals.icu:** leitura;
  - **Vercel:** logs;
  - **Supabase:** banco.
- **Headers de segurança:** `next.config.js` não define CSP, HSTS, `X-Frame-Options` etc. (há só os padrões da Vercel).

## 17.5 Lista de verificação de segurança (para a próxima IA)

1. `select * from pg_policies where tablename = 'profiles';` → corrigir a exposição e rotacionar `wellness_token` de todos.
2. Conferir RLS de `activities`, `performance_tests`, `races` e `strava_connections` em produção.
3. Revisar cada rota com `createAdminClient` e confirmar o filtro por usuário.
4. Validar eventos do webhook do Strava (`subscription_id` + confirmação do delete na API) — A9.
5. Tirar `?secret=` dos crons (só header).
6. Mover `.env.local`/`.env.vercel.check` para fora do OneDrive ou garantir que a pasta não sincroniza segredos.
7. Política de privacidade + exclusão de conta antes de abrir cadastro.
8. Upgrade do Next.js (A4).

---

# 18. INFRAESTRUTURA E DEPLOY

## 18.1 Ambientes

| Ambiente | Onde | Observação |
|---|---|---|
| Produção | Vercel, projeto `limiar-app`, `https://limiar-app.vercel.app`, plano Hobby | Único ambiente real |
| Banco | Um único projeto Supabase (plano gratuito **não verificado**) | **Sem staging e sem banco de dev**; desenvolvimento local aponta para produção |
| Local | `npm run dev` na pasta do OneDrive; `.claude/launch.json` para o preview; páginas `/dev/*` com dados de exemplo (bloqueadas em produção) | — |

## 18.2 Variáveis de ambiente (nomes e função, sem valores)

| Variável | Uso | Onde é lida |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente Supabase (navegador e servidor) | `src/lib/supabase/*` |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin client (ignora RLS), **só servidor** | `src/lib/supabase/server.ts` |
| `NEXT_PUBLIC_APP_URL` | URLs absolutas (OAuth, webhook, pushes) | Strava, subscription, pushes |
| `VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL` | Injetadas pela Vercel; fallback de URL | `strava-subscription.ts` etc. |
| `CRON_SECRET` | Autoriza crons (a Vercel envia no header) | `cron-auth.ts` |
| `ADMIN_SECRET`, `ADMIN_EMAILS` | Rotas e UI de admin | `cron-auth.ts`, `admin.ts` |
| `SIGNUP_ACCESS_CODE` | Fallback de código de cadastro se a tabela de convites não existir | `invites.ts` |
| `GROQ_API_KEY`, `GROQ_MODEL` (opcional) | LLM | `ai.ts` |
| `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_VERIFY_TOKEN` | OAuth e webhook do Strava | `strava*.ts`, rotas |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL` | Web Push | `push.ts`, `PushNotificationButton` |
| `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET` | Whoop (não configuradas) | `whoop.ts` |
| `OPENAI_API_KEY` | **Sem uso** (sobra da v1; pode ser removida da Vercel) | — |

**Modelo de variáveis:** `.env.local.example` na raiz do app.

## 18.3 Deploy (como é feito hoje)

```bash
cd limiar-app
npx tsc --noEmit -p .        # typecheck
npx vitest run               # 1.167 testes, ~5 s
npx vercel deploy --prod --yes
```

- **OneDrive trava `.next`:** se o build falhar com arquivo em uso, apague a pasta (`rm -rf .next`) e rode de novo.
- **Sem CI e sem preview por branch.** A Vercel CLI está autenticada na conta de Sérgio (em uma sessão, eu não consegui acessar o painel da Vercel pelo navegador; o deploy pela CLI funciona).
- **Recomendação:** conectar o repositório GitHub à Vercel e usar previews por PR.

## 18.4 Banco e migrations

- **Aplicação:** colar o SQL de `supabase/migrations/NNN_*.sql` no SQL Editor do Supabase, em ordem. **Não existe runner, `DATABASE_URL` nem Supabase CLI configurado.** Todas as migrations até **036** estão aplicadas em produção (confirmado em 14–15/09 para 026 e 027; em 16/09 para 028 a 032; em 18/09 para 033 e 034; em 20/09 para 035, conferida pelas três policies de `ai_messages` em `pg_policies`; em 21/09 para 036, conferida lendo `expires_at` pela API).
- **O código tolera tabela ausente** (`try/catch` e sondas como `notification_log` em `morning-dispatch.ts`), então uma migration não aplicada **não quebra**: desliga a feature em silêncio.
- **Fora do repositório:**

  ```sql
  -- extensões habilitadas no painel: pg_cron, pg_net
  -- segredo: criado com vault.create_secret(<valor do CRON_SECRET>, 'limiar_cron_secret')
  select cron.schedule('limiar-morning', '*/15 8-12 * * *', $job$
    select net.http_get(
      url := 'https://limiar-app.vercel.app/api/cron/morning',
      headers := jsonb_build_object('Authorization', 'Bearer ' ||
        coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'limiar_cron_secret'), ''))
    );
  $job$);
  ```

  Se `CRON_SECRET` mudar na Vercel, **o segredo do Vault precisa mudar junto**, ou a notificação da manhã para (a Vercel ainda roda as passadas de 05:30 e 08:00).

## 18.5 Jobs

Tabela completa em 3.10. Resumo:
- **9 crons diários ou semanais na Vercel** (limite do Hobby: 1×/dia por cron);
- **1 job pg_cron** a cada 15 min de manhã.
- **Nenhum registro de execução** além dos logs da Vercel e de `notification_log`.
- **Execução manual:** `GET https://limiar-app.vercel.app/api/cron/<nome>` com header `Authorization: Bearer <CRON_SECRET>`.

## 18.6 Serviços externos a configurar num ambiente novo

1. **Projeto Supabase:** schema (ver C4), extensões, Vault e job, URL de redirecionamento do Auth.
2. **App Strava:** callback domain, e a assinatura de webhook é criada sozinha pelo cron `strava-sync` (`ensureSubscription`).
3. **Chaves VAPID** (`npx web-push generate-vapid-keys`).
4. **Chave Groq.**
5. **Projeto Vercel** com as variáveis de 18.2 e os crons de `vercel.json`.
6. **Convite inicial** (admin em `ADMIN_EMAILS`).

## 18.7 Custos

Tudo em planos gratuitos até onde sei (Vercel Hobby, Supabase gratuito, Groq). **Não verifiquei faturas nem limites de uso.** O plano Hobby da Vercel é, pelos termos dela, para uso não comercial.

---

# 19. TESTES

## 19.1 O que existe

- **Vitest 2.1**, `npm test` (= `vitest run`). **76 arquivos, 1.407 testes, todos passando** (rodado em 18/09/2026, ~5 s).
- **Só funções puras de `src/lib/`.** Sem banco, sem rede, sem DOM.
- **Fixture central** (`tests/fixtures.ts`): atleta com teste de 3 km em 13:00 e FC média 178 → **VDOT ≈ 43,7, LTHR = 165**. Falhas se leem como "isso deu errado para um corredor de VDOT 43".
- **`tests/README.md`:** tabela dos bugs reais que cada teste protege. Leitura obrigatória.

## 19.2 Cobertura por área

| Área | Arquivos de teste |
|---|---|
| Motor do plano | `workout-builder`, `volume-ratchet`, `plan-progression`, `mesocycle`, `regeneration-guard`, `week-in-progress`, `test-in-plan`, `plan-freshness`, `plan-edit`, `session-why`, `today`, `day-sessions`, `other-sports`, `sports-cardio-macro`, `macro-long-run` |
| Fisiologia | `performance`, `training-paces`, `training-load`, `load-explainer`, `test-status` |
| Execução/recordes | `workout-execution`, `best-efforts`, `records`, `run-time`, `historical-comparison`, `achievement-compare`, `cycle-summary` |
| Força | `strength`, `exercise-catalog`, `exercise-substitute`, `split-rebalance` |
| Saúde | `readiness-hrv`, `health-view`, `recovery-today`, `session-swap`, `energy-for-day`, `calorie-breakdown`, `wellness-upsert`, `morning-message` |
| Integrações (mapeamento) | `strava-enrich`, `strava-import-filter`, `strava-subscription`, `intervals`, `intervals-sync`, `whoop`, `workout-fit`, `workout-fit-fidelity`, `cron-backfill-order` |
| Notificação/social | `plan-notify`, `notification-prefs`, `friend-notify`, `friend-suggestions` |
| Tempo | `week`, `week-consistency`, **`timezone-guard`** (teste estrutural que varre `src/` e proíbe `toISOString().slice(0,10)` fora de uma lista justificada) |
| Outros | `ai-model` (parâmetros do Groq), `onboarding-flow`, `profile-identity`, `shoes`, `theme` |

## 19.3 O que NÃO é testado

- **Rotas de API:** autorização, filtros por usuário, contratos. Nem os crons (`weekly-report` passaria com o bug A1).
- **Componentes React**, telas, responsividade, tema claro.
- **SQL, RLS, migrations.**
- **Integrações ao vivo:** Strava, intervals.icu, Groq, push.
- **E2E:** login → plano → troca → notificação.
- **Prompts de IA** (nenhum teste de formato de saída real).
- **Performance e carga.**

## 19.4 Como trabalhamos (disciplina)

1. **Antes de mexer num motor:** `npm test`.
2. **Bug encontrado:** escrever o teste que reproduz → ver falhar → corrigir → ver passar.
3. **Investigar dados reais sem `DATABASE_URL`:** script sonda temporário (`tests/_algo.test.ts`) que usa o service role do `.env.local`, escreve o resultado num `.txt` e é **apagado em seguida**. Nunca commitar sondas nem os `.txt`.
4. **Antes do deploy:** `npx tsc --noEmit -p .`.
5. **Verificação visual:** preview local (`.claude/launch.json`), telas `/dev/*` com dados fictícios. Screenshots do painel de preview podem sair com gráficos vazios porque o `requestAnimationFrame` não roda em aba oculta. Não é bug do app.

---

# 20. ESTADO ATUAL DO PRODUTO (visão de CTO)

**Uma frase:** um produto de nicho tecnicamente sério e cientificamente fundamentado, usado por um grupo de amigos, construído rápido por uma pessoa e uma IA, que **ainda não tem a base operacional de um software que possa crescer**.

| Dimensão | Estado | Nota |
|---|---|---|
| **Proposta de valor** | Clara: treinador de corrida (e força) que prescreve com ciência, se adapta ao corpo e explica o porquê | 🟢 |
| **Motor de treino** | Maduro, determinístico, ~1.536 testes, corrigido contra casos reais | 🟢 |
| **Saúde/recuperação** | Nova (14/09), funcional com Garmin via intervals.icu e sem relógio; score não validado contra desfecho | 🟡 |
| **UX** | Rica e animada no dashboard e na Saúde; telas antigas inconsistentes; muita navegação (10 itens) | 🟡 |
| **Usuários** | 7 contas por convite; push chega a 4; **sem métricas de uso** (nenhum analytics) | 🔴 para decidir produto |
| **Confiabilidade** | Funciona no dia a dia; falhas silenciosas não observadas; crons sem monitoramento | 🟡 |
| **Segurança/privacidade** | Possível exposição de `profiles`; sem LGPD; segredos em pasta sincronizada | 🔴 |
| **Operação** | Código fora do git; deploy local; banco irreprodutível; sem staging, CI, alertas ou backups verificados | 🔴 |
| **Qualidade de código** | Libs bem comentadas (o "porquê" está nos comentários); componentes e rotas grandes; duplicações pontuais | 🟡 |
| **Escalabilidade** | Adequada para dezenas de usuários; consultas "lê tudo" e IA com histórico completo não escalam | 🟡 |
| **Dependências externas** | Strava (crítico), intervals.icu (ponte com chave pessoal), Groq (um modelo), Garmin (fechado) | 🟡 |
| **Equipe** | Sérgio (produto, uso real, decisões) + IA (engenharia). Sem revisão humana de código | ⚠️ |
| **Custos** | Praticamente zero (planos gratuitos); não medidos | 🟢 hoje / ❓ na escala |

**Riscos principais, em ordem:**
1. perda do código (git);
2. vazamento e adulteração entre usuários (`profiles`, webhook do Strava sem validação);
3. impossibilidade de recriar o banco;
4. mudanças de terceiros (Strava/intervals.icu/Groq) quebrando em silêncio;
5. decisões de produto sem dados de uso.

**Pronto para:** uso diário por amigos; demonstrações; revisão técnica.
**Não pronto para:** cadastro aberto, cobrança, dados de saúde de desconhecidos, equipe maior.

---

# 21. O QUE EU FARIA A SEGUIR (OPINIÃO)

> ⚠️ **Esta seção é opinião minha, não fato.** Ordenei por risco e depois por valor.

## Fase 0 — Blindar (1–2 dias). Nada de feature antes disso.

1. **Commit + push de tudo** (conferir `.gitignore` antes). Conectar a Vercel ao GitHub e fazer o deploy pelo git.
2. **Corrigir a policy de `profiles`**: view pública só com `id, username, name`; `wellness_token` fora de `profiles`; rotacionar os tokens. Na mesma leva, **validar eventos do webhook do Strava** (A9): hoje um POST forjado apaga corridas.
3. **Dump do schema de produção** para `000_baseline.sql`; adotar Supabase CLI; versionar o job `pg_cron` (sem o segredo).
4. **Backup externo** agendado (`pg_dump`).
5. **Sentry** (servidor + cliente) e tabela `job_runs` com o resultado de cada cron.

## Fase 1 — Fazer o que existe dizer a verdade (1–2 semanas)

6. **Consertar o `weekly-report`**: resumo em `period_type` próprio, sem plano por IA, usando `ensureWeeklyPlan`. Auditar produção por planos sem `fingerprint`.
7. **Remover ou reescrever o ajuste proativo por IA** com regras determinísticas (reusar `session-swap`/`plan-edit`).
8. **Tirar a IA síncrona do webhook do Strava**; limitar o contexto de histórico enviado ao LLM.
9. **Dashboard com colunas selecionadas e agregados no servidor.**
10. **Unificar incoerências:** base de FCR (mediana em ambos), LTHR da análise completa, `localDateStr` no servidor, delete do Strava em `activities`.
11. **Telemetria de produto mínima** (eventos: abriu Hoje, trocou treino, fez check-in, leu análise, seguiu sessão). Sem dados, as próximas decisões são palpite.

## Fase 2 — Aprofundar o diferencial (o que tornaria o Limiar único)

12. **Validar o score de recuperação** com os dados que já existem: correlação entre score da manhã e execução da sessão (previsto × executado, RPE). Ajustar pesos com evidência.
13. **Lote 2 do brainstorm:**
    - **6** (volume da semana seguinte pela tendência de HRV/FCR);
    - **4** (como você chegou em cada corrida);
    - **3** (recuperação em cada dia do plano).

    Fecham o ciclo "corpo → plano" que é a promessa do produto.
14. **Carga unificada** (TSS de força e outros esportes por sRPE × duração). Hoje a forma de quem faz academia está errada.
15. **Calibração sem teste** (prova recente, esforços máximos detectados). Metade dos usuários não testa.
16. **Enviar a semana ao relógio** pelo calendário do intervals.icu. Resolve o `.FIT` manual para usuários Garmin.

## Fase 3 — Preparar para crescer (se o objetivo for crescer)

17. LGPD (política, consentimento de dados de saúde, exportar e excluir conta).
18. Upgrade do Next.js; testes de rota nas rotas sensíveis; smoke E2E das 5 telas principais.
19. **Onboarding de dispositivos sem atrito:** OAuth do intervals.icu ou agregador pago (Terra, Rook, Spike; avaliar custo × cobertura). A chave pessoal não serve para público geral.
20. **Decidir sobre app nativo** (HealthKit/Health Connect, WorkoutKit, push confiável no iOS). Para dados de saúde sem intermediário, o PWA chegou no limite.
21. **Simplificar navegação** (10 → 5): Hoje, Treino (plano + calibração), Corpo (Saúde), Histórico (corridas + recordes + gráficos + calendário), Pessoas (amigos). Metas e provas unidas dentro de Treino.

## O que eu NÃO faria

- **Não reescreveria o motor de treino** nem trocaria a ciência base. Ele está certo e testado; o problema é em volta dele.
- **Não daria mais poder prescritivo à IA.** O caminho é IA explicando melhor, não decidindo mais.
- **Não abriria cadastro** antes das fases 0 e 1.
- **Não adicionaria features sociais ou de gamificação** antes de saber se os 7 usuários atuais seguem o plano.
- **Não voltaria aos acordeões nem ao dashboard minimalista** (duas rejeições registradas).

## Dúvidas estratégicas que eu levaria a Sérgio

- O Limiar é **para Sérgio e amigos** ou **um produto**? Muda tudo a partir da Fase 2.
- Corrida é o centro e força é complemento, ou são iguais? (A carga de treino hoje assume a primeira.)
- Até onde vale depender do Strava e do intervals.icu versus investir em nativo?

---

# 22. COISAS QUE SOMENTE EU SEI

> Conhecimento tácito que não está (ou está espalhado) no código. Parte disso também está nas memórias em `C:\Users\sctca\.claude\projects\C--Users-sctca-OneDrive-Documentos-Limiar\memory\` (arquivos `sergio-weekly-run-structure`, `limiar-training-methodology`, `limiar-testing-discipline`, `limiar-migrations-manual`, `limiar-progression-policy`, `limiar-garmin-via-intervals`).

## 22.1 Sobre Sérgio (dono do produto, principal pessoa usuária e quem decide)

- Corre 3×/semana na ordem **leve → tiro → longão** e faz musculação nos outros dias. É **restrição, não sugestão**.
- Usa **iPhone**, **Garmin Forerunner 265** e a pulseira **Garmin CIRQA** (desde 13/09/2026). No início de setembro, o plano estava em torno de 19 km/semana (6 km leve, tiro, longão de ~9,5 km).
- Corre cedo, às vezes antes do café, e abre o app depois. É por isso que "já fiz o treino" precisa estar refletido na tela.
- **Estilo de comunicação:** português informal, mensagens curtas com erros de digitação, prints de tela. Pede ação direta ("faça", "ok, faça"). Deixa abas abertas (Supabase, intervals.icu, Vercel) esperando que eu termine configurações pelo navegador.
- **Critério estético:** quer "UAU", animado, completo e profissional. Rejeita sem rodeio o que ficou "estranho" ou "vazio". Percebe dado velho na hora.
- **Critério de treino:** progressão calma sem prova, variedade, recompensa por cumprir mais que o plano, nunca mexer na semana em andamento.
- **Segurança:** já ofereceu colar segredos no chat. Combinado: **nunca pedir nem aceitar segredo no chat**; chaves são geradas e coladas pela própria pessoa na tela do app.
- Gosta de brainstorm numerado e responde pelos números.

## 22.2 Sobre os outros usuários

- São 7 contas no total, por convite (amigos de Sérgio).
- **Não regenerar planos de outros usuários sem aprovação de Sérgio.** Antes de qualquer delete/update manual no banco, **copiar as linhas afetadas** (fizemos isso no incidente de 31/08).
- O atleta `c7f962e5…` (prefixo de UUID) foi o caso real do bug das semanas vazias (32 km planejados após correr 2 vezes num mês). A semana de 14/09 dessa pessoa ficou congelada com esse volume por causa da trava.
- Até jun, 4 de 6 atletas nunca tinham feito o teste de 3 km. O motivo de colocar o teste dentro do plano foi esse.

## 22.3 Armadilhas operacionais

- **OneDrive + `.next`:** travas de arquivo quebram o build; `rm -rf .next` resolve.
- **PowerShell + variáveis de ambiente:** pipe injeta BOM invisível. Já derrubou a IA e o push.
- **`PLAN_ENGINE_VERSION`:** aumentar a versão faz o banner "plano desatualizado" aparecer para **todos**. Foi assim que começou o incidente de 31/08. Hoje a trava protege a semana atual, mas avise os usuários.
- **Mudança no motor só aparece na semana seguinte** (trava). Para validar, olhe o plano da próxima semana.
- **Cron `weekly-plan` roda domingo 00:00 BRT** e gera a semana atual **e** a próxima.
- **`notify-evening` roda 01:00 UTC**, que ainda é o dia anterior em BRT. "Amanhã" é calculado em BRT de propósito.
- **intervals.icu:**
  - para depurar, leia pelo servidor com a chave guardada; o endpoint da web app (`/api/athlete/...` com sessão) devolve `[]` e engana;
  - o Garmin data o sono no dia em que se acorda;
  - a nota de sono "86" que o Garmin mostrou era da noite de sábado para domingo (13/09).
- **Garmin:** o peso diário é o do perfil (pulou de 77 para 88 kg ao configurar a pulseira).
- **Groq:** aposenta modelos (Llama saiu em 16/08/2026). `reasoning_effort` em modelo que não raciocina dá 400 e, como a IA falha para `null`, **tudo fica mudo sem erro visível**.
- **Strava:** sem assinatura de webhook nada chega sozinho. O cron diário recria. O limite de 100 req/15 min é do **app inteiro**.
- **Navegador controlado por automação** (Chrome MCP) em aba oculta:
  - screenshots e timers travam;
  - cliques via DOM (`element.click()`) funcionam;
  - no SQL Editor do Supabase, `window.monaco.editor.getEditors()[0].getModel().setValue(sql)` preenche o editor;
  - consultas destrutivas abrem um diálogo de confirmação.
- **Painel de preview do Claude:** `requestAnimationFrame` não roda em aba oculta. Anéis e gráficos aparecem vazios em screenshot, e isso não é bug.
- **Vercel:** numa sessão eu não consegui usar o painel da Vercel pelo navegador; a CLI local funciona.

## 22.4 Decisões que parecem estranhas mas são intencionais

- **Domingo pode ter treino** (o motor segue os dias do atleta), apesar de os prompts antigos dizerem o contrário.
- **Plano sem ritmos para quem não testou:** é melhor que inventar.
- **Recordes com tempo total** (não em movimento), igual ao Strava.
- **Uma semana vazia é perdoada, duas não.**
- **Semana 4 do bloco só é leve se "merecida"** (houve treino de verdade nas 3 anteriores).
- **O conselheiro não usa IA** para escrever achados.
- **A notificação da manhã espera a noite chegar** e desiste às 08:30 com a mensagem "a noite ainda não chegou".
- **Nenhum pedido foi enviado à Garmin.** Se alguém perguntar "já pedimos acesso?", a resposta é não, porque o programa está fechado.

---

# 23. GUIA PARA A PRÓXIMA IA

**Se você for analisar este projeto, comece olhando estes arquivos e entendendo estes conceitos nesta ordem:**

## 23.1 Ordem de leitura

1. **Este documento:** os 6 alertas do topo, depois as seções 1, 20 e 12.
2. **`TRAINING_SCIENCE.md`:** a ciência que o motor implementa (zonas de Daniels, distribuição de intensidade, tetos de volume, zonas de Friel, periodização, estrutura semanal de Sérgio, musculação para corredores, fontes).
3. **`tests/README.md` e `tests/fixtures.ts`:** a lista de bugs reais explica por que o código é como é.
4. **`src/types/index.ts`:** `Run`, `Activity`, `WeeklyPlanData`, `WeeklyPlanDay`, `StructuredWorkout`, `TrainingPrefs`, `WellnessData`, `HealthCheckin`, `PerformanceTest`.
5. **Motor de treino, nesta ordem:**
   1. `src/lib/weekly-plan.ts` (`ensureWeeklyPlan`: orquestração, trava, contexto);
   2. `src/lib/workout-builder.ts` (`planWeeklyVolume`, `volumeWithRatchet`, `distributeWeeklyVolume`, `allocateRunSessions`, `buildWeekPlan`, sessões);
   3. `src/lib/mesocycle.ts` (bloco de 4 semanas, cardápio, `regenerationTarget`);
   4. `src/lib/performance.ts` (VDOT, ritmos, LTHR, zonas);
   5. `src/lib/training-load.ts` (TSS/CTL/ATL/TSB);
   6. `src/lib/plan-freshness.ts` e `src/lib/test-status.ts`.
6. **Recuperação:**
   1. `src/lib/recovery-load.ts` (o carregador único);
   2. `src/lib/readiness.ts`;
   3. `src/lib/health-view.ts`;
   4. `src/lib/recovery-today.ts`;
   5. `src/lib/session-swap.ts`;
   6. `src/lib/morning-dispatch.ts` + `morning-message.ts`.
7. **Telas centrais:**
   - `src/app/page.tsx` → `components/dashboard/DashboardContent.tsx` → `TodayCard.tsx`;
   - `src/app/health/page.tsx` → `components/health/screen/HealthScreen.tsx`;
   - `components/coach/CoachContent.tsx` → `WeeklyPlanCard.tsx`.
8. **Entrada de dados:** `src/app/api/strava/webhook/route.ts`, `src/lib/strava.ts`, `src/lib/intervals-sync.ts`, `src/lib/wellness-upsert.ts`, `src/app/api/ingest/wellness/route.ts`.
9. **IA:** `src/lib/ai.ts` inteiro e `src/app/api/coach/full-analysis/route.ts`.
10. **Jobs:** `vercel.json`, `src/app/api/cron/weekly-plan`, `weekly-report` (**com o bug A1 em mente**), `morning`, `wellness-sync`, `strava-sync`.
11. **Dados e segurança:** `supabase/schema.sql`, `supabase/migrations/002_social.sql` (policy de `profiles`), 009, 018, 024–027; `src/middleware.ts`, `src/lib/supabase/server.ts`, `src/lib/cron-auth.ts`.
12. **Design:** `src/components/ui/*` (comece por `tone.ts` e `Surface.tsx`), `src/app/globals.css`.

## 23.2 Conceitos que você precisa dominar antes de opinar

| Conceito | Onde ler | Por que importa |
|---|---|---|
| **VDOT, ritmos E/M/T/I/R** | 10.1–10.2, `performance.ts` | Todo número do plano deriva disso |
| **LTHR e zonas de Friel** | 10.3 | Faixas de FC do plano |
| **TSS → CTL/ATL/TSB, ACWR** | 10.4 | "Forma", alertas, componente de recuperação |
| **Mesociclo 3+1 e cardápio** | 10.6 | Variedade e semana de recuperação |
| **Ratchet no executado, capacidade comprovada, semanas vazias** | 10.5 | Por que o volume sobe ou não |
| **Trava de semana em andamento + fingerprint** | ADR-05, `plan-freshness.ts` | A regra que mais custou caro |
| **"Motor prescreve, IA narra"** | 9.1, ADR-02 | Critério para qualquer nova feature de IA |
| **Base pessoal (30 d, excluindo a noite) e calibração de 7 noites** | 10.8–10.9 | Como a recuperação é julgada |
| **Merge de wellness sem apagar** | ADR-13, `wellness-upsert.ts` | Várias fontes na mesma linha |
| **Data do sono = dia em que se acorda** | 8.2 | Evita "sono de hoje" errado |
| **BRT fixo e o bug das 21h** | 10.13, `week.ts`, `timezone-guard.test.ts` | O bug que "sempre volta" |
| **Service role × RLS** | ADR-21, 17.2 | Onde está a autorização de verdade |
| **Degradação silenciosa** | ADR-18, 9.2 | Por que falhas não aparecem |

## 23.3 Regras de ouro ao mexer

1. **Rode `npm test` antes e depois.** Bug novo ganha teste antes da correção.
2. **Não reescreva a semana em andamento de ninguém.** Não aumente `PLAN_ENGINE_VERSION` sem avisar.
3. **Não coloque a IA para prescrever números.**
4. **Não mexa em dados de produção sem backup das linhas** e sem aprovação de Sérgio quando envolver outros usuários.
5. **Migrations:** entregue o SQL para ser aplicado (ou implante a CLI primeiro); o código deve tolerar a tabela ausente enquanto isso.
6. **Nunca peça ou exponha segredos.** Não commite `.env*`, sondas `tests/_*.test.ts` nem `.txt` de saída.
7. **Datas:** use `athleteDateStr`/`athleteMondayStr` (servidor) e `localDateStr` (navegador). Nunca `toISOString().slice(0,10)` em data local.
8. **UI:** 5 tons (`tone.ts`), primitivas de `components/ui`, sem emojis, com movimento, e toda tela precisa refletir o que mudou desde a manhã.
9. **Antes de declarar pronto:** `npx tsc --noEmit -p .`, testes e verificação no preview.

## 23.4 Primeiras perguntas a fazer para Sérgio

1. Podemos commitar e fazer push de tudo agora e passar o deploy para o GitHub?
2. O objetivo dos próximos meses é **produto para público** ou **ferramenta para o grupo**?
3. Posso verificar e corrigir a policy de `profiles` em produção (e rotacionar os tokens do Atalho)?
4. O resumo semanal por IA faz falta? (Ele está morto há meses.)
5. Quer manter o ajuste proativo por IA ou substituí-lo pela troca determinística?
6. Qual lote do brainstorm vem a seguir (3, 4, 6, 7, 8, 9 ou o envio de treinos ao Garmin)?

---

*Fim do documento. Gerado em 15/09/2026 a partir do código em `C:\Users\sctca\OneDrive\Documentos\Limiar\limiar-app`, do histórico das sessões e das verificações feitas no banco e nas integrações durante setembro de 2026. Quando algo aqui divergir do código, o código vence, e este documento deve ser atualizado.*
