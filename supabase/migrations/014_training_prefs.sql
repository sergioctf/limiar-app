-- Per-athlete weekly layout: which days they run and lift, which run is long,
-- and how many quality sessions they want. The plan generator follows this
-- instead of a fixed template.

alter table profiles
  add column if not exists training_prefs jsonb;
