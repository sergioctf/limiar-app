/**
 * GET /api/cron/morning — the morning notification, as often as it is called.
 *
 * Vercel's plan runs a cron once a day, which cannot "send when the night
 * arrives". This endpoint is for a scheduler that can: Supabase pg_cron calling
 * it every 15 minutes between 05:00 and 09:00 BRT. Each call syncs the athletes
 * still waiting and sends to whoever's night has landed; `notification_log`
 * keeps it to one message a day. From 08:30 the pass is final and sends to
 * everyone still waiting.
 *
 * Safe to call at any hour — outside the morning window it does nothing.
 */
import { NextRequest, NextResponse } from "next/server";
import { withJobReceipt } from "@/lib/job-run";
import { createAdminClient } from "@/lib/supabase/server";
import { authorizeCron } from "@/lib/cron-auth";
import { dispatchMorning } from "@/lib/morning-dispatch";
import { toBrt } from "@/lib/plan-notify";

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

  const now = new Date();
  const brt = toBrt(now);
  const minutes = brt.getUTCHours() * 60 + brt.getUTCMinutes();

  if (minutes < 5 * 60 || minutes > 9 * 60 + 30) {
    return NextResponse.json({ ok: true, skipped: "fora da janela da manhã (05:00–09:30)" });
  }

  const results = await dispatchMorning(createAdminClient(), { now, final: minutes >= 8 * 60 + 30 });
  return NextResponse.json({ ok: true, ran_at: now.toISOString(), results });
}

/*
  O recibo desta execução vai para `job_runs`.

  Este app nunca sofreu de exceção não capturada — sofreu de trabalho que
  simplesmente não acontecia, calado, por meses. O invólucro existe para que a
  pergunta "o cron rodou?" tenha resposta (dívida A5, `src/lib/job-run.ts`).
*/
export const GET = withJobReceipt("morning", handler);
