/**
 * GET /api/admin/create-perf-table?secret=limiar_admin_2026
 *
 * Returns the SQL to create the performance_tests table and attempts to run it
 * via the Supabase Management API.
 */
import { NextRequest, NextResponse } from "next/server";

// Admin routes should be removed or heavily restricted before multi-user production
const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "limiar_admin_2026";
const SUPABASE_PROJECT_ID = process.env.SUPABASE_PROJECT_ID ?? "ydalnbvdtoxcnfukedsf";

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS performance_tests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users NOT NULL,
  test_date date NOT NULL,
  distance_km numeric NOT NULL DEFAULT 3.0,
  time_seconds int NOT NULL,
  avg_hr int,
  max_hr int,
  notes text,
  vo2max_estimate numeric,
  vdot numeric,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE performance_tests ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'performance_tests'
      AND policyname = 'Users manage own tests'
  ) THEN
    CREATE POLICY "Users manage own tests"
      ON performance_tests FOR ALL
      USING (auth.uid() = user_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS perf_tests_user_date_idx
  ON performance_tests (user_id, test_date DESC);
`.trim();

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");

  if (secret !== ADMIN_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Attempt to run via Supabase Management API
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN ?? "";
  let managementApiStatus: number | string = "not_attempted";
  let managementApiMessage = "";

  if (accessToken) {
    try {
      const res = await fetch(
        `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_ID}/database/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: CREATE_SQL }),
        }
      );
      managementApiStatus = res.status;
      managementApiMessage = res.ok
        ? "Table created (or already exists)."
        : await res.text();
    } catch (err) {
      managementApiStatus = "fetch_error";
      managementApiMessage = String(err);
    }
  } else {
    managementApiStatus = "no_token";
    managementApiMessage =
      "SUPABASE_ACCESS_TOKEN env var not set — run the SQL manually.";
  }

  return NextResponse.json({
    sql_provided: CREATE_SQL,
    management_api_status: managementApiStatus,
    management_api_message: managementApiMessage,
    message:
      managementApiStatus === 200 || managementApiStatus === 201
        ? "Table ready."
        : "Run the SQL manually in the Supabase SQL editor if management_api_status is not 200/201.",
  });
}
