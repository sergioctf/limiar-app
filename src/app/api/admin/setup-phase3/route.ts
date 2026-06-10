/**
 * GET /api/admin/setup-phase3?secret=limiar_admin_2026
 * Creates coach_chat_messages and athlete_notes tables (Fase 3 — Coach Memory).
 * Safe to run multiple times (IF NOT EXISTS / DO $$ checks).
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

async function exec(admin: ReturnType<typeof createAdminClient>, sql: string, label: string) {
  const { error } = await admin.rpc("exec_sql" as never, { sql } as never);
  return { [label]: error ? `error: ${error.message}` : "ok" };
}

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  const adminSecret = process.env.ADMIN_SECRET ?? "limiar_admin_2026";
  if (secret !== adminSecret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const results: Record<string, string> = {};

  // ── coach_chat_messages ───────────────────────────────────────────────────
  Object.assign(results, await exec(admin, `
    CREATE TABLE IF NOT EXISTS coach_chat_messages (
      id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      report_id   uuid REFERENCES coach_reports(id) ON DELETE SET NULL,
      role        text NOT NULL CHECK (role IN ('user', 'assistant')),
      content     text NOT NULL,
      created_at  timestamptz DEFAULT now() NOT NULL
    );
  `, "chat_messages_table"));

  Object.assign(results, await exec(admin,
    `CREATE INDEX IF NOT EXISTS chat_messages_user_report ON coach_chat_messages(user_id, report_id, created_at);`,
    "chat_messages_index"
  ));

  Object.assign(results, await exec(admin,
    `ALTER TABLE coach_chat_messages ENABLE ROW LEVEL SECURITY;`,
    "chat_messages_rls"
  ));

  Object.assign(results, await exec(admin, `
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename='coach_chat_messages' AND policyname='Users can manage own chat messages'
      ) THEN
        CREATE POLICY "Users can manage own chat messages"
          ON coach_chat_messages FOR ALL USING (auth.uid() = user_id);
      END IF;
    END $$;
  `, "chat_messages_policy"));

  // ── athlete_notes ─────────────────────────────────────────────────────────
  Object.assign(results, await exec(admin, `
    CREATE TABLE IF NOT EXISTS athlete_notes (
      id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      category    text NOT NULL CHECK (category IN ('injury','preference','availability','goal','observation')),
      content     text NOT NULL,
      source      text NOT NULL DEFAULT 'chat',
      active      boolean NOT NULL DEFAULT true,
      created_at  timestamptz DEFAULT now() NOT NULL,
      updated_at  timestamptz DEFAULT now() NOT NULL
    );
  `, "athlete_notes_table"));

  Object.assign(results, await exec(admin,
    `CREATE INDEX IF NOT EXISTS athlete_notes_user_active ON athlete_notes(user_id, active, created_at DESC);`,
    "athlete_notes_index"
  ));

  Object.assign(results, await exec(admin,
    `ALTER TABLE athlete_notes ENABLE ROW LEVEL SECURITY;`,
    "athlete_notes_rls"
  ));

  Object.assign(results, await exec(admin, `
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename='athlete_notes' AND policyname='Users can manage own athlete notes'
      ) THEN
        CREATE POLICY "Users can manage own athlete notes"
          ON athlete_notes FOR ALL USING (auth.uid() = user_id);
      END IF;
    END $$;
  `, "athlete_notes_policy"));

  Object.assign(results, await exec(admin, `
    DROP TRIGGER IF EXISTS set_updated_at ON athlete_notes;
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON athlete_notes
      FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
  `, "athlete_notes_trigger"));

  // ── push_subscriptions ────────────────────────────────────────────────────
  Object.assign(results, await exec(admin, `
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
  `, "push_subscriptions_table"));

  Object.assign(results, await exec(admin,
    `CREATE INDEX IF NOT EXISTS push_subscriptions_user_created ON push_subscriptions(user_id, created_at DESC);`,
    "push_subscriptions_index"
  ));

  Object.assign(results, await exec(admin,
    `ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;`,
    "push_subscriptions_rls"
  ));

  Object.assign(results, await exec(admin, `
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename='push_subscriptions' AND policyname='Users can manage own push subscriptions'
      ) THEN
        CREATE POLICY "Users can manage own push subscriptions"
          ON push_subscriptions FOR ALL USING (auth.uid() = user_id);
      END IF;
    END $$;
  `, "push_subscriptions_policy"));

  Object.assign(results, await exec(admin, `
    DROP TRIGGER IF EXISTS set_updated_at ON push_subscriptions;
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON push_subscriptions
      FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
  `, "push_subscriptions_trigger"));

  const allOk = Object.values(results).every(v => v === "ok");
  return NextResponse.json({ success: allOk, results });
}
