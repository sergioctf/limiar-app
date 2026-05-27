# LIMIAR — Documento Completo do Projeto
> Handoff Cowork → Claude Code  
> Gerado em: 26/05/2026  
> Status: v1 scaffolded, aguardando setup de infra e primeiros testes

---

## 1. Visão Geral

**Limiar** é um dashboard web pessoal de performance na corrida. O projeto nasceu da necessidade de centralizar duas fontes de dados complementares:

- **Strava** → fonte dos dados objetivos (distância, pace, FC, altimetria, mapa)
- **Treinador de IA** → fonte dos dados qualitativos (análise, sensações, projeções, estratégias)

O objetivo final é um **hub pessoal de evolução**, acessível pelo celular, onde o usuário (Sérgio) consegue ver toda a sua jornada de corredor — do primeiro treino de 5km até a Meia Maratona do Rio.

### Contexto do usuário

Sérgio é um corredor amador em transição de **intermediário para intermediário-forte**. Ciclo iniciado em jan/2024. Prova alvo: **Meia Maratona do Rio — 07/06/2024**. Projeção realista: **1h52–1h56**.

Ele usa uma IA separada como "treinador virtual" — envia prints das corridas, relatos subjetivos e recebe análises completas de performance. O output dessas sessões fica em texto (markdown). O Limiar deve ser o lugar onde tudo se consolida.

---

## 2. Stack Técnica

| Camada | Tecnologia | Justificativa |
|--------|-----------|---------------|
| Frontend | Next.js 14 (App Router) + TypeScript | SSR, API routes nativas, ótimo DX |
| UI | Tailwind CSS | Utilitários, mobile-first natural |
| Charts | Recharts | Leve, responsivo, fácil de customizar |
| Banco/Backend | Supabase (PostgreSQL) | Auth + DB + RLS + free tier robusto |
| Auth | Supabase Auth (email/senha) | Simples, seguro, integrado |
| Deploy | Vercel | Git push → prod, grátis para projetos pessoais |
| Integração | Strava API v3 (OAuth 2.0) | Fonte oficial de dados de corrida |

### Design System
- **Fundo:** `#0F172A` (slate-900)
- **Cards:** `#1E293B` (slate-800)
- **Accent:** `#F97316` (orange-500)
- **Tipografia:** Inter
- **Navegação mobile:** bottom tab bar (5 ícones)
- **Navegação desktop:** sidebar fixa esquerda (260px)

---

## 3. Estrutura do Projeto

