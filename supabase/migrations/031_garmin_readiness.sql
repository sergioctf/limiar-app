-- Garmin Training Readiness, typed in by the athlete (optional).
-- intervals.icu does not deliver it; the Limiar score stands without it, and
-- when present it joins the score as one more signal (weight 0.25).
alter table public.wellness_data add column if not exists garmin_readiness smallint
  check (garmin_readiness between 1 and 100);
