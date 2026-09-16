/**
 * POST /api/health/garmin-readiness { value: 1–100 | null }
 *
 * The athlete types the Training Readiness their Garmin shows today. Optional
 * by design (Sérgio, 16/09): the Limiar score is the default and stands on its
 * own; this number joins it as one more signal, and doubles as the reference we
 * calibrate our model against. `null` clears it.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { athleteDateStr } from "@/lib/week";

export async function POST(request: NextRequest) {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });

  const body = await request.json().catch(() => null) as { value?: unknown } | null;
  const value = body?.value;
  const clearing = value === null;
  if (!clearing && !(typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 100)) {
    return NextResponse.json({ error: "Informe um número de 1 a 100." }, { status: 400 });
  }

  const date = athleteDateStr();
  const { error } = clearing
    ? await db.from("wellness_data").update({ garmin_readiness: null }).eq("user_id", user.id).eq("date", date)
    // Only this column: the night the watch already sent must stay untouched.
    : await db.from("wellness_data").upsert({ user_id: user.id, date, garmin_readiness: value }, { onConflict: "user_id,date" });

  if (error) return NextResponse.json({ error: "Não foi possível salvar agora." }, { status: 503 });
  return NextResponse.json({ ok: true, date, value: clearing ? null : value });
}
