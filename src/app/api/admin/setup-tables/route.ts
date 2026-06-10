/**
 * POST /api/admin/setup-tables?secret=limiar_admin_2026
 * Creates push_subscriptions and other tables directly via Supabase SQL
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  const adminSecret = process.env.ADMIN_SECRET ?? "limiar_admin_2026";
  if (secret !== adminSecret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const results: Record<string, string> = {};

  try {
    // Create push_subscriptions table
    const { error: tableError } = await admin.from("push_subscriptions").select("id").limit(1);

    // If table doesn't exist, we get an error. Try to create it.
    if (tableError && tableError.message.includes("does not exist")) {
      console.log("[setup] push_subscriptions table doesn't exist, attempting to create...");

      // Use the Supabase client to execute raw SQL
      const { error: createError } = await admin.rpc("query" as never, {
        sql: `
          CREATE TABLE IF NOT EXISTS push_subscriptions (
            id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
            user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            endpoint    text NOT NULL,
            p256dh_key  text NOT NULL,
            auth_key    text NOT NULL,
            user_agent  text,
            created_at  timestamptz DEFAULT now() NOT NULL,
            updated_at  timestamptz DEFAULT now() NOT NULL,
            UNIQUE(user_id, endpoint)
          );
        `,
      } as never);

      results.push_subscriptions_table = createError ? `error: ${createError.message}` : "created";
    } else {
      results.push_subscriptions_table = "already exists";
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error("[setup] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
