-- Which notifications an athlete wants.
--
-- A single jsonb rather than four boolean columns, matching how training_prefs
-- and strength_prefs already live on this table: the set of notification kinds
-- will keep growing, and each new one should not be a migration.
--
-- Absent means "everything on". Push is opt-in at the browser level already —
-- someone who granted permission asked to hear from the app, and defaulting
-- them into silence would make the permission prompt a lie.

alter table profiles
  add column if not exists notification_prefs jsonb;
