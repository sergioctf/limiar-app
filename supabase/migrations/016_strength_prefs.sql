-- Strength training configuration per athlete: which muscles on which days,
-- goal, experience, equipment, cardio add-ons and exercise preferences.
--
-- The generator builds sessions from this; the AI only reviews it and suggests
-- changes the athlete can accept or ignore.

alter table profiles
  add column if not exists strength_prefs jsonb;
