-- Two changes to the post-run check-in (16/09/2026).
--
-- 1. "Responder depois" is not "não perguntar mais". `deferred` comes back on a
--    later visit while the run is still fresh; `skipped` is the athlete's
--    explicit "não quero responder", and never comes back.
-- 2. Before judging a session, the coach needs to know what was actually done:
--    the prescribed session, an adaptation that kept its purpose, or another
--    workout. `executed_text` is the athlete's own description ("8 × 400 m").
alter table public.run_feedback drop constraint if exists run_feedback_status_check;
alter table public.run_feedback add constraint run_feedback_status_check
  check (status in ('answered', 'skipped', 'deferred'));

alter table public.run_feedback add column if not exists execution text
  check (execution in ('as_planned', 'adapted', 'other'));
alter table public.run_feedback add column if not exists executed_text text
  check (char_length(executed_text) <= 300);

comment on column public.run_feedback.status is
  'answered | deferred (responder depois: volta a aparecer) | skipped (não quero responder: não volta)';
