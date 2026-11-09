/**
 * GET /api/cron/wellness-sync — daily, 08:00 BRT.
 *
 * The athlete who never opens the app still gets a readiness score built from
 * last night. Opening the app syncs too; this is the safety net for the mornings
 * they go straight out the door.
 *
 * 08:00 rather than earlier: the night reaches intervals.icu only after the band
 * syncs to the phone, which for most people happens after they wake up.
 */
import { NextRequest, NextResponse } from "next/server";
import { withJobReceipt } from "@/lib/job-run";
import { createAdminClient } from "@/lib/supabase/server";
import { authorizeCron } from "@/lib/cron-auth";
import { syncIntervals } from "@/lib/intervals-sync";
import { dispatchMorning } from "@/lib/morning-dispatch";
import { avisoDeSaude, jobHealth, type JobLastRun } from "@/lib/job-health";
import { sendPushToUser } from "@/lib/push";

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

  const admin = createAdminClient();
  const { data: conns, error } = await admin.from("intervals_connections").select("user_id");
  if (error) {
    const morning = await dispatchMorning(admin, { final: true });
    return NextResponse.json({ ok: false, error: "tabela ausente (migration 026?)", morning });
  }

  const results: Record<string, unknown> = {};
  for (const { user_id } of (conns ?? []) as Array<{ user_id: string }>) {
    const r = await syncIntervals(admin, user_id);
    // Ids truncated: this lands in Vercel logs, which is no place for a full uuid.
    results[user_id.slice(0, 8)] = r.ok ? { saved: r.saved, latest: r.latest } : { error: r.error };
  }

  // Final pass of the morning notification: whoever is still waiting hears
  // about their day now, with the night if it came and without if it did not.
  const morning = await dispatchMorning(admin, { final: true });

  /*
    E, uma vez por dia, a pergunta que ninguém fazia.

    Este é o último cron diário (08:00 BRT, depois do Strava e das
    notificações), então é daqui que dá para olhar para trás e ver se o dia
    aconteceu. Uma tela de saúde que alguém precisa lembrar de abrir resolve
    metade do problema — o resumo semanal ficou morto meses porque ninguém
    tinha motivo para procurar (dívida A5).

    `avisoDeSaude` devolve `null` quando está tudo bem, e é por isso que isto
    pode rodar todo dia sem virar ruído.
  */
  const vigia = await checarSaude(admin);

  return NextResponse.json({ ok: true, athletes: Object.keys(results).length,
    failures: Object.values(results).filter(result => result && typeof result === "object" && "error" in result).length,
    results, morning, vigia });
}

async function checarSaude(admin: ReturnType<typeof createAdminClient>): Promise<string> {
  const destino = process.env.ADMIN_USER_ID?.trim();
  if (!destino) return "sem ADMIN_USER_ID";
  try {
    const { data, error } = await admin
      .from("job_runs")
      .select("job, status, started_at, finished_at, summary, error")
      .order("started_at", { ascending: false })
      .limit(400);
    if (error) return "job_runs indisponivel";

    const saude = jobHealth((data ?? []) as JobLastRun[]);
    const aviso = avisoDeSaude(saude);
    if (!aviso) return "tudo rodando";

    await sendPushToUser(admin, destino, { ...aviso, url: "/" });
    // A faxina mora aqui porque é o cron diário mais tardio e o mais barato
    // de atrasar se o banco estiver ocupado.
    await admin.rpc("prune_job_runs").then(() => undefined, () => undefined);
    return `avisado: ${aviso.title}`;
  } catch {
    return "falhou ao checar";
  }
}

/*
  O recibo desta execução vai para `job_runs`.

  Este app nunca sofreu de exceção não capturada — sofreu de trabalho que
  simplesmente não acontecia, calado, por meses. O invólucro existe para que a
  pergunta "o cron rodou?" tenha resposta (dívida A5, `src/lib/job-run.ts`).
*/
export const GET = withJobReceipt("wellness-sync", handler);