```
Limiar/
├── BACKUP_PRE_JUNE_26.md          ← relatório do treinador IA (seed source)
├── PROJETO_LIMIAR.md              ← este arquivo
└── limiar-app/
    ├── package.json
    ├── next.config.js
    ├── tailwind.config.ts
    ├── tsconfig.json
    ├── postcss.config.js
    ├── .env.local.example
    ├── .gitignore
    ├── README.md
    ├── supabase/
    │   ├── schema.sql             ← schema completo + RLS
    │   └── seed.sql               ← 29 corridas + metas + projeções + relatório
    └── src/
        ├── middleware.ts           ← proteção de rotas
        ├── types/index.ts          ← todos os tipos TypeScript
        ├── lib/
        │   ├── utils.ts            ← funções de pace/tempo/agrupamento/dedup
        │   ├── strava.ts           ← OAuth + API + mapper Strava→Run
        │   └── supabase/
        │       ├── client.ts       ← browser client
        │       ├── server.ts       ← server client + admin client
        │       └── middleware.ts   ← refresh session
        ├── app/
        │   ├── layout.tsx          ← root layout + metadata + viewport
        │   ├── globals.css         ← Tailwind + componentes CSS customizados
        │   ├── page.tsx            ← Dashboard (server component)
        │   ├── auth/
        │   │   ├── page.tsx        ← Login/cadastro
        │   │   └── callback/route.ts
        │   ├── runs/
        │   │   ├── page.tsx        ← Histórico de corridas
        │   │   ├── new/page.tsx    ← Nova corrida
        │   │   └── [id]/page.tsx   ← Corrida individual
        │   ├── analytics/page.tsx  ← Gráficos
        │   ├── goals/page.tsx      ← Metas + Projeções + Estratégias
        │   ├── coach/page.tsx      ← Relatórios + Ciclos de treino
        │   ├── settings/page.tsx   ← Strava + conta
        │   └── api/
        │       └── strava/
        │           ├── connect/route.ts    ← inicia OAuth
        │           ├── callback/route.ts   ← recebe code, salva tokens
        │           ├── sync/route.ts       ← sync manual (POST)
        │           └── disconnect/route.ts ← remove conexão
        └── components/
            ├── layout/
            │   ├── AppShell.tsx
            │   ├── Sidebar.tsx
            │   └── MobileBottomNav.tsx
            ├── dashboard/
            │   └── DashboardContent.tsx
            ├── runs/
            │   ├── RunCard.tsx
            │   ├── RunsContent.tsx
            │   ├── RunDetailContent.tsx
            │   └── RunForm.tsx
            ├── goals/
            │   └── GoalsContent.tsx
            ├── coach/
            │   └── CoachContent.tsx
            ├── charts/
            │   ├── AnalyticsContent.tsx
            │   ├── WeeklyVolumeChart.tsx
            │   ├── MonthlyVolumeChart.tsx
            │   ├── PaceTrendChart.tsx
            │   ├── LongRunProgressChart.tsx
            │   └── HeartRateTrendChart.tsx
            ├── settings/
            │   └── SettingsContent.tsx
            └── shared/
                ├── StatCard.tsx
                ├── Badges.tsx      ← PaceBadge, HeartRateBadge, SourceBadge, RunTypeBadge, TagBadge
                └── States.tsx      ← LoadingState, ErrorState, EmptyState
```

---

## 4. Schema do Banco de Dados

### Tabelas criadas (supabase/schema.sql)

#### `profiles`
Criada automaticamente via trigger `on_auth_user_created` quando um novo usuário se cadastra.
```sql
id uuid PK → auth.users(id)
email text
name text
created_at timestamptz
```

#### `strava_connections`
Uma linha por usuário (unique user_id). Tokens sensíveis ficam aqui, nunca expostos ao frontend.
```sql
id uuid PK
user_id uuid FK auth.users
athlete_id bigint
access_token text         ← renovado automaticamente no sync
refresh_token text
expires_at bigint         ← unix timestamp
scope text
created_at / updated_at
```

#### `runs` (tabela principal)
```sql
id uuid PK
user_id uuid FK
strava_activity_id bigint UNIQUE  ← chave de deduplicação com Strava
source: 'strava' | 'manual' | 'imported_ai' | 'strava+ai'
name, date, type
distance_km, duration_seconds, moving_time_seconds, elapsed_time_seconds
avg_pace_seconds_per_km, avg_speed_mps, max_speed_mps
avg_hr, max_hr
elevation_gain_m, avg_cadence, calories, suffer_score
map_polyline            ← encoded polyline do Strava
device_name
temperature_c, conditions
perceived_effort (1–10), hydration, gel_usage
notes, raw_text         ← texto bruto salvo sempre
coach_feedback          ← análise do treinador
strava_raw_json jsonb   ← JSON completo do Strava para rastreabilidade
workout_score, relevance (1–10)
synced_at, deleted_at
created_at / updated_at
```

#### `run_tags`
```sql
id uuid PK
run_id uuid FK runs
tag text
UNIQUE(run_id, tag)
```

#### `goals`
```sql
id uuid PK
user_id uuid FK
race_name, distance_km, race_date
target_time_seconds, target_pace_seconds_per_km
conservative_time_seconds, likely_time_seconds, optimistic_time_seconds
status: 'upcoming' | 'active' | 'completed' | 'cancelled'
strategy text, notes text
```

