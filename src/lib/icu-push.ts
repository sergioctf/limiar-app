import { icuAuthHeader, ICU_API_BASE } from "@/lib/intervals";
import { icuEventPayload, icuStrengthText } from "@/lib/icu-workout";
import { isoDateOfWeekDay } from "@/lib/week";
import { sessionAsStructure } from "@/lib/measure";
import type { SportKey } from "@/lib/sports";
import type { WeeklyPlanData, WeeklyPlanDay } from "@/types";

/**
 * O calendário do relógio, mantido em dia pelo Limiar.
 *
 * O envio manual (um botão, um treino) foi o primeiro passo. Ele resolve o dia
 * de hoje e deixa duas coisas erradas:
 *
 *   1. **Mover um treino de dia deixava o antigo lá.** O atleta passava a
 *      quarta para a sexta no app, e o relógio continuava apitando na quarta —
 *      com o treino que já não existe (Sérgio, 15/10).
 *   2. **Toda semana começava vazia.** O plano é gerado na segunda de
 *      madrugada; esperar o atleta lembrar de tocar o botão sete vezes é
 *      esperar que ele não use.
 *
 * Então o calendário passou a ser mantido, não alimentado: a semana inteira vai
 * junto com o plano, e qualquer mudança no app move o evento em vez de
 * duplicá-lo.
 *
 * Tudo aqui é **melhor esforço**. Mover um treino, gerar um plano e registrar
 * um feito são ações que já deram certo quando estas funções rodam; o
 * intervals.icu fora do ar não pode desfazer nenhuma delas.
 */

export interface IcuConnection {
  athleteId: string;
  apiKey: string;
}

/** O que `createAdminClient()` devolve, sem arrastar o tipo inteiro do Supabase. */
type Admin = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: unknown }> };
    };
  };
};

/**
 * A conexão do atleta, se existir.
 *
 * Sem intervals.icu não há relógio por este caminho, e isso não é erro: a
 * maioria dos atletas do Limiar não conectou nada.
 */
export async function loadIcuConnection(admin: Admin, userId: string): Promise<IcuConnection | null> {
  try {
    const { data } = await admin
      .from("intervals_connections")
      .select("athlete_id, api_key")
      .eq("user_id", userId)
      .maybeSingle();
    const row = data as { athlete_id?: string; api_key?: string } | null;
    if (!row?.api_key || !row.athlete_id) return null;
    return { athleteId: row.athlete_id, apiKey: row.api_key };
  } catch {
    return null;
  }
}

const base = (conn: IcuConnection) => `${ICU_API_BASE}/athlete/${conn.athleteId}`;
const headers = (conn: IcuConnection) => ({ Authorization: icuAuthHeader(conn.apiKey) });

/** O id que marca um evento como nosso, para podermos mexer só no que criamos. */
export const externalIdFor = (weekStart: string, day: string) => `limiar-${weekStart}-${day}`;

/**
 * Apaga do calendário o que o Limiar pôs naquele dia.
 *
 * Só o que tem o nosso `external_id`: o calendário é do atleta, e uma prova que
 * ele marcou à mão no intervals.icu não é nossa para apagar.
 */
export async function removeIcuDay(
  conn: IcuConnection, date: string, weekStart: string, day: string,
): Promise<number> {
  const alvo = externalIdFor(weekStart, day);
  try {
    const res = await fetch(`${base(conn)}/events?oldest=${date}&newest=${date}`, { headers: headers(conn) });
    if (!res.ok) return 0;
    const lista = await res.json() as Array<{ id: number; external_id?: string }>;
    let apagados = 0;
    for (const e of lista) {
      if (e.external_id !== alvo) continue;
      const del = await fetch(`${base(conn)}/events/${e.id}`, { method: "DELETE", headers: headers(conn) });
      if (del.ok) apagados++;
    }
    return apagados;
  } catch {
    return 0;
  }
}

