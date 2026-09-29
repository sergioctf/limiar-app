/**
 * GET    /api/coach/planned-test → o teste marcado, se houver
 * POST   /api/coach/planned-test → marca (ou remarca) para uma data
 * DELETE /api/coach/planned-test → desmarca
 * PATCH  /api/coach/planned-test → fecha o marcado: feito ou não feito
 *
 * Um agendamento aberto por atleta: marcar de novo é remarcar. Ver
 * `lib/planned-test.ts` para o que o teste faz dentro da semana, e a migration
 * 037 para o índice que garante o "um por vez".
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { localDateStr } from "@/lib/week";

export const dynamic = "force-dynamic";

const json = (v: unknown, status = 200) =>
  NextResponse.json(v, { status, headers: { "Cache-Control": "private, no-store" } });

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A tabela pode não existir ainda: a tela some em vez de quebrar. */
const MISSING = "planned_tests";

export async function GET() {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { data, error } = await db
    .from("planned_tests")
    .select("id, date, distance_km, status")
    .eq("user_id", user.id).eq("status", "scheduled")
    .order("date").limit(1);

  if (error) {
    if (error.message.includes(MISSING)) return json({ test: null, storageReady: false });
    return json({ error: "Não foi possível ler o teste marcado." }, 500);
  }

  const row = data?.[0];
  return json({
    test: row ? { id: row.id, date: row.date, distanceKm: Number(row.distance_km), status: row.status } : null,
    storageReady: true,
  });
}

export async function POST(request: NextRequest) {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const body = await request.json().catch(() => null);
  const date = typeof body?.date === "string" && DATE.test(body.date) ? body.date : null;
  if (!date) return json({ error: "Escolha uma data." }, 400);
  if (date < localDateStr(new Date())) return json({ error: "Escolha uma data de hoje em diante." }, 400);

  // Remarcar é substituir: o índice único garante um agendamento aberto, e
  // deixar o antigo como "skipped" preservaria um histórico que ninguém lê.
  const { error: clearError } = await db
    .from("planned_tests").delete()
    .eq("user_id", user.id).eq("status", "scheduled");
  if (clearError?.message.includes(MISSING)) return json({ error: "Marcação de teste indisponível." }, 503);

  const { data, error } = await db
    .from("planned_tests")
    .insert({ user_id: user.id, date, distance_km: 3, status: "scheduled" })
    .select("id, date, distance_km, status").single();

  if (error) return json({ error: "Não foi possível marcar o teste." }, 500);

  return json({
    test: { id: data.id, date: data.date, distanceKm: Number(data.distance_km), status: data.status },
  });
}

export async function PATCH(request: NextRequest) {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const body = await request.json().catch(() => null);
  const status = body?.status === "done" || body?.status === "skipped" ? body.status : null;
  if (!status) return json({ error: "Status inválido." }, 400);

  const { error } = await db
    .from("planned_tests")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("user_id", user.id).eq("status", "scheduled");

  if (error) return json({ error: "Não foi possível atualizar o teste." }, 500);
  return json({ ok: true });
}

export async function DELETE() {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { error } = await db
    .from("planned_tests").delete()
    .eq("user_id", user.id).eq("status", "scheduled");

  if (error) return json({ error: "Não foi possível desmarcar." }, 500);
  return json({ ok: true });
}