#### `race_strategies`
```sql
id uuid PK
user_id uuid FK
goal_id uuid FK goals (nullable)
title, scenario: 'conservative' | 'balanced' | 'aggressive'
target_time_seconds, target_pace_seconds_per_km
strategy_text, hydration_plan, gel_plan
splits_json jsonb        ← array de { range, pace, note }
```

#### `coach_reports`
```sql
id uuid PK
user_id uuid FK
title, report_date
period_type: 'run' | 'week' | 'month' | 'cycle' | 'general'
period_start, period_end
summary, full_report     ← texto bruto preservado
strengths, weaknesses, projections, recommendations
```

#### `training_cycles`
```sql
id uuid PK
user_id uuid FK
name, start_date, end_date
objective, notes
planned_volume_km, actual_volume_km
final_assessment
```

#### `projections`
```sql
id uuid PK
user_id uuid FK
distance_km
scenario: 'conservative' | 'likely' | 'optimistic'
projected_time_seconds, projected_pace_seconds_per_km
confidence text, assumptions text
```

#### `sync_logs`
```sql
id uuid PK
user_id uuid FK
source text (default 'strava')
status: 'success' | 'error' | 'partial'
message text
activities_imported, activities_updated, activities_ignored
created_at
```

### Row Level Security
Todas as tabelas têm RLS ativo. Políticas por `user_id = auth.uid()`. Service role key usada apenas nas API routes do servidor (sync, callback).

---

## 5. Seed Inicial (BACKUP_PRE_JUNE_26.md)

O arquivo `supabase/seed.sql` popula automaticamente:

| Entidade | Quantidade |
|----------|-----------|
| Corridas | 29 (jan a mai/2024) |
| Ciclos de treino | 5 fases |
| Metas | 2 (Meia do Rio + 10km sub-50) |
| Estratégias de prova | 4 (3 para meia + 1 para 10km) |
| Projeções | 15 (5 distâncias × 3 cenários) |
| Relatório do treinador | 1 (relatório consolidado completo) |
| Tags | várias (placa, gel, prova, chuva, etc.) |

**Como executar:** O seed detecta automaticamente o `user_id` pelo primeiro usuário cadastrado via `SELECT id FROM auth.users ORDER BY created_at LIMIT 1`. Deve ser rodado **depois** do primeiro login na aplicação.

---

## 6. Funcionalidades Implementadas (v1)

### Dashboard (`/`)
- Cards de estatísticas: total de corridas, distância total, tempo total, pace médio, maior distância, melhor pace, volume semanal, volume mensal
- Card da última corrida (com link para página individual)
- Card da próxima meta (com cenários de tempo)
- Bloco "Resumo do Treinador" com pontos fortes e de atenção
- Gráfico de volume semanal (últimas 12 semanas)
- Contadores: corridas do Strava + corridas com análise do treinador

### Histórico de corridas (`/runs`)
- Cards mobile com badges de tipo, fonte, pace, FC, altimetria, tags
- Indicador visual para corridas com relevância ≥ 9 ("Destaque")
- Filtros: tipo de treino, fonte de dados, mês
- Busca por nome/notas
- Ordenação: data, distância, pace
- Contador de resultados + km total filtrado

### Corrida individual (`/runs/[id]`)
- Header com nome, data, tipo, fonte
- Grid de 4 stats principais: distância, tempo, pace, FC
- Stats secundários: FC máx, altimetria, cadência, calorias, condições, hidratação
- Tags visuais
- Notas e análise do treinador
- Indicador de percepção de esforço (barra de 10)
- Collapsible com JSON bruto do Strava
- Botão editar

### Nova corrida (`/runs/new`)
- **Modo estruturado:** todos os campos (data, tipo, distância, tempo, FC, altimetria, esforço, hidratação, gel, notas, análise, tags, relevância)
- **Modo texto livre:** campo de textarea para colar qualquer texto — salvo em `raw_text` + `notes`
- Cálculo automático de pace a partir de distância + tempo

### Metas, Projeções e Estratégias (`/goals`)
Três abas:
- **Metas:** lista de goals com cenários conservador/provável/otimista, expandível com estratégia e notas
- **Projeções:** agrupadas por distância (5km, 10km, 15km, meia, maratona) com cards por cenário
- **Estratégias:** por prova e cenário, expandível com splits, hidratação e plano de gel

