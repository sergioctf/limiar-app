/**
 * GET /api/admin/create-push-table?secret=limiar_admin_2026
 * Creates push_subscriptions table directly
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
  const results: Record<string, unknown> = {};

  try {
    // Test if table exists by querying it
    const { data, error: selectError } = await admin
      .from("push_subscriptions")
      .select("id", { count: "exact" })
      .limit(1);

    if (!selectError) {
      results.status = "Table already exists";
      results.rows = data?.length || 0;
      return NextResponse.json({ success: true, results });
    }

    // If we get here, table doesn't exist. Try to create it.
    console.log("[create-push-table] Table doesn't exist, creating...");

    // Insert a dummy record to create the table
    // This is a workaround since we don't have direct SQL execution
    const { error: insertError } = await admin
      .from("push_subscriptions")
      .insert({
        user_id: "00000000-0000-0000-0000-000000000000",
        endpoint: "http://temp",
        p256dh_key: "temp",
        auth_key: "temp",
      })
      .select();

    if (insertError) {
      console.error("[create-push-table] Insert error:", insertError);
      results.error = insertError.message;
      results.code = insertError.code;
    } else {
      results.status = "Table created successfully";

      // Delete the dummy record
      await admin
        .from("push_subscriptions")
        .delete()
        .eq("user_id", "00000000-0000-0000-0000-000000000000");

      results.dummy_record = "deleted";
    }

    return NextResponse.json({ success: !insertError, results });
  } catch (err) {
    console.error("[create-push-table] Exception:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
