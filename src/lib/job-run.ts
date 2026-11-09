/**
 * O recibo de cada tarefa de fundo.
 *
 * ## Por que isto existe (dívida A5)
 *
 * Todo bug sério deste app falhou **calado**:
 *
 *   • o resumo semanal por IA ficou morto **meses** — a condição que o
 *     procurava nunca batia, e ninguém recebeu erro nenhum;
 *   • a IA ficou quebrada **semanas** — o 429 da Groq virava `null`, e `null`
 *     virava "AI analysis failed or API key not set";
 *   • o mapa ficou quebrado **um mês** — o CDN respondia 200 com uma imagem
 *     escrita "API KEY REQUIRED";
 *   • o envio pro relógio nunca funcionou desde o primeiro dia.
 *
 * Nenhum deles teria sido pego por um capturador de exceções: **não houve
 * exceção em lugar nenhum**. O que falta neste codebase não é captura de erro
 * — é saber se o trabalho aconteceu. Daí a pergunta que isto responde: *o cron
 * da segunda rodou, e o que ele fez?*
 *
 * ## Como se usa
 *
 * ```ts
 * const run = startJobRun(admin, "weekly-plan");
 * try {
 *   ...
 *   await run.ok({ items: userIds.length, summary: "8 atletas", detail: results });
 * } catch (err) {
 *   await run.failed(err);
 *   throw err;
 * }
 * ```
 *
 * ## O que ele nunca faz
 *
 * **Quebrar o cron.** Um recibo que derruba o trabalho que deveria vigiar é
 * pior que recibo nenhum: toda escrita aqui é em melhor esforço e engole o
 * próprio erro. Se a tabela não existir, o cron roda igual — só fica sem
 * recibo.
 */

export type JobStatus = "ok" | "error" | "skipped";

/** O cliente administrativo, sem arrastar o tipo inteiro do Supabase. */
type Admin = {
  from: (table: string) => {
    insert: (rows: unknown) => { select: (c: string) => { single: () => Promise<{ data: unknown }> } };
    update: (patch: unknown) => { eq: (c: string, v: unknown) => Promise<unknown> };
    delete: () => { eq: (c: string, v: unknown) => Promise<unknown> };
  };
};

export interface JobRunHandle {
  /** Terminou, e isto foi o que aconteceu. */
  ok(info?: { items?: number; summary?: string; detail?: unknown; status?: JobStatus }): Promise<void>;
  /** Não terminou. O erro vai para o recibo e segue subindo para quem chamou. */
  failed(err: unknown, info?: { items?: number; summary?: string }): Promise<void>;
  /**
   * Não era uma execução — apaga o recibo.
   *
   * Para a chamada sem segredo: alguém bateu na porta, não entrou. Fechar como
   * "pulado" seria pior do que não registrar, porque a tela de saúde contaria
   * a batida como prova de que a tarefa rodou.
   */
  discard(): Promise<void>;
}

/**
 * Abre o recibo e devolve como fechá-lo.
 *
 * A linha é inserida **já no começo**, não no fim. Uma tarefa que trava no
 * meio ou é cortada pelo tempo limite da Vercel não chega a escrever nada no
 * fim — e é exatamente a que mais interessa. Um recibo aberto e nunca fechado
 * (`finished_at` nulo) diz "começou e não voltou", que é informação.
 */
