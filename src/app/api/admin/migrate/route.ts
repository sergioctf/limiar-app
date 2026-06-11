/**
 * GET /api/admin/migrate?secret=limiar_admin_2026
 * Runs one-time DB migrations — safe to run multiple times (IF NOT EXISTS).
 *
 * Rate limited: 5 requests per hour per IP
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIP } from "@/lib/admin-rate-limit";

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  const adminSecret = process.env.ADMIN_SECRET ?? "limiar_admin_2026";

  if (secret !== adminSecret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rate limit: 5 requests per hour per IP
  const clientIP = getClientIP(request);
  const { allowed, remaining, resetAt } = checkRateLimit(`admin:migrate:${clientIP}`, 5, 60 * 60 * 1000);

  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limited", resetAt: new Date(resetAt).toISOString() },
      { status: 429 }
    );
  }

  const admin = createAdminClient();
  const results: Record<string, string> = {};

  // Create activities table
  const { error: e1 } = await admin.rpc("exec_sql" as never, {
    sql: `
      CREATE TABLE IF NOT EXISTS activities (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id uuid REFERENCES auth.users NOT NULL,
        strava_activity_id bigint UNIQUE,
        name text NOT NULL,
        sport_type text NOT NULL,
        date date NOT NULL,
        duration_seconds int,
        distance_m numeric,
        calories int,
        avg_hr int,
        elevation_gain_m numeric,
        source text DEFAULT 'strava',
        notes text,
        exercises jsonb,
        strava_raw_json jsonb,
        created_at timestamptz DEFAULT now(),
        deleted_at timestamptz
      );
    `,
  } as never);
  results.create_table = e1 ? `error: ${e1.message}` : "ok";

  // Enable RLS
  const { error: e2 } = await admin.rpc("exec_sql" as never, {
    sql: `ALTER TABLE activities ENABLE ROW LEVEL SECURITY;`,
  } as never);
  results.enable_rls = e2 ? `error: ${e2.message}` : "ok";

  // Create RLS policy
  const { error: e3 } = await admin.rpc("exec_sql" as never, {
    sql: `
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename='activities' AND policyname='Users manage own activities'
        ) THEN
          CREATE POLICY "Users manage own activities" ON activities
            FOR ALL USING (auth.uid() = user_id);
        END IF;
      END $$;
    `,
  } as never);
  results.create_policy = e3 ? `error: ${e3.message}` : "ok";

  // Create indexes
  const { error: e4 } = await admin.rpc("exec_sql" as never, {
    sql: `
      CREATE INDEX IF NOT EXISTS activities_user_date_idx ON activities (user_id, date DESC);
      CREATE INDEX IF NOT EXISTS activities_strava_id_idx ON activities (strava_activity_id) WHERE strava_activity_id IS NOT NULL;
    `,
  } as never);
  results.create_indexes = e4 ? `error: ${e4.message}` : "ok";

  // Audit log
  const success = !Object.values(results).some(v => typeof v === "string" && v.startsWith("error"));
  await admin
    .from("admin_audit_logs")
    .insert({
      action:       "migrate",
      client_ip:    clientIP,
      success,
      results:      results,
      performed_at: new Date().toISOString(),
    })
    .catch((err: unknown) => console.error("[migrate] Audit log failed:", err));

  return NextResponse.json({ ...results, remaining, message: "Migration complete" });
}
