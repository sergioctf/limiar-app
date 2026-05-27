# Limiar — Hub de Performance na Corrida

Dashboard web pessoal para acompanhar evolução na corrida. Combina dados objetivos do Strava com análises qualitativas do treinador de IA.

## Stack

| Camada | Tech |
|--------|------|
| Frontend | Next.js 14 (App Router) + TypeScript |
| UI | Tailwind CSS (dark + laranja) |
| Charts | Recharts |
| Banco | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Deploy | Vercel |
| Integração | Strava API v3 |

---

## Setup rápido

### 1. Clonar e instalar

```bash
git clone https://github.com/SEU_USUARIO/limiar-app.git
cd limiar-app
npm install
```

### 2. Criar conta no Supabase

1. Acesse [supabase.com](https://supabase.com) → New project
2. Vá em **Settings → API** e copie:
   - `Project URL`
   - `anon public` key
   - `service_role` key (⚠️ nunca expor no frontend)

### 3. Criar tabelas no Supabase

1. Vá em **SQL Editor** no painel do Supabase
2. Cole e execute o conteúdo de `supabase/schema.sql`
3. Depois execute `supabase/seed.sql` para popular com seus dados históricos

### 4. Criar app no Strava

1. Acesse [strava.com/settings/api](https://www.strava.com/settings/api)
2. Crie um app com:
   - **Website**: `http://localhost:3000` (dev) / URL da Vercel (prod)
   - **Authorization Callback Domain**: `localhost` (dev) / domínio da Vercel (prod)
3. Copie `Client ID` e `Client Secret`

### 5. Variáveis de ambiente

```bash
cp .env.local.example .env.local
```

Preencha `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
STRAVA_CLIENT_ID=12345
STRAVA_CLIENT_SECRET=abc123...
STRAVA_VERIFY_TOKEN=limiar_webhook_token
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 6. Rodar localmente

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000)

1. Crie sua conta (cadastro na tela de login)
2. O seed já terá populado suas corridas históricas
3. Vá em **Configurações** → **Conectar Strava**
4. Sincronize suas corridas

---

## Deploy na Vercel

1. Crie conta em [vercel.com](https://vercel.com)
2. **New Project** → importe do GitHub
3. Em **Environment Variables**, adicione todas as variáveis do `.env.local`
4. Para `NEXT_PUBLIC_APP_URL` use a URL final da Vercel (ex: `https://limiar.vercel.app`)
5. No Strava, atualize o **Authorization Callback Domain** para o domínio da Vercel

---

## Estrutura do projeto

```
src/
├── app/
│   ├── page.tsx            # Dashboard
│   ├── runs/               # Histórico + [id] + new + [id]/edit
│   ├── analytics/          # Gráficos
│   ├── goals/              # Metas + projeções + estratégias
│   ├── coach/              # Relatórios + ciclos de treino
│   ├── settings/           # Strava + conta
│   ├── auth/               # Login/cadastro
│   └── api/
│       └── strava/         # connect, callback, sync, disconnect
├── components/
│   ├── layout/             # AppShell, Sidebar, MobileBottomNav
│   ├── dashboard/          # DashboardContent
│   ├── runs/               # RunCard, RunsContent, RunDetailContent, RunForm
│   ├── goals/              # GoalsContent
│   ├── coach/              # CoachContent
│   ├── charts/             # WeeklyVolume, PaceTrend, LongRun, HeartRate...
│   ├── settings/           # SettingsContent
│   └── shared/             # StatCard, Badges, States
├── lib/
│   ├── supabase/           # client, server, middleware
│   ├── strava.ts           # OAuth + API + mapper
│   └── utils.ts            # pace, tempo, agrupamento, deduplicação
└── types/
    └── index.ts            # Todos os tipos TypeScript
supabase/
├── schema.sql              # Schema completo com RLS
└── seed.sql                # Dados históricos do relatório
```

---

## Funcionalidades

### MVP (v1 — atual)
- [x] Autenticação com Supabase Auth
- [x] Dashboard mobile-first com stats e gráfico
- [x] Histórico de corridas com filtros e busca
- [x] Página individual de corrida com todos os dados
- [x] Formulário estruturado + texto livre para nova corrida
- [x] Metas, projeções (5k/10k/15k/meia/maratona) e estratégias
- [x] Relatórios do treinador com ciclos de treino
- [x] Gráficos: volume semanal/mensal, pace trend, longões, FC
- [x] Integração Strava OAuth 2.0
- [x] Sync manual do Strava
- [x] Settings da integração com logs
- [x] Seed inicial com 29 corridas + relatório completo do treinador

### Próximas versões (v2)
- [ ] Webhook Strava para sync automático
- [ ] Deduplicação inteligente Strava + IA
- [ ] Mapa do percurso (polyline decoder)
- [ ] Edição inline de corridas do Strava
- [ ] Adição de análise do treinador por corrida
- [ ] PWA (instalável no celular)
- [ ] Notificações push
- [ ] Exportação de relatórios em PDF

---

## Limitações dos planos gratuitos

| Serviço | Limite free | Impacto |
|---------|-------------|---------|
| Supabase | 500MB DB, 2 GB bandwidth | Sem impacto para uso pessoal |
| Vercel | 100 GB bandwidth, serverless functions | Sem impacto para uso pessoal |
| Strava API | 200 req/15min, 2000 req/dia | Suficiente para sync manual |

Para webhook do Strava: verificar se o endpoint HTTPS da Vercel aceita `GET` de validação antes de ativar.

---

## Segurança

- Row Level Security (RLS) ativo em todas as tabelas
- Tokens do Strava protegidos pelo Supabase (sem exposição ao frontend)
- Service role key apenas nas API routes do servidor
- HTTPS obrigatório em produção
