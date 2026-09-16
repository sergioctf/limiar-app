-- "Muito difícil" asks why before anything else happens.
--
-- Reasons outside the session itself (sleep, stress, something personal) are
-- recorded and change nothing. Only "the session itself was too heavy" leads to
-- a question, and only the athlete's yes lightens the next sessions:
-- `reduce_requested` holds that answer (null when it was never asked).
alter table public.run_feedback drop constraint if exists run_feedback_context_check;
alter table public.run_feedback add constraint run_feedback_context_check check (context in (
  'none', 'schedule', 'work', 'weather', 'fatigue', 'pain', 'other',
  'sleep', 'stress', 'personal', 'session_too_hard'
));
alter table public.run_feedback add column if not exists reduce_requested boolean;
-- `skipped` now means "answer later": the run keeps offering the check-in on its own page.
comment on column public.run_feedback.status is 'answered | skipped (o atleta deixou para responder depois, na página da corrida)';
