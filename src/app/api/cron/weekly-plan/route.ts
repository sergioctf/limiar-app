/**
 * GET /api/cron/weekly-plan
 * Runs every Monday at 00:00 (America/Sao_Paulo ≈ 03:00 UTC).
 *
 * Generates the training plan for the week that just started and pre-generates
 * the following week, so the athlete always has two weeks visible without
 * waiting on the AI. Existing plans are kept — only missing weeks are created.
 */
import { NextRequest, NextResponse } from "next/server";
import { withJobReceipt } from "@/lib/job-run";
import { createAdminClient } from "@/lib/supabase/server";
import { ensureWeeklyPlan, loadWeeklyPlan, mondayOf, nextMondayOf } from "@/lib/weekly-plan";
import { loadIcuConnection, pushIcuWeek } from "@/lib/icu-push";
import { normalizePrefs } from "@/lib/workout-builder";
import { authorizeCron } from "@/lib/cron-auth";

/*
  Nunca prerenderizar.

  Sem isto o `next build` tenta gerar a rota estaticamente, executa o handler
  e ele estoura em `request.headers`. O Next engolia esse erro — até o recibo
  de `job_runs` começar a registrá-lo, e a build passar a gravar execuções
  falsas no banco a partir da máquina de quem compila (09/11).
*/
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handler(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now   = new Date();
  const weeks = [mondayOf(now), nextMondayOf(now)];

  // Only athletes who have actually trained get a plan (avoids burning tokens
  // on dormant accounts).
  const { data: activeUsers } = await admin
    .from("runs")
    .select("user_id")
    .gte("date", new Date(now.getTime() - 60 * 86400000).toISOString().slice(0, 10))
    .is("deleted_at", null);

  const userIds: string[] = Array.from(
    new Set(((activeUsers ?? []) as Array<{ user_id: string }>).map(r => r.user_id)),
  );
  const results: Record<string, string> = {};

  for (const userId of userIds) {
    const perWeek: string[] = [];
    for (const week of weeks) {
      try {
        const res = await ensureWeeklyPlan(admin, userId, week);
        perWeek.push(`${week}:${res.plan ? (res.cached ? "cached" : "generated") : "failed"}`);
      } catch (err) {
        perWeek.push(`${week}:error(${err instanceof Error ? err.message : "unknown"})`);
      }
    }

    /*
      E a semana vai para o relógio.

      Esperar o atleta tocar "enviar" em cada treino, toda segunda, é esperar
      que ele não envie (Sérgio, 15/10). Quem conectou o intervals.icu já disse
      que quer os treinos no pulso; aqui eles chegam junto com o plano.

      Só a semana que começou — a seguinte ainda vai mudar, e um calendário com
      quinze dias de treino provisório é pior do que um com sete definitivos.
      E em melhor esforço: o plano é o produto, o envio é consequência.
    */
    try {
      perWeek.push(await sendWeekToWatch(admin, userId, weeks[0]));
    } catch (err) {
      perWeek.push(`watch:error(${err instanceof Error ? err.message : "unknown"})`);
    }

    results[userId] = perWeek.join(" ");
  }

  return NextResponse.json({ ok: true, ran_at: now.toISOString(), weeks, users: userIds.length, results });
}

/** Devolve uma linha de log; nunca lança. */
async function sendWeekToWatch(
  admin: ReturnType<typeof createAdminClient>, userId: string, week: string,
): Promise<string> {
  const conn = await loadIcuConnection(admin, userId);
  if (!conn) return "watch:no-connection";

  const { data: perfil } = await admin.from("profiles").select("training_prefs").eq("id", userId).maybeSingle();
  const prefs = normalizePrefs((perfil as { training_prefs?: unknown } | null)?.training_prefs);
  if (prefs.sendToWatch === false) return "watch:off";

  const { plan } = await loadWeeklyPlan(admin, userId, week);
  if (!plan) return "watch:no-plan";

  const r = await pushIcuWeek(conn, plan, week, prefs.measureBy ?? "km");
  return `watch:${r.enviados}sent/${r.pulados}skipped/${r.falhas}failed`;
}

/*
  O recibo desta execução vai para `job_runs`.

  Este app nunca sofreu de exceção não capturada — sofreu de trabalho que
  simplesmente não acontecia, calado, por meses. O invólucro existe para que a
  pergunta "o cron rodou?" tenha resposta (dívida A5, `src/lib/job-run.ts`).
*/
export const GET = withJobReceipt("weekly-plan", handler);
