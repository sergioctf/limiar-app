/**
 * GET /api/cron/notify-morning — daily, 05:30 BRT (08:30 UTC).
 *
 * Two jobs:
 *  1. Race reminders (D-7, D-1, race day).
 *  2. The first pass of the morning notification. Athletes without a watch get
 *     theirs now; athletes with one get theirs only if the night has already
 *     arrived — otherwise a later pass sends it (see `lib/morning-dispatch`).
 */
import { NextRequest, NextResponse } from "next/server";
import { withJobReceipt } from "@/lib/job-run";
import { createAdminClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push";
import { wantsNotification } from "@/lib/notification-prefs";
import { brtDateStr } from "@/lib/plan-notify";
import { authorizeCron } from "@/lib/cron-auth";
import { dispatchMorning } from "@/lib/morning-dispatch";

/*
  Nunca prerenderizar.

  Sem isto o `next build` tenta gerar a rota estaticamente, executa o handler
  e ele estoura em `request.headers`. O Next engolia esse erro — até o recibo
  de `job_runs` começar a registrá-lo, e a build passar a gravar execuções
  falsas no banco a partir da máquina de quem compila (09/11).
*/
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handler(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now   = new Date();
  const admin = createAdminClient();

  const { data: subs } = await admin.from("push_subscriptions").select("user_id").order("user_id");
  if (!subs || subs.length === 0) {
    return NextResponse.json({ ok: true, message: "No push subscribers" });
  }
  const userIds: string[] = Array.from(new Set(subs.map((s: { user_id: string }) => s.user_id)));

  // ── Race reminders ─────────────────────────────────────────────────────────
  const { data: prefRows } = await admin.from("profiles").select("id, notification_prefs").in("id", userIds);
  const optedOut = new Set(
    ((prefRows ?? []) as Array<{ id: string; notification_prefs: unknown }>)
      .filter(r => !wantsNotification(r.notification_prefs, "dailyWorkout"))
      .map(r => r.id),
  );

  const todayStr = brtDateStr(now);
  const today0   = new Date(`${todayStr}T12:00:00`);
  const races: Record<string, string> = {};

  for (const userId of userIds) {
    if (optedOut.has(userId)) continue;
    try {
      const { data: rows } = await admin
        .from("races").select("name, race_date, distance_km")
        .eq("user_id", userId).is("time_seconds", null).gte("race_date", todayStr);

      for (const race of rows ?? []) {
        const daysOut = Math.round((new Date(`${race.race_date}T12:00:00`).getTime() - today0.getTime()) / 86400000);
        const msg =
          daysOut === 7 ? { title: "Sua prova é em 1 semana", body: `${race.name} (${race.distance_km} km) — última semana de preparação.` }
          : daysOut === 1 ? { title: "Sua prova é amanhã", body: `${race.name} — descanse, hidrate-se e prepare tudo hoje.` }
          : daysOut === 0 ? { title: "Hoje é dia de prova", body: `${race.name} — confie no seu treino.` }
          : null;
        if (msg) {
          await sendPushToUser(admin, userId, {
            ...msg, url: "/races", tag: `limiar-race-reminder-${race.race_date}-${daysOut}`, icon: "/limiar_icone_app.png",
          }).catch(() => {});
          races[userId.slice(0, 8)] = `D-${daysOut}`;
        }
      }
    } catch {
      // races table may not exist — ignore
    }
  }

  // ── Morning notification, first pass ──────────────────────────────────────
  const morning = await dispatchMorning(admin, { now, final: false, legacyPass: true });

  return NextResponse.json({ ok: true, ran_at: now.toISOString(), races, morning });
}

/*
  O recibo desta execução vai para `job_runs`.

  Este app nunca sofreu de exceção não capturada — sofreu de trabalho que
  simplesmente não acontecia, calado, por meses. O invólucro existe para que a
  pergunta "o cron rodou?" tenha resposta (dívida A5, `src/lib/job-run.ts`).
*/
export const GET = withJobReceipt("notify-morning", handler);
