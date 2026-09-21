-- Notas do treinador podem ter prazo (src/lib/athlete-notes.ts).
--
-- O chat do plano é uma conversa sobre UMA semana. Em 20/09, "essa segunda não
-- estou com tempo" virou uma nota permanente ("segunda-feira tem pouco tempo"),
-- e a semana seguinte foi escrita como se toda segunda fosse curta.
--
-- Agenda e preferência ditas no chat de uma semana passam a vencer na virada
-- dessa semana. Null = vale até alguém desativar (lesão, objetivo, observação).
alter table public.athlete_notes
  add column if not exists expires_at timestamptz;

-- Quem lê a memória pede "ativas e ainda no prazo".
create index if not exists athlete_notes_user_valid
  on public.athlete_notes (user_id, active, expires_at);