### Gráficos (`/analytics`)
Quatro abas:
- **Volume:** barras semanais + barras mensais (bar com destaque no pico)
- **Pace:** linha de evolução do pace médio ao longo do tempo (eixo Y invertido)
- **FC:** linha de evolução da FC média
- **Longões:** área com progressão das corridas longas (≥12km ou tipo long_run)

### Treinador (`/coach`)
Duas abas:
- **Relatórios:** cards expansíveis com pontos fortes, atenção, recomendações, projeções e relatório completo em scroll
- **Ciclos:** timeline visual numerada com objetivo, notas e avaliação final de cada fase

### Configurações (`/settings`)
- Status da conexão Strava (com dados do atleta)
- Botão "Sincronizar agora" com feedback em tempo real
- Log de atividades importadas/atualizadas/ignoradas
- Histórico dos últimos 5 syncs
- Botão desconectar (com confirmação)
- Dados da conta do usuário
- Botão logout
- Nota sobre webhook automático (v2)

### Autenticação (`/auth`)
- Login e cadastro na mesma tela (toggle)
- Feedback de erro em português
- Proteção de rotas via middleware (redireciona para `/auth` se não logado)

---

## 7. Fluxo de Integração com Strava

```
Usuário → /api/strava/connect
  → redireciona para strava.com/oauth/authorize
  → Strava retorna code para /api/strava/callback
  → callback troca code por tokens
  → salva tokens em strava_connections (via admin client, bypass RLS)
  → redireciona para /settings?strava_connected=1

Usuário → botão "Sincronizar agora"
  → POST /api/strava/sync
  → verifica se token expirou (renova via refresh_token se necessário)
  → busca atividades do Strava paginadas (50/página)
  → filtra apenas type === "Run"
  → pula strava_activity_ids já existentes no banco
  → mapeia para estrutura interna via stravaActivityToRun()
  → insere via admin client
  → registra resultado em sync_logs
  → retorna { imported, updated, ignored }
```

**Refresh de token:** automático no início de cada sync. Se `Date.now()/1000 > expires_at - 300`, renova com `grant_type=refresh_token`.

**Proteção de segredos:**
- `STRAVA_CLIENT_SECRET` → nunca no frontend, só nas API routes
- `SUPABASE_SERVICE_ROLE_KEY` → só no servidor
- `access_token` / `refresh_token` → no banco, com RLS, nunca retornados ao frontend

---

## 8. Funções Utilitárias (lib/utils.ts)

```typescript
paceStringToSeconds("5:30")   → 330
secondsToPaceString(330)       → "5:30"
timeStringToSeconds("1:22:53") → 4973
secondsToTimeString(4973)      → "1:22:53"
secondsToReadable(4973)        → "1h 22min"
calcPace(distKm, durationSec)  → pace em seg/km
metersToKm(1500)               → 1.5
mpsToSecPerKm(3.0)             → 333 (5:33/km)

totalDistanceKm(runs)
totalDurationSeconds(runs)
longestRun(runs)
bestPace(runs)
weeklyVolumeKm(runs, date?)
monthlyVolumeKm(runs, date?)
groupByWeek(runs)              → WeeklyVolume[]
groupByMonth(runs)             → MonthlyVolume[]
buildPaceTrend(runs)           → PaceTrend[]

isProbableDuplicate(a, b)      → boolean (mesma data + dist <2% diff + dur <5% diff)

formatDate("2024-05-03")       → "03/05/2024"
formatDateShort("2024-05-03")  → "03/05"
formatDistanceKm(17.92)        → "17.92 km"
runTypeLabel("long_run")       → "Longão"
sourceLabel("strava+ai")       → "Strava + IA"
```

---

## 9. Tipos TypeScript (types/index.ts)

