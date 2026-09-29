-- 037 — Marcar o teste de 3 km para um dia.
--
-- Antes o teste só existia depois de feito: o app avisava "seu teste tem 8
-- semanas" e oferecia "Registrar novo teste", um formulário para preencher
-- **depois** de correr. Entre o aviso e o teste não havia nada — e é aí que a
-- intenção morre.
--
-- Agora o atleta marca o dia. O teste aparece na semana como sessão (no lugar
-- do treino de tiro, que é o que ele substitui na prática), e quando aquele dia
-- chega o check-in do treino pergunta se foi feito. Se não foi, remarca.
--
-- Um teste marcado por vez: "marcar de novo" é remarcar, não acumular.

create table if not exists public.planned_tests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null,
  distance_km numeric not null default 3,
  -- scheduled → o dia ainda vai chegar · done → virou performance_test
  -- skipped   → o atleta disse que não fez e não quis remarcar
  status      text not null default 'scheduled',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Um agendamento aberto por atleta.
create unique index if not exists planned_tests_one_open
  on public.planned_tests (user_id)
  where status = 'scheduled';

create index if not exists planned_tests_user_date
  on public.planned_tests (user_id, date);

alter table public.planned_tests enable row level security;

drop policy if exists "planned_tests_select_own" on public.planned_tests;
create policy "planned_tests_select_own" on public.planned_tests
  for select using (auth.uid() = user_id);

drop policy if exists "planned_tests_insert_own" on public.planned_tests;
create policy "planned_tests_insert_own" on public.planned_tests
  for insert with check (auth.uid() = user_id);

drop policy if exists "planned_tests_update_own" on public.planned_tests;
create policy "planned_tests_update_own" on public.planned_tests
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "planned_tests_delete_own" on public.planned_tests;
create policy "planned_tests_delete_own" on public.planned_tests
  for delete using (auth.uid() = user_id);
