-- ============================================================
-- LIMIAR — Per-user wellness ingest token
-- Lets the iOS Shortcut POST Apple Health data without a login session.
-- Safe to run multiple times.
-- ============================================================

alter table profiles add column if not exists wellness_token text;

create unique index if not exists profiles_wellness_token_unique
  on profiles (wellness_token) where wellness_token is not null;