Principais tipos exportados:
- `Run` — corrida completa com todos os campos
- `RunSource` — `"strava" | "manual" | "imported_ai" | "strava+ai"`
- `RunType` — `"easy" | "long_run" | "tempo" | "intervals" | "race" | "recovery" | "steady" | "progression" | "other"`
- `Goal` — meta/prova com cenários
- `RaceStrategy` — estratégia com splits em JSON
- `CoachReport` — relatório do treinador
- `TrainingCycle` — ciclo de treino
- `Projection` — projeção por distância e cenário
- `SyncLog` — log de sincronização
- `WeeklyVolume`, `MonthlyVolume`, `PaceTrend` — tipos para gráficos
- `DashboardStats` — tipo calculado para o dashboard

---

## 10. Variáveis de Ambiente

Arquivo `.env.local.example` existe na raiz do projeto.

```env
# Supabase → Settings → API
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# NUNCA expor no frontend
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Strava → strava.com/settings/api
STRAVA_CLIENT_ID=12345
STRAVA_CLIENT_SECRET=abc123...

# Para webhook (v2)
STRAVA_VERIFY_TOKEN=limiar_webhook_token

# URL da aplicação
NEXT_PUBLIC_APP_URL=http://localhost:3000  # ou URL da Vercel em prod
```

---

## 11. Setup Necessário (Ainda Não Feito)

O código está completo, mas ainda é necessário:

### 11.1 Supabase
- [ ] Criar conta em supabase.com
- [ ] Criar novo projeto
- [ ] Ir em SQL Editor → executar `supabase/schema.sql`
- [ ] Após primeiro login na aplicação, executar `supabase/seed.sql`
- [ ] Copiar Project URL, anon key e service_role key para `.env.local`

### 11.2 Strava
- [ ] Criar app em strava.com/settings/api
- [ ] Para desenvolvimento: `Authorization Callback Domain = localhost`
- [ ] Para produção: domínio da Vercel
- [ ] Copiar Client ID e Client Secret para `.env.local`

### 11.3 GitHub
- [ ] Criar repositório (pode ser privado)
- [ ] `cd limiar-app && git init && git add . && git commit -m "feat: initial v1" && git remote add origin ... && git push`

### 11.4 Vercel
- [ ] Criar conta em vercel.com
- [ ] New Project → importar do GitHub
- [ ] Adicionar todas as env vars
- [ ] `NEXT_PUBLIC_APP_URL` = URL gerada pela Vercel

### 11.5 Instalar dependências localmente
```bash
cd limiar-app
npm install
npm run dev
```

---

## 12. Bugs Conhecidos e Pontos de Atenção

### 12.1 Seed SQL — variável duplicada
O seed original tinha um erro de nome de variável (`r25_dummy`) que foi corrigido na versão final. O arquivo atual em `supabase/seed.sql` usa `INSERT INTO runs ... VALUES` em bloco, sem dependência de variáveis UUID para as últimas corridas.

### 12.2 Página de edição de corrida ainda não existe
Existe link para `/runs/[id]/edit` na `RunDetailContent.tsx`, mas a página ainda não foi criada. Precisa de:
- `src/app/runs/[id]/edit/page.tsx` — server component que busca a corrida
- Reutilizar `RunForm` com prop `initial` preenchida

### 12.3 Deduplicação Strava + IA ainda é simples
A função `isProbableDuplicate()` existe em `utils.ts`, mas **não está sendo usada no fluxo de sync**. O sync atual apenas pula `strava_activity_ids` já existentes. A deduplicação cruzada (identificar que uma corrida `imported_ai` é a mesma que uma corrida do Strava) precisa ser implementada na route `/api/strava/sync`.

Lógica sugerida:
```
Para cada nova atividade do Strava:
  1. Verificar se strava_activity_id já existe → ignorar
  2. Se não existir, verificar se existe corrida manual/imported_ai
     com mesma data E distância com diferença < 2%
  3. Se match encontrado:
     - Atualizar a corrida existente com strava_activity_id e dados objetivos do Strava
     - Mudar source para "strava+ai"
     - Preservar coach_feedback, notes, raw_text, tags existentes
  4. Se não há match → inserir nova corrida (source: "strava")
```

