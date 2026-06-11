/**
 * GET /api/admin/setup-audit?secret=limiar_admin_2026
 * Creates admin_audit_logs table for tracking admin route access.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  const adminSecret = process.env.ADMIN_SECRET ?? "limiar_admin_2026";

  if (secret !== adminSecret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  const { error } = await admin.rpc("exec_sql" as never, {
    sql: `
      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        action          text NOT NULL,
        client_ip       text,
        success         boolean,
        results         jsonb,
        performed_at    timestamptz DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON admin_audit_logs (action, performed_at DESC);
      CREATE INDEX IF NOT EXISTS audit_logs_ip_idx ON admin_audit_logs (client_ip, performed_at DESC);
    `,
  } as never);

  if (error) {
    return NextResponse.json(
      { error: `Failed to create table: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message: "admin_audit_logs table ready",
    sql: `SELECT * FROM admin_audit_logs ORDER BY performed_at DESC LIMIT 100;`,
  });
}
