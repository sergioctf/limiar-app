# Limiar — Mapa de Próximos Passos

> Atualizado em 2026-06-12. Documento vivo: priorize, risque, adicione.
> Esforço: 🟢 pequeno (horas) · 🟡 médio (1-2 sessões) · 🔴 grande (várias sessões)
> Valor: ⭐ nice-to-have · ⭐⭐ forte · ⭐⭐⭐ diferencial competitivo

---

## ✅ O que o app JÁ TEM (junho/2026)

**Core**: dashboard completo, corridas (Strava sync c/ retry + manual), calendário, provas, gráficos, PDF mensal
**Treinador IA**: plano semanal + chat c/ memória, testes 3km → VDOT/zonas/paces, adesão ao plano, eficiência aeróbica, ajuste proativo da semana, briefing matinal contextual, **macro-plano periodizado adaptativo até a prova**
**Performance**: CTL/ATL/TSB, overtraining, recordes por distância, comparação com prova-alvo, metas inteligentes
**Social**: amigos por username, ranking 5 métricas, feed c/ kudos 🔥, desafio semanal
**Engajamento**: 21 conquistas c/ confete, onboarding animado, push 5:30/22:00/domingo/lembretes de prova
**Plataforma**: PWA instalável, offline completo, segurança admin, RLS

---

## 1. 🩺 Saúde & Bem-estar

| Feature | Descrição | Esforço | Valor |
|---|---|---|---|
| **Check-in diário** | Sono (h + qualidade), dor/lesão (local + intensidade), humor, RPE do treino. 20 segundos por dia, vira série histórica | 🟡 | ⭐⭐⭐ |
| **Índice de prontidão** | Combina TSB + sono + dor + RPE num score 0-100 "pode treinar forte hoje?" — alimenta o briefing matinal e o ajuste proativo | 🟡 | ⭐⭐⭐ |
| **Diário de lesões** | Registro estruturado (canelite, fascite...), correlação com volume/pace da época, alertas de recorrência | 🟡 | ⭐⭐ |
| **Peso & composição** | Série temporal simples, correlação com performance | 🟢 | ⭐ |
| **Ciclo menstrual** | Fase do ciclo no contexto do plano (essencial p/ atletas mulheres — diferencial raro) | 🟡 | ⭐⭐ |
| **HRV (variabilidade FC)** | Importar de apps/relógios; melhor preditor de overtraining que TSB sozinho | 🔴 | ⭐⭐ |

**Dependências**: check-in é a base de tudo nesta categoria. Começar por ele.

## 2. 🧠 Treinador — próximo nível

| Feature | Descrição | Esforço | Valor |
|---|---|---|---|
| **Treinos estruturados** | Construtor de treino intervalado (aquece 10' + 6x800m @4:30 + trote 2')— hoje o plano só diz "tiro 400m" | 🟡 | ⭐⭐⭐ |
| **Export p/ relógio** | Treino estruturado → arquivo .FIT/.ZWO ou Garmin Connect API → o relógio apita os intervalos | 🔴 | ⭐⭐⭐ |
| **Detecção automática de teste** | Corrida de ~3km forte detectada → "isso foi um teste? Atualizar VDOT?" | 🟢 | ⭐⭐ |
| **VDOT por prova real** | Hoje só teste 3km gera VDOT; usar resultados de provas oficiais também | 🟢 | ⭐⭐ |
| **Análise pós-prova IA** | Prova concluída → análise profunda: splits vs estratégia, o que funcionou, próximos focos | 🟡 | ⭐⭐ |
| **Perguntas em linguagem natural** | "Como foi meu mês?", "Estou pronto pra meia?" → resposta IA com dados reais (expandir o chat existente p/ consultas analíticas) | 🟡 | ⭐⭐ |
| **Previsão de lesão (ML)** | Modelo sobre rampa de volume + histórico de dores → risco % | 🔴 | ⭐⭐ |

## 3. 🏁 Provas & Estratégia

| Feature | Descrição | Esforço | Valor |
|---|---|---|---|
| **Estratégia de prova c/ splits** | Gerar pacing km a km (negativo/constante) p/ a prova-alvo, com plano de hidratação/gel — imprimível/pulseira | 🟡 | ⭐⭐⭐ |
| **Calendário de provas BR** | Buscar/sugerir provas reais no Brasil por região/distância/mês (scraping ou API de inscrições) | 🔴 | ⭐⭐ |
| **Simulador "e se"** | "Se eu baixar 10s/km no limiar, que tempo faço na meia?" — slider interativo sobre o VDOT | 🟢 | ⭐⭐ |
| **Card de resultado compartilhável** | Pós-prova → imagem bonita (tempo, pace, mapa) p/ Instagram stories | 🟡 | ⭐⭐⭐ |

## 4. 👥 Social — expansão

| Feature | Descrição | Esforço | Valor |
|---|---|---|---|
| **Grupos/assessorias** | Criar grupo, ranking interno, desafios do grupo — abre caminho B2B (treinadores reais gerenciando atletas) | 🔴 | ⭐⭐⭐ |
| **Comentários nas corridas** | Além do kudos, comentar a corrida do amigo | 🟢 | ⭐⭐ |
| **Desafios customizados** | "Quem corre mais em julho", "primeiro a fazer sub-25 no 5K" — criados pelos usuários, com apostas simbólicas | 🟡 | ⭐⭐ |
| **Perfil público** | limiar.app/@sergio com PRs e conquistas (opt-in) — aquisição orgânica | 🟡 | ⭐⭐ |
| **Notificação social** | Push quando recebe kudos/pedido de amizade/é ultrapassado no desafio semanal | 🟢 | ⭐⭐ |