### 12.4 Mapa de percurso não implementado
O campo `map_polyline` (encoded Google Polyline do Strava) é salvo, mas não há visualização. Para implementar:
- Instalar `@mapbox/polyline` ou decodificar manualmente
- Usar Leaflet.js (open source) ou Mapbox GL (free tier)
- Inserir no componente `RunDetailContent`

### 12.5 Admin client usa require() dinâmico
Em `src/lib/supabase/server.ts`, o `createAdminClient` usa `require("@supabase/supabase-js")` para evitar importação no cliente. Pode ser refatorado para usar um arquivo separado `src/lib/supabase/admin.ts` que só é importado em arquivos de server.

### 12.6 Página `/runs/[id]/edit` referenciada mas não criada
Há links para edição no detalhe da corrida, mas a página não existe ainda. Vai gerar 404 ao clicar.

### 12.7 Contagem de corridas importadas do Strava na página de settings
A query atual em `settings/page.tsx` usa `.select("id", { count: "exact" })` mas depois acessa `.length` do data array em vez do count. Precisa ajustar para `{ count: "exact", head: true }` e usar `count` direto.

---

## 13. Melhorias e Funcionalidades Futuras

### Prioridade Alta (v1.1)

#### Página de edição de corrida
- Reutilizar `RunForm` com dados pré-preenchidos
- Permitir adicionar análise do treinador em corridas existentes (especialmente nas importadas do Strava)

#### Deduplicação inteligente Strava + IA
- Implementar lógica descrita na seção 12.3
- Adicionar indicador visual de "mesclagem" na corrida

#### Webhook Strava (auto-sync)
- Endpoint `GET /api/strava/webhook` para validação (retorna hub.challenge)
- Endpoint `POST /api/strava/webhook` para processar eventos
- Eventos a tratar: `create`, `update`, `delete`
- Verificar viabilidade com o free tier da Vercel (cold start pode ser lento)
- Necessário registrar o webhook via curl na API do Strava

#### Fix do bug de contagem na settings

### Prioridade Média (v1.2)

#### Mapa do percurso
- Decodificar `map_polyline` e exibir mapa estático ou interativo
- Opção 1: Leaflet.js (open source, self-hosted tiles)
- Opção 2: Mapbox (50k map loads/mês no free tier)
- Opção 3: Strava Embed (mais simples, mas menos flexível)

#### PWA (Progressive Web App)
- Adicionar `manifest.json`
- Configurar service worker para cache offline
- Permitir instalação na tela inicial do celular
- Ícones em múltiplos tamanhos

#### Adição de análise do treinador diretamente nas corridas do Strava
- Botão "Adicionar análise" na página de corrida individual
- Modal/drawer com textarea para colar output do treinador
- Salvar em `coach_feedback`

#### Ciclos de treino com corridas vinculadas
- Mostrar corridas de cada fase dentro do ciclo
- Calcular volume real da fase

#### Gráfico Pace × FC
- Scatter plot com pace no eixo X e FC no eixo Y
- Ajuda a visualizar evolução da economia de corrida
- Corridas antigas: alta FC + pace lento → corridas recentes: FC menor + pace melhor

### Prioridade Baixa (v2)

#### Relatório semanal automático
- Todo domingo, um relatório automático com resumo da semana
- Usando a própria IA do Cowork/Claude para gerar análise

#### Comparação de corridas
- Selecionar duas ou mais corridas e comparar lado a lado
- Útil para ver evolução entre treinos do mesmo tipo

#### Exportação
- Exportar histórico em CSV
- Gerar PDF com relatório do período

#### Notificações
- Telegram como canal opcional (foi explicitamente mencionado como "opcional futuro")
- Ou push notification via service worker

#### Integração com Garmin Connect
- Alternativa ao Strava para quem tem Garmin
- API disponível mas mais complexa que Strava

