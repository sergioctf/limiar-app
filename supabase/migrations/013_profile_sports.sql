-- Practiced sports per athlete — drives the weekly plan.
-- Values: 'musculacao' | 'corrida' | 'natacao' | 'ciclismo'.
-- Default keeps the app's original running + strength focus.

alter table profiles
  add column if not exists sports text[] not null default '{corrida,musculacao}';
