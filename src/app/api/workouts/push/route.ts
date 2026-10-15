/**
 * POST /api/workouts/push
 *
 * Põe um treino no calendário do intervals.icu, que o entrega ao relógio.
 * O caminho e o porquê estão em `src/lib/icu-workout.ts`; o que faz a conversa
 * com o intervals.icu está em `src/lib/icu-push.ts`, compartilhado com a
 * mudança de dia e com o envio automático da semana.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { loadIcuConnection, pushIcuSession } from "@/lib/icu-push";
import { normalizePrefs } from "@/lib/workout-builder";
import type { WeeklyPlanDay } from "@/types";

export const dynamic = "force-dynamic";

const json = (value: unknown, status = 200) =>
  NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const DIAS: WeeklyPlanDay["day"][] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "Entre novamente para enviar o treino." }, 401);

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const weekStart = typeof body?.weekStart === "string" && DATA.test(body.weekStart) ? body.weekStart : null;
  const day = DIAS.includes(body?.day as WeeklyPlanDay["day"]) ? body!.day as WeeklyPlanDay["day"] : null;
  const session = body?.session as WeeklyPlanDay | undefined;

  if (!weekStart || !day) return json({ error: "Treino sem data para enviar." }, 400);
  if (!session || typeof session !== "object") return json({ error: "Treino inválido." }, 400);

  const admin = createAdminClient();
  const conn = await loadIcuConnection(admin, user.id);
  if (!conn) {
    return json({
      error: "Conecte o intervals.icu em Configurações para enviar treinos ao relógio.",
      needsConnection: true,
    }, 409);
  }

  const { data: perfil } = await admin.from("profiles").select("training_prefs").eq("id", user.id).maybeSingle();
  const { measureBy } = normalizePrefs((perfil as { training_prefs?: unknown } | null)?.training_prefs);

  const r = await pushIcuSession(conn, { session: { ...session, day }, weekStart, measureBy });

  if (r.ok) return json({ ok: true, eventId: r.eventId });
  if (r.reason === "unauthorized") {
    return json({
      error: "O intervals.icu recusou a chave. Gere uma nova em Settings → Developer Settings e conecte de novo.",
      needsConnection: true,
    }, 409);
  }
  if (r.reason === "no_structure") {
    return json({ error: "Este treino não tem passos que o relógio entenda." }, 400);
  }
  console.error("[workouts/push]", r.detail);
  return json({ error: "O intervals.icu não aceitou o treino agora. Tente de novo em instantes." }, 502);
}