#### Tela de onboarding
- Wizard para configuração inicial
- Guia passo a passo: criar conta → conectar Strava → rodar seed → ver dashboard

---

## 14. Decisões de Arquitetura e Trade-offs

### Por que App Router e não Pages Router?
- App Router permite Server Components, reduzindo JS no cliente
- Data fetching direto nos page components (sem useEffect/SWR para dados iniciais)
- Melhor para SEO e performance mobile

### Por que Supabase e não Firebase/PlanetScale?
- PostgreSQL real (permite SQL complexo para relatórios futuros)
- RLS nativo (sem precisar implementar autorização na aplicação)
- Auth integrado
- Free tier generoso para uso pessoal (500MB DB, sem limite de usuários ativos)

### Por que não usar SWR/React Query?
Na v1, os dados são buscados nos Server Components e passados como props. Isso é suficiente para um dashboard pessoal. Em v2, se houver necessidade de real-time ou invalidação de cache, adicionar SWR nos componentes que precisam de refresh.

### Por que admin client nas API routes e não service key no cliente?
Tokens do Strava são dados sensíveis. O service role key bypassa RLS e não pode ser exposto. Toda operação privilegiada acontece nas API routes, que rodam no servidor.

### Por que Recharts e não Chart.js/Victory/Nivo?
Recharts é a opção mais natural para projetos React — componentes declarativos, fácil customização via props, bem mantida. Para os gráficos necessários (barras, linhas, área) é mais que suficiente.

---

## 15. Limitações dos Planos Gratuitos

| Serviço | Limite | Observação |
|---------|--------|-----------|
| Supabase Free | 500MB DB, 2GB bandwidth/mês | Sem impacto para uso pessoal (< 1MB de dados) |
| Vercel Hobby | 100GB bandwidth, 100h serverless/mês | Sem impacto. Cold starts são aceitáveis |
| Strava API | 200 req/15min, 2000 req/dia | Suficiente para sync manual. Webhook pode ser complexo |
| Strava Webhook | Precisa de endpoint HTTPS acessível publicamente | Vercel cumpre esse requisito |

**Atenção Strava:** Para registrar o webhook do Strava, é necessário fazer uma chamada `POST` para a API do Strava com a URL do endpoint. Isso precisa ser feito manualmente via curl ou script, e o Strava irá fazer uma chamada `GET` de validação (retornar `hub.challenge`).

---

## 16. Próximos Passos Imediatos

### Para colocar a aplicação no ar pela primeira vez:

**Passo 1 — Dependências**
```bash
cd limiar-app
npm install
```

**Passo 2 — Supabase**
1. Criar projeto em supabase.com
2. SQL Editor → executar `supabase/schema.sql`
3. Copiar credenciais

**Passo 3 — Variáveis de ambiente**
```bash
cp .env.local.example .env.local
# editar .env.local com as chaves reais
```

**Passo 4 — Testar localmente**
```bash
npm run dev
# abrir localhost:3000
# criar conta
# SQL Editor do Supabase → executar seed.sql
# verificar se dados aparecem no dashboard
```

**Passo 5 — GitHub**
```bash
git init
git add .
git commit -m "feat: limiar v1 — running performance dashboard"
git remote add origin https://github.com/SEU_USUARIO/limiar-app.git
git push -u origin main
```

**Passo 6 — Vercel**
1. vercel.com → New Project → importar repo
2. Adicionar env vars (todas do .env.local)
3. Deploy automático

**Passo 7 — Strava**
1. strava.com/settings/api → criar app
2. Authorization Callback Domain: domínio da Vercel
3. Adicionar STRAVA_CLIENT_ID e STRAVA_CLIENT_SECRET no Vercel
4. Redeploy
5. Acessar /settings → Conectar Strava → Sincronizar

---

## 17. Dúvidas e Questões em Aberto

### Q1: O seed deve ser executado automaticamente ou manualmente?
**Atual:** Manual (via SQL Editor do Supabase). Isso é mais seguro e explícito.  
**Alternativa:** Criar um endpoint `/api/seed` protegido que só pode ser chamado uma vez. Mas adiciona complexidade.  
**Recomendação:** Manter manual por enquanto.