export function startJobRun(admin: Admin, job: string): JobRunHandle {
  const started = Date.now();
  const linha = admin
    .from("job_runs")
    .insert({ job, started_at: new Date(started).toISOString() })
    .select("id")
    .single()
    .then(r => (r.data as { id?: number } | null)?.id ?? null)
    .catch(() => null);

  async function fechar(status: JobStatus, patch: Record<string, unknown>) {
    try {
      const id = await linha;
      if (id == null) return;
      await admin.from("job_runs").update({
        status,
        finished_at: new Date().toISOString(),
        ...patch,
      }).eq("id", id);
    } catch {
      /* Um recibo perdido não vale derrubar o trabalho que ele vigiava. */
    }
  }

  return {
    async ok(info = {}) {
      await fechar(info.status ?? "ok", {
        items: info.items ?? null,
        summary: info.summary ?? null,
        detail: info.detail ?? null,
      });
    },
    async discard() {
      try {
        const id = await linha;
        if (id != null) await admin.from("job_runs").delete().eq("id", id);
      } catch { /* recibo órfão é melhor que cron derrubado */ }
    },
    async failed(err, info = {}) {
      await fechar("error", {
        items: info.items ?? null,
        summary: info.summary ?? null,
        error: mensagemDe(err).slice(0, 1000),
        detail: { ms: Date.now() - started },
      });
    },
  };
}

/**
 * O invólucro que põe recibo num cron inteiro.
 *
 * Cada cron vira uma linha diferente:
 *
 * ```ts
 * export const GET = withJobReceipt("weekly-plan", async (request) => { ... });
 * ```
 *
 * Escolhas que valem explicação:
 *
 *   • **401 não gera recibo.** Uma chamada sem o segredo não é uma execução —
 *     é alguém batendo na porta. Registrá-la encheria a tabela de ruído e
 *     faria "rodou hoje" ficar verde por engano.
 *   • **O resumo sai do próprio corpo da resposta.** Os crons já devolvem o
 *     que fizeram (`users`, `athletes`, `results`); aproveitar isso evita
 *     reescrever nove rotas para dizer de novo o que elas já dizem.
 *   • **Erro vira recibo e segue subindo.** Quem chamou continua vendo o 500;
 *     o recibo é testemunha, não rede de proteção.
 */
export function withJobReceipt<
  Req,
  R extends { status: number; clone(): { json(): Promise<unknown> } },
>(
  job: string,
  handler: (request: Req) => Promise<R>,
): (request: Req) => Promise<R> {
  return async (request: Req) => {
    // Importado aqui para o invólucro não arrastar o cliente admin para rotas
    // que nunca chegam a usá-lo.
    const { createAdminClient } = await import("@/lib/supabase/server");
    let admin: Admin;
    try { admin = createAdminClient() as unknown as Admin; } catch { return handler(request); }

    const run = startJobRun(admin, job);
    try {
      const res = await handler(request);
      if (res.status === 401) { await run.discard(); return res; }

      const corpo = await res.clone().json().catch(() => null) as Record<string, unknown> | null;
      await run.ok({
        status: res.status >= 400 ? "error" : resumoPulado(corpo) ? "skipped" : "ok",
        items: contarItens(corpo),
        summary: resumoDe(corpo, res.status),
        detail: corpo,
      });
      return res;
    } catch (err) {
      await run.failed(err);
      throw err;
    }
  };
}

const resumoPulado = (c: Record<string, unknown> | null) =>
  typeof c?.skipped === "string" || typeof c?.message === "string";

/** Quantos atletas a execução tocou, pelo nome que cada cron deu ao número. */
function contarItens(corpo: Record<string, unknown> | null): number | undefined {
  for (const k of ["users", "athletes", "count", "processed"]) {
    const v = corpo?.[k];
    if (typeof v === "number") return v;
  }
  const r = corpo?.results;
  if (r && typeof r === "object") return Object.keys(r).length;
  if (Array.isArray(r)) return r.length;
  return undefined;
}

/** Uma linha legível, que é o que se lê primeiro na tela de saúde. */
function resumoDe(corpo: Record<string, unknown> | null, status: number): string {
  if (status >= 400) return `HTTP ${status}`;
  if (typeof corpo?.skipped === "string") return `pulado: ${corpo.skipped}`;
  if (typeof corpo?.message === "string") return String(corpo.message);
  const n = contarItens(corpo);
  return n != null ? `${n} ${n === 1 ? "atleta" : "atletas"}` : "ok";
}

function mensagemDe(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  if (typeof err === "string") return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}
