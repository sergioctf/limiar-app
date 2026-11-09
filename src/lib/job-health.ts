/**
 * Qual tarefa emudeceu.
 *
 * Guardar recibo (`job-run.ts`) só serve se alguém fizer a pergunta. Esta é a
 * parte que faz: dado o que cada cron **deveria** fazer e o que ele de fato
 * fez, o que está em silêncio há tempo demais.
 *
 * O silêncio é o sintoma que importa neste app. O resumo semanal não deu erro
 * durante meses — ele simplesmente não aconteceu, e "não aconteceu" não gera
 * log, não gera exceção e não aparece em lugar nenhum. A única forma de ver é
 * ter escrito antes quando ele era esperado.
 *
 * A margem é generosa de propósito: um cron diário só é cobrado depois de
 * **dois** dias. A Vercel atrasa, o fuso embaralha, e um alarme que toca por
 * atraso de uma hora é um alarme que ninguém lê no terceiro dia.
 */

/** O que se espera de cada tarefa, em horas entre execuções bem-sucedidas. */
export interface JobExpectation {
  job: string;
  /** Intervalo esperado, em horas. */
  everyHours: number;
  /** Para a tela: o que acontece quando ela não roda. */
  oQueQuebra: string;
}

/**
 * O contrato, lido de `vercel.json` e escrito à mão aqui porque o que importa
 * não é o cron: é **o que o atleta perde** quando ele não roda.
 */
export const JOB_EXPECTATIONS: JobExpectation[] = [
  { job: "weekly-plan",    everyHours: 24 * 7, oQueQuebra: "A semana não é gerada nem vai para o relógio." },
  { job: "weekly-report",  everyHours: 24 * 7, oQueQuebra: "Ninguém é avisado de que a semana fechou." },
  { job: "notify-advisor", everyHours: 24 * 7, oQueQuebra: "As sugestões do conselheiro não chegam." },
  { job: "test-reminder",  everyHours: 24 * 7, oQueQuebra: "O lembrete do teste de 3 km não sai." },
  { job: "strava-sync",    everyHours: 24,     oQueQuebra: "Corridas do Strava param de entrar sozinhas." },
  { job: "wellness-sync",  everyHours: 24,     oQueQuebra: "Sono e HRV do Garmin param de chegar." },
  { job: "notify-morning", everyHours: 24,     oQueQuebra: "O recado da manhã não sai." },
  { job: "notify-evening", everyHours: 24,     oQueQuebra: "O recado da noite não sai." },
  { job: "race-strategy",  everyHours: 24,     oQueQuebra: "A estratégia de prova não é preparada." },
];

/** Quanto de folga damos sobre o intervalo esperado antes de cobrar. */
export const TOLERANCIA = 2;

export interface JobLastRun {
  job: string;
  status: string;
  started_at: string;
  finished_at?: string | null;
  summary?: string | null;
  error?: string | null;
}

export type JobHealthState = "ok" | "atrasado" | "falhou" | "nunca" | "travado" | "aguardando";

export interface JobHealth {
  job: string;
  estado: JobHealthState;
  /** Horas desde a última execução bem-sucedida; `null` se nunca houve. */
  horasDesde: number | null;
  esperadoACada: number;
  oQueQuebra: string;
  detalhe: string | null;
}

/**
 * O estado de cada tarefa.
 *
 * `runs` deve trazer a **última execução de cada job** (bem-sucedida ou não).
 * A distinção entre "falhou" e "atrasado" importa: falhar é ruidoso e alguém
 * pode estar olhando; atrasar é o silêncio, que é o que ninguém vê.
 */