### Q2: O que fazer quando o Strava importar uma corrida que já existe como imported_ai?
**Atual:** O sync apenas verifica `strava_activity_id`. Corridas `imported_ai` não têm esse campo, então seriam duplicadas.  
**Necessário:** Implementar a deduplicação descrita na seção 12.3.  
**Critério de match sugerido:** mesma data + distância com diferença < 2% + duração com diferença < 5%.

### Q3: Como lidar com corridas de outros esportes (bike, swim, etc)?
**Atual:** O sync filtra `type === "Run"` na resposta do Strava. Outros esportes são ignorados.  
**Observação:** O campo `type` do Strava pode ser `"Run"` ou `"VirtualRun"`. A verificação atual só pega `"Run"`. Verificar se `"VirtualRun"` também deve ser importado.

### Q4: O mapa deve ser exibido na lista de corridas ou só no detalhe?
**Recomendação:** Só no detalhe, para não comprometer performance da lista.

### Q5: O relatório completo do treinador deve ser editável?
**Atual:** Somente leitura, exibido em textarea com scroll.  
**Possível:** Adicionar botão "Editar" que abre um editor de texto. Mas risca do escopo de v1.

### Q6: Precisa de paginação no histórico de corridas?
Com 29 corridas iniciais, não. Mas com um ano de treinos diários pode chegar a ~250 corridas. Implementar paginação ou virtualização de lista (react-virtual) quando necessário.

### Q7: O dashboard deve ser atualizado em tempo real?
Para v1, não. O refresh manual (F5) é suficiente para um uso pessoal. Em v2, considerar Supabase Realtime para mostrar novas corridas ao vivo.

### Q8: Como o usuário vai adicionar análise do treinador em corridas futuras?
**Fluxo esperado:**
1. Corre + Strava importa automaticamente (via webhook) ou sync manual
2. Envia dados para o treinador de IA (ChatGPT/Claude/outro)
3. Recebe análise em texto
4. Vai em `/runs/[id]` → clica "Adicionar análise" → cola o texto

Isso ainda não tem UI dedicada além do formulário de edição.

---

## 18. Referências e Links Úteis

- **Supabase Auth docs:** https://supabase.com/docs/guides/auth/server-side/nextjs
- **Strava API v3:** https://developers.strava.com/docs/reference/
- **Strava OAuth:** https://developers.strava.com/docs/authentication/
- **Strava Webhooks:** https://developers.strava.com/docs/webhooks/
- **Recharts docs:** https://recharts.org/en-US/api
- **Next.js App Router:** https://nextjs.org/docs/app
- **Tailwind CSS:** https://tailwindcss.com/docs
- **Supabase RLS:** https://supabase.com/docs/guides/auth/row-level-security
- **Vercel deployment:** https://vercel.com/docs/deployments/overview

---

## 19. Histórico de Decisões

| Data | Decisão | Motivo |
|------|---------|--------|
| 26/05/2026 | App web, não Telegram | Preferência explícita do usuário |
| 26/05/2026 | Dark + laranja | Escolha do usuário (estilo Strava/Garmin) |
| 26/05/2026 | Nome: Limiar | Escolha do usuário (remete ao limiar aeróbico) |
| 26/05/2026 | Email/senha e não OAuth social | Simplicidade, sem dependência de Google/GitHub |
| 26/05/2026 | Seed manual via SQL Editor | Mais seguro que endpoint de seed |
| 26/05/2026 | Webhook como v2 | Sync manual suficiente para v1, webhook adiciona complexidade |
| 26/05/2026 | Recharts e não Nivo/Victory | Melhor integração React, mais simples |
| 26/05/2026 | `imported_ai` como source | Preservar rastreabilidade dos dados do relatório |

---

*Documento gerado pelo Cowork (Claude) — handoff para Claude Code*  
*Versão do scaffold: v1.0 — 44 arquivos criados*  
*Última atualização: 26/05/2026*
