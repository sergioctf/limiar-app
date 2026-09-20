-- A conversa do atleta com a IA central (src/lib/ai-brief.ts, /ia).
--
-- Guardada por decisão do Sérgio (20/09): "sem limite, gravado com data, tudo
-- organizado". Duas coisas dependem disso — dar continuidade à conversa e
-- poder auditar depois o que a IA disse, já que ela fala sobre treino e saúde.
--
-- Uma linha por mensagem, numa única linha do tempo por atleta. `date` é o dia
-- do atleta (America/Sao_Paulo), não o do servidor: na Vercel o relógio é UTC e
-- depois das 21h no Brasil já é amanhã — é por `date` que a tela agrupa
-- "Hoje", "Ontem", "18 de setembro".
create table if not exists public.ai_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  -- 'sugestao' = leitura determinística, respondida sem chamar o modelo;
  -- 'aberta'   = pergunta livre, respondida pelo modelo sobre o mesmo dossiê.
  kind       text not null default 'aberta' check (kind in ('aberta', 'sugestao')),
  -- Qual leitura, quando é sugestão ("semana", "evolucao", "carga"…).
  topic      text,
  content    text not null,
  -- De onde vieram os números daquela resposta, para ela poder se explicar.
  sources    jsonb not null default '[]'::jsonb,
  date       date not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_messages_user_created
  on public.ai_messages (user_id, created_at);

alter table public.ai_messages enable row level security;

drop policy if exists "Read own ai messages" on public.ai_messages;
create policy "Read own ai messages" on public.ai_messages for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Insert own ai messages" on public.ai_messages;
create policy "Insert own ai messages" on public.ai_messages for insert to authenticated
  with check (user_id = auth.uid());

-- Apagar é do atleta: a conversa é dele, e guardar sem poder apagar não é guardar.
drop policy if exists "Delete own ai messages" on public.ai_messages;
create policy "Delete own ai messages" on public.ai_messages for delete to authenticated
  using (user_id = auth.uid());
