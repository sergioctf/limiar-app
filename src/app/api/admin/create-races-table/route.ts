import { NextRequest, NextResponse } from "next/server";

const SQL = `
-- Races table: stores official race results + upcoming target races
CREATE TABLE IF NOT EXISTS races (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid REFERENCES auth.users NOT NULL,
  name            text NOT NULL,
  race_date       date NOT NULL,
  distance_km     numeric NOT NULL,
  time_seconds    int,            -- NULL = future race (no result yet)
  avg_hr          int,
  notes           text,
  location        text,
  is_target_race  boolean DEFAULT false,
  bib_number      text,
  weather         text,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE races ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own races"
  ON races FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS races_user_date_idx
  ON races (user_id, race_date DESC);
`.trim();

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("secret") !== "limiar_admin_2026") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    message: "Run the SQL below in the Supabase SQL editor",
    project:  "https://supabase.com/dashboard/project/ydalnbvdtoxcnfukedsf/sql/new",
    sql:      SQL,
  });
}