export function jobHealth(
  runs: JobLastRun[],
  now: Date = new Date(),
  expectations: JobExpectation[] = JOB_EXPECTATIONS,
): JobHealth[] {
  const porJob = new Map<string, JobLastRun>();
  for (const r of runs) {
    const atual = porJob.get(r.job);
    if (!atual || r.started_at > atual.started_at) porJob.set(r.job, r);
  }

  /*
    Desde quando estamos olhando.

    No primeiro dia, nenhum cron semanal tem recibo — e chamar isso de "nunca
    rodou" seria mentira, além de disparar oito alarmes falsos logo na
    estreia. Um sistema de vigia que grita na primeira manhã é um sistema que
    o dono silencia na segunda.

    Então, enquanto a vigilância for mais nova que o intervalo da tarefa, o
    estado é "aguardando": ainda não deu tempo de saber.
  */
  const primeiro = runs.reduce<string | null>(
    (min, r) => (min == null || r.started_at < min ? r.started_at : min), null);
  const horasVigiando = primeiro == null
    ? 0
    : (now.getTime() - new Date(primeiro).getTime()) / 3_600_000;

  return expectations.map(({ job, everyHours, oQueQuebra }) => {
    const ultima = porJob.get(job);
    if (!ultima) {
      const cedoDemais = horasVigiando < everyHours;
      return {
        job,
        estado: cedoDemais ? "aguardando" : "nunca",
        horasDesde: null,
        esperadoACada: everyHours,
        oQueQuebra,
        detalhe: cedoDemais
          ? `Ainda não deu tempo — vigiando há ${Math.round(horasVigiando)} h, esperado a cada ${everyHours} h.`
          : "Nenhuma execução registrada.",
      };
    }

    const horas = (now.getTime() - new Date(ultima.started_at).getTime()) / 3_600_000;
    const atrasado = horas > everyHours * TOLERANCIA;

    /*
      Começou e não voltou.

      `finished_at` nulo numa execução antiga é o retrato de uma tarefa que
      travou ou estourou o tempo limite da Vercel — ela nunca chegou à linha
      que escreve o fim. É o caso mais silencioso de todos, e por isso tem
      estado próprio.
    */
    if (!ultima.finished_at && horas > 2) {
      return { job, estado: "travado", horasDesde: arred(horas), esperadoACada: everyHours, oQueQuebra, detalhe: "Começou e nunca terminou." };
    }

    if (ultima.status === "error" || ultima.status === "partial") {
      return { job, estado: "falhou", horasDesde: arred(horas), esperadoACada: everyHours, oQueQuebra, detalhe: ultima.error ?? ultima.summary ?? "Erro sem mensagem." };
    }

    if (atrasado) {
      return { job, estado: "atrasado", horasDesde: arred(horas), esperadoACada: everyHours, oQueQuebra, detalhe: `Esperado a cada ${everyHours} h.` };
    }

    return { job, estado: "ok", horasDesde: arred(horas), esperadoACada: everyHours, oQueQuebra, detalhe: ultima.summary ?? null };
  });
}

/** O que precisa de atenção — o resto é ruído numa tela de saúde. */
export function problemas(saude: JobHealth[]): JobHealth[] {
  return saude.filter(j => j.estado !== "ok" && j.estado !== "aguardando");
}

/** Uma frase para o topo da tela, ou para um push. */
export function resumoDaSaude(saude: JobHealth[]): string {
  const ruins = problemas(saude);
  if (ruins.length === 0) {
    const waiting = saude.filter(job => job.estado === "aguardando").length;
    return waiting > 0 ? `Sem falhas registradas. ${waiting} tarefa(s) aguardando primeira execução.`
      : "Todas as tarefas rodaram quando deviam.";
  }
  const nomes = ruins.map(j => j.job).join(", ");
  return ruins.length === 1
    ? `1 tarefa precisa de atenção: ${nomes}.`
    : `${ruins.length} tarefas precisam de atenção: ${nomes}.`;
}

const arred = (h: number) => Math.round(h * 10) / 10;

/**
 * O aviso que sai sozinho.
 *
 * Uma tela de saúde que alguém precisa lembrar de abrir resolve metade do
 * problema: o resumo semanal ficou morto meses porque **ninguém tinha motivo
 * para procurar**. Então, quando algo está em silêncio, o app avisa.
 *
 * Fala do que o atleta perde, não do nome do cron: "corridas do Strava param
 * de entrar sozinhas" é acionável; "strava-sync atrasado" é um enigma.
 *
 * Devolve `null` quando está tudo bem — e é por isso que isto pode rodar todo
 * dia sem virar ruído.
 */
export function avisoDeSaude(saude: JobHealth[]): { title: string; body: string } | null {
  const ruins = problemas(saude);
  if (ruins.length === 0) return null;

  const pior = ruins.find(j => j.estado === "nunca")
    ?? ruins.find(j => j.estado === "travado")
    ?? ruins.find(j => j.estado === "falhou")
    ?? ruins[0];

  return {
    title: ruins.length === 1
      ? "Uma tarefa do Limiar parou"
      : `${ruins.length} tarefas do Limiar pararam`,
    body: ruins.length === 1
      ? pior.oQueQuebra
      : `${pior.oQueQuebra} E mais ${ruins.length - 1}.`,
  };
}