/**
 * Os esportes que vão ao relógio sozinhos.
 *
 * Corrida, natação e ciclismo — as três coisas que o motor dimensiona em
 * distância, tempo e ritmo, e que o relógio sabe conduzir (Sérgio, 15/10).
 *
 * **Musculação não entra aqui** porque não é automática: ela tem o próprio
 * botão, no card do dia, abaixo de "Começar treino". E **pilates, vôlei e
 * companhia** não entram porque não são sessões do motor — são fatos da semana
 * do atleta, sem duração nem alvo prescritos por ninguém.
 */
export const AUTO_SPORTS: SportKey[] = ["corrida", "natacao", "ciclismo"];

export type PushResult =
  | { ok: true; eventId: number | null }
  | { ok: false; reason: "unauthorized" | "no_structure" | "unsupported_sport" | "error"; detail?: string };

/**
 * Põe uma sessão no calendário, substituindo a que estava naquele dia.
 *
 * Substituir e não acrescentar é o que impede dois treinos no mesmo dia para
 * quem tocou duas vezes, ou tocou de novo depois de adaptar.
 */
export async function pushIcuSession(
  conn: IcuConnection,
  args: {
    session: WeeklyPlanDay; weekStart: string;
    /** Em que unidade o atleta lê o plano — vai junto para o visor. */
    measureBy?: "km" | "time";
  },
): Promise<PushResult> {
  const { session, weekStart } = args;
  const date = isoDateOfWeekDay(weekStart, session.day);
  if (!date) return { ok: false, reason: "error", detail: "dia inválido" };

  const sport: SportKey = session.sport ?? "corrida";

  /*
    A musculação vai como texto legível, não como passos.

    A sintaxe do intervals.icu não sabe dizer "4×8-10 com RIR 2"; fingir que
    sabe exigiria inventar um tempo para cada exercício. Ver `icuStrengthText`.
  */
  const ehForca = sport === "musculacao";
  const structure = ehForca ? null : sessionAsStructure(session, args.measureBy ?? "km");
  const description = ehForca && session.strength ? icuStrengthText(session.strength) : undefined;
  if (!ehForca && !structure) return { ok: false, reason: "no_structure" };
  if (ehForca && !description) return { ok: false, reason: "no_structure" };

  const evento = icuEventPayload({
    date,
    label: session.label,
    structure,
    description,
    sport,
    weekStart,
    day: session.day,
    distanceKm: ehForca ? undefined : session.distance_km,
    durationMin: ehForca ? session.strength?.estimatedMinutes : session.duration_min,
  });
  if (!evento) return { ok: false, reason: "unsupported_sport" };

  await removeIcuDay(conn, date, weekStart, session.day);

  try {
    const res = await fetch(`${base(conn)}/events`, {
      method: "POST",
      headers: { ...headers(conn), "Content-Type": "application/json" },
      body: JSON.stringify(evento),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      if (res.status === 401 || res.status === 403) return { ok: false, reason: "unauthorized", detail };
      return { ok: false, reason: "error", detail };
    }
    const criado = await res.json().catch(() => null) as { id?: number } | null;
    return { ok: true, eventId: criado?.id ?? null };
  } catch (err) {
    return { ok: false, reason: "error", detail: String(err).slice(0, 200) };
  }
}

/**
 * A semana inteira de uma vez — corrida, natação e ciclismo.
 *
 * O que fica de fora e por quê está em `AUTO_SPORTS`.
 */
export async function pushIcuWeek(
  conn: IcuConnection,
  plan: WeeklyPlanData,
  weekStart: string,
  measureBy: "km" | "time" = "km",
): Promise<{ enviados: number; pulados: number; falhas: number }> {
  let enviados = 0, pulados = 0, falhas = 0;
  for (const day of plan.days ?? []) {
    if (day.type === "rest" || !AUTO_SPORTS.includes(day.sport ?? "corrida")) { pulados++; continue; }
    const r = await pushIcuSession(conn, { session: day, weekStart, measureBy });
    if (r.ok) enviados++;
    else if (r.reason === "no_structure" || r.reason === "unsupported_sport") pulados++;
    else falhas++;
    // Uma chave recusada não melhora na próxima sessão.
    if (!r.ok && r.reason === "unauthorized") break;
  }
  return { enviados, pulados, falhas };
}