## 5. 🔌 Integrações & Dados

| Feature | Descrição | Esforço | Valor |
|---|---|---|---|
| **Garmin/Coros/Polar direto** | Hoje depende 100% do Strava; APIs diretas = dados mais ricos (HRV, sono nativo!) e menos dependência | 🔴 | ⭐⭐ |
| **Apple Health / Google Fit** | Fonte de sono/peso/passos p/ o índice de prontidão sem digitação | 🔴 | ⭐⭐ |
| **Import/export GPX** | Subir GPX avulso (relógio sem Strava), exportar rotas | 🟢 | ⭐ |
| **Clima nas corridas** | Temperatura/umidade históricas por corrida (API meteorológica) → contexto na análise IA ("pace caiu mas fazia 32°C") | 🟢 | ⭐⭐ |
| **Mapa de calor de rotas** | Todas as rotas sobrepostas num mapa — onde você mais corre | 🟡 | ⭐ |

## 6. 🎮 Gamificação avançada

| Feature | Descrição | Esforço | Valor |
|---|---|---|---|
| **Níveis & XP** | XP por km/consistência/PRs → nível de corredor (Iniciante → Elite) visível no perfil | 🟡 | ⭐⭐ |
| **Desafios sazonais** | "Desafio Julho 100km" com badge exclusivo do mês — motivo pra voltar todo mês | 🟡 | ⭐⭐ |
| **Provas virtuais** | "Maratona virtual do Limiar": completar a distância no mês, ranking entre participantes | 🟡 | ⭐⭐ |
| **Proteção de sequência** | 1 "freeze" por mês para não perder o streak (mecânica Duolingo, retenção comprovada) | 🟢 | ⭐⭐ |

## 7. 🍌 Nutrição (categoria nova)

| Feature | Descrição | Esforço | Valor |
|---|---|---|---|
| **Plano de fueling p/ longão/prova** | Calculadora: peso + duração + intensidade → géis/carbo/água por km, integrado à estratégia de prova | 🟡 | ⭐⭐ |
| **Carb loading** | Protocolo dos 3 dias pré-prova personalizado | 🟢 | ⭐ |

## 8. 🏗️ Plataforma & Qualidade (dívida técnica)

| Item | Descrição | Esforço | Valor |
|---|---|---|---|
| **Monitoramento de erros** | Sentry (ou similar) — hoje erros em produção são invisíveis | 🟢 | ⭐⭐⭐ |
| **Testes automatizados** | Unit nas libs críticas (VDOT, adesão, TSB, achievements) + smoke E2E — o app cresceu muito sem rede de proteção | 🟡 | ⭐⭐⭐ |
| **CI no GitHub** | Build + testes a cada push; deploy automático no merge (hoje o deploy é manual via CLI) | 🟢 | ⭐⭐ |
| **App stores (Capacitor)** | Empacotar o PWA → Google Play / App Store. Push nativo no iOS sem instalar PWA manualmente | 🔴 | ⭐⭐ |
| **Migrations versionadas** | Adotar supabase CLI db push de verdade (hoje: SQL manual via dashboard) | 🟢 | ⭐⭐ |
| **LGPD** | Exportar meus dados, deletar conta, política de privacidade — obrigatório antes de crescer | 🟡 | ⭐⭐ |
| **Limpeza de débitos** | ESLint warnings, tipos `any` em libs, consolidar duplicações (3 versões de "Monday-of-week" no código) | 🟢 | ⭐ |

## 9. 💰 Produto & Monetização (quando houver usuários)

| Item | Descrição | Esforço | Valor |
|---|---|---|---|
| **Limiar Pro** | Free: dashboard + sync + 1 plano/mês · Pro: IA ilimitada, macro-plano, estratégia de prova (Stripe) | 🔴 | ⭐⭐⭐ |
| **B2B assessorias** | Painel multi-atleta para treinadores reais (depende de Grupos) | 🔴 | ⭐⭐⭐ |
| **Landing page pública** | Página de marketing com screenshots + tour (hoje a raiz já exige login) | 🟡 | ⭐⭐ |

---

## 🎯 Sequências recomendadas (3 trilhas)

**Trilha A — "Produto completo de treino"** (mais coerente com o que viemos construindo)
1. Check-in diário + índice de prontidão (🟡⭐⭐⭐) — fecha o ciclo treino↔recuperação
2. Treinos estruturados (🟡⭐⭐⭐)
3. Estratégia de prova c/ splits + fueling (🟡⭐⭐⭐)
4. Detecção de teste + VDOT por prova (🟢⭐⭐)

**Trilha B — "Pronto para outros usuários"** (se a meta é convidar gente agora)
1. Sentry + testes nas libs críticas + CI (🟢🟡⭐⭐⭐)
2. LGPD básico (🟡⭐⭐)
3. Landing page + perfil público (🟡⭐⭐)
4. Notificações sociais + comentários (🟢⭐⭐)

**Trilha C — "Crescimento e retenção"**
1. Card compartilhável pós-corrida/prova (🟡⭐⭐⭐) — aquisição orgânica
2. Streak freeze + desafios sazonais (🟢🟡⭐⭐)
3. Grupos (🔴⭐⭐⭐)
4. Limiar Pro (🔴⭐⭐⭐)
