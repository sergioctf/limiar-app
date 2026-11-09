/**
 * GET /api/admin/health?secret=…
 *
 * A pergunta que faltava: **as tarefas de fundo estão acontecendo?**
 *
 * Este app nunca sofreu de exceção não capturada. Sofreu de trabalho que
 * simplesmente não acontecia — o resumo semanal morto por meses, a IA quebrada
 * por semanas, o mapa por um mês, o envio pro relógio que nunca funcionou.
 * Nenhum deles aparecia em log nenhum, porque nada falhava: nada rodava.
 *
 * Responde em JSON e em texto (`?format=txt`), porque a forma mais provável de
 * alguém olhar isto é de um celular, às pressas.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { jobHealth, problemas, resumoDaSaude, type JobLastRun } from "@/lib/job-health";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  /*
    Quem pode ver: o dono da conta, pela própria sessão.

    A primeira versão pedia `?secret=`. Ela nasceu morta: `ADMIN_SECRET` está
    **vazio** em produção, então a rota recusava todo mundo — e consertar isso
    significaria passar um segredo de mão em mão por aí, só para ler uma tela.
    O Sérgio já está logado; é mais simples e mais seguro perguntar quem ele é.

    O segredo continua valendo para script (cron, terminal), **se** algum dia
    for configurado de verdade.

    E a recusa é 404, não 401: uma tela que lista o que está quebrado é um mapa
    para quem quiser aproveitar.
  */
  const naoEncontrado = NextResponse.json({ error: "Not found" }, { status: 404 });

  const segredo = process.env.ADMIN_SECRET?.trim();
  const dado = request.nextUrl.searchParams.get("secret")?.trim();
  const porSegredo = Boolean(segredo) && dado === segredo;

  if (!porSegredo) {
    const dono = process.env.ADMIN_USER_ID?.trim();
    if (!dono) return naoEncontrado;
    const { data: { user } } = await createClient().auth.getUser();
    if (user?.id !== dono) return naoEncontrado;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("job_runs")
    .select("job, status, started_at, finished_at, summary, error")
    .order("started_at", { ascending: false })
    .limit(400);

  if (error) {
    return NextResponse.json(
      { error: "Não consegui ler job_runs. A migration 040 foi aplicada?", detail: error.message },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const saude = jobHealth((data ?? []) as JobLastRun[]);
  const ruins = problemas(saude);
  const resumo = resumoDaSaude(saude);

  if (request.nextUrl.searchParams.get("format") === "txt") {
    const linhas = [
      resumo,
      "",
      ...saude.map(j => {
        // "nunca" ao lado de "ainda não deu tempo" se contradiz: no estado de
        // espera, a coluna do quando não tem o que dizer.
        const quando = j.horasDesde != null ? `há ${j.horasDesde} h`
          : j.estado === "aguardando" ? "—" : "nunca";
        const marca = j.estado === "ok" ? "ok  " : j.estado.slice(0, 4).padEnd(4);
        return `${marca} ${j.job.padEnd(16)} ${quando.padEnd(12)} ${j.detalhe ?? ""}`;
      }),
      "",
      ...ruins.map(j => `! ${j.job}: ${j.oQueQuebra}`),
    ];
    return new NextResponse(linhas.join("\n"), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  return NextResponse.json(
    { resumo, saudavel: ruins.length === 0, jobs: saude },
    { headers: { "Cache-Control": "no-store" } },
  );
}
