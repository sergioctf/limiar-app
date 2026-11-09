/**
 * O dossiê do atleta — o que a IA central sabe.
 *
 * Decisão do Sérgio (20/09): "dados e funcionalidades específicas ficam nas
 * respectivas abas; inteligência, interpretação, cruzamento de dados e
 * aconselhamento ficam centralizados na IA". Só que o app já tem uma regra
 * mais antiga e mais importante (ADR-02): **o motor calcula, a IA narra**.
 *
 * As duas convivem assim: tudo que está aqui já foi calculado pelos leitores
 * determinísticos que as telas usam (`week-movement`, `week-recap`,
 * `progress-reading`, `recovery-today`, `training-load`, `performance`,
 * `shoes`, `plan-adherence`…). Este módulo não calcula nada novo — ele
 * *escreve* o que aqueles leitores concluíram, em frases prontas, e devolve
 * uma lista de seções.
 *
 * Isso dá duas coisas de uma vez:
 *
 *   1. As sugestões da tela da IA respondem na hora, sem chamar o modelo —
 *      sem custo, sem espera e sem chance de um número sair errado.
 *   2. A pergunta aberta manda o mesmo dossiê ao modelo, que responde *sobre
 *      ele*. Se a resposta tem um número, o número veio daqui. O que não está
 *      no dossiê, a IA diz que não sabe, em vez de inventar.
 *
 * Nada de PII aqui além do primeiro nome: o dossiê viaja para a Groq.
 */
import { formatMinutes, type WeekMovement } from "@/lib/week-movement";
import { basisLabel, type RecoveryToday } from "@/lib/recovery-today";
import { paceToString, timeToString, type PerformanceMetrics } from "@/lib/performance";
import { wearOf, SHOE_META, type Shoe, type RunLike } from "@/lib/shoes";
import type { WeekRecap } from "@/lib/week-recap";
import type { ProgressReport } from "@/lib/progress-reading";
import type { WeekAdherence } from "@/lib/plan-adherence";
import type { OvertrainingAssessment } from "@/lib/overtraining";
import type { DailyLoad } from "@/lib/training-load";
import type { SleepWeek } from "@/lib/health-view";
import type { Today } from "@/lib/today";
import type { Goal, Race } from "@/types";

export type BriefKey =
  | "hoje" | "recuperacao" | "sono" | "semana" | "semana_passada" | "evolucao"
  | "carga" | "ritmos" | "adesao" | "provas" | "metas" | "tenis" | "alertas" | "debrief";

export interface BriefSection {
  key: BriefKey;
  title: string;
  /** Uma frase que responde à pergunta da seção. */
  headline: string;
  /** Os fatos, já escritos, um por linha. */
  lines: string[];
  /** Em cima do que isso foi dito — para a resposta poder se explicar. */
  source: string;
}

export interface AthleteBrief {
  /** O dia do atleta, não o do servidor. */
  date: string;
  firstName: string | null;
  sections: BriefSection[];
}

export interface BriefInput {
  date: string;
  firstName: string | null;
  today: Today | null;
  recovery: RecoveryToday | null;
  week: WeekMovement | null;
  recap: WeekRecap | null;
  progress: ProgressReport | null;
  fitness: DailyLoad[];
  overtraining: OvertrainingAssessment | null;
  metrics: PerformanceMetrics | null;
  testDate: string | null;
  sleep: SleepWeek | null;
  adherence: WeekAdherence[];
  races: Race[];
  goals: Goal[];
  shoes: Shoe[];
  shoeRuns: RunLike[];
  debrief?: Array<{ date: string; modality: string; perception: string; rpe: number | null }>;
}

// ─── Escrita ─────────────────────────────────────────────────────────────────

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const num = (n: number) => Number(n.toFixed(1)).toString().replace(".", ",");
const km = (n: number) => `${num(n)} km`;

/** "14/09" — como o app escreve data em texto corrido. */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/** "14 de setembro" */
export function longDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)} de ${MONTHS[Number(m) - 1]}`;
}

/** Quantos dias faltam, dito como gente fala. */
function daysUntil(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00Z`).getTime();
  const b = new Date(`${to}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// ─── As seções ───────────────────────────────────────────────────────────────

function hojeSection(i: BriefInput): BriefSection | null {
  const t = i.today;
  if (!t) return null;

  const lines: string[] = [];
  if (t.detail) lines.push(t.detail);

  for (const s of t.status?.sessions ?? []) {
    lines.push(`${s.label}${s.detail ? ` (${s.detail})` : ""}: ${s.done ? "feito" : "ainda não feito"}`);
  }
  for (const d of t.status?.done ?? []) {
    if (d.planned) continue;
    lines.push(`Fora do plano: ${d.label}${d.km != null ? ` · ${km(d.km)}` : ""} · ${formatMinutes(d.minutes)}`);
  }
  if (t.why) lines.push(`Por que hoje é assim: ${t.why}`);

  return {
    key: "hoje",
    title: "Meu treino de hoje",
    headline: t.headline,
    lines,
    source: `plano da semana e treinos registrados em ${shortDate(i.date)}`,
  };
}

function recuperacaoSection(i: BriefInput): BriefSection | null {
  const r = i.recovery;
  if (!r) return null;

  const lines: string[] = [];
  if (r.score != null) {
    lines.push(`Base do número: ${basisLabel(r)}.`);
    lines.push(`O que o compõe: ${r.readiness.components
      .map(c => `${c.label} ${Math.round(c.score)}/100 (${c.auto ? "relógio" : "seu relato"})`)
      .join(" · ")}.`);
    if (r.readiness.cap) lines.push(`Teto aplicado: ${r.readiness.cap.reason}`);
  } else {
    lines.push("Nenhum sinal chegou hoje — nem relógio, nem check-in.");
  }
  if (r.advice.detail) lines.push(r.advice.detail);
  if (r.calibratingNights) lines.push(`O relógio ainda está calibrando: faltam ${plural(r.calibratingNights, "noite", "noites")}.`);
  if (r.needsCheckin) lines.push("Sem relógio e sem check-in hoje: o número está de pé só na carga de treino.");

  return {
    key: "recuperacao",
    title: "Minha recuperação hoje",
    headline: r.score != null ? `${r.score}/100 — ${r.short}` : "Sem dados de recuperação hoje",
    lines,
    source: r.score != null ? basisLabel(r).toLowerCase() : "nenhuma fonte disponível hoje",
  };
}

function sonoSection(i: BriefInput): BriefSection | null {
  const s = i.sleep;
  if (!s || s.measured === 0) return null;

  const lines = [`Noite a noite: ${s.nights
    .filter(n => n.hours != null)
    .map(n => `${shortDate(n.date)} ${num(n.hours!)} h${n.score != null ? ` (qualidade ${n.score})` : ""}`)
    .join(" · ")}.`];
  if (s.debtHours > 0) lines.push(`Dívida acumulada na semana: ${num(s.debtHours)} h abaixo do alvo.`);

  return {
    key: "sono",
    title: "Meu sono",
    headline: s.avgHours != null
      ? `Média de ${num(s.avgHours)} h por noite em ${plural(s.measured, "noite medida", "noites medidas")}`
      : "Sem noites medidas nesta semana",
    lines,
    source: "relógio / check-ins dos últimos 7 dias",
  };
}

function semanaSection(i: BriefInput): BriefSection | null {
  const w = i.week;
  if (!w) return null;

  const lines: string[] = [];
  lines.push(w.plannedSessions > 0
    ? `${plural(w.sessions, "sessão feita", "sessões feitas")} de ${plural(w.plannedSessions, "prevista", "previstas")}.`
    : `${plural(w.sessions, "sessão feita", "sessões feitas")}; não havia plano para a semana.`);
  lines.push(`${plural(w.trainedDays, "dia treinado", "dias treinados")}${w.plannedDays > 0 ? ` de ${w.plannedDays} previstos` : ""}, ${formatMinutes(w.minutes)} em atividade.`);

  for (const s of w.bySport) {
    lines.push(`${s.label}: ${plural(s.sessions, "sessão", "sessões")}${s.km != null && s.km > 0 ? ` · ${km(s.km)}` : ""} · ${formatMinutes(s.minutes)}`);
  }

  const missed = w.days.flatMap(d => d.missed.map(m => `${d.short}: ${m.label}`));
  if (missed.length > 0) lines.push(`Previsto e não feito — ${missed.join("; ")}.`);

  const upcoming = w.days.flatMap(d => d.upcoming.map(u => `${d.short}: ${u.label}`));
  if (upcoming.length > 0) lines.push(`Ainda por fazer — ${upcoming.join("; ")}.`);

  if (w.calories) {
    const fonte = w.calories.source === "relogio" ? "medidas pelo relógio"
      : w.calories.source === "misto" ? "relógio nos dias que mandou, treinos nos outros"
      : "somadas dos treinos";
    lines.push(`Calorias da semana: ${w.calories.kcal} kcal (${fonte}).`);
  }

  return {
    key: "semana",
    title: "Minha semana",
    headline: w.plannedSessions > 0
      ? `${w.sessions} de ${w.plannedSessions} sessões, ${formatMinutes(w.minutes)}`
      : `${plural(w.sessions, "sessão", "sessões")}, ${formatMinutes(w.minutes)}`,
    lines,
    source: "plano da semana e tudo que foi registrado nela",
  };
}

function semanaPassadaSection(i: BriefInput): BriefSection | null {
  const r = i.recap;
  if (!r) return null;

  const lines = [r.went, r.understood, r.next].flatMap(s => [
    `${s.question} ${s.headline}`,
    ...s.lines,
  ]);

  return {
    key: "semana_passada",
    title: "A semana que fechou",
    headline: `${r.range}: ${r.went.headline}`,
    lines,
    source: `semana de ${shortDate(r.weekStart)}, comparada com o plano e com o que você respondeu`,
  };
}

function evolucaoSection(i: BriefInput): BriefSection | null {
  const p = i.progress;
  if (!p || p.readings.length === 0) return null;

  const SIGN: Record<string, string> = {
    better: "melhorando", steady: "estável", worse: "piorando",
    unknown: "sem dado suficiente", info: "contexto",
  };

  return {
    key: "evolucao",
    title: "O que está melhorando",
    headline: p.summary,
    lines: p.readings.map(r =>
      `${r.title} — ${SIGN[r.signal] ?? r.signal}: ${r.headline}${r.detail ? ` ${r.detail}` : ""}`),
    source: "histórico de treinos comparáveis, check-ins e planos anteriores",
  };
}

function cargaSection(i: BriefInput): BriefSection | null {
  const last = i.fitness[i.fitness.length - 1];
  if (!last) return null;

  const lines: string[] = [
    `Condicionamento (CTL, 42 dias): ${Math.round(last.ctl)}.`,
    `Fadiga (ATL, 7 dias): ${Math.round(last.atl)}.`,
    `Forma (TSB = condicionamento − fadiga): ${last.tsb > 0 ? "+" : ""}${Math.round(last.tsb)}.`,
  ];

  const weekAgo = i.fitness[i.fitness.length - 8];
  if (weekAgo) {
    const d = last.ctl - weekAgo.ctl;
    lines.push(`Há uma semana o condicionamento era ${Math.round(weekAgo.ctl)} — ${d >= 0 ? "subiu" : "caiu"} ${num(Math.abs(d))}.`);
  }

  if (i.overtraining) {
    lines.push(`Relação aguda/crônica (ACWR): ${num(i.overtraining.acwr)}.`);
    for (const s of i.overtraining.signals) lines.push(`Sinal: ${s.label} — ${s.detail}`);
    if (i.overtraining.level !== "ok") lines.push(i.overtraining.recommendation);
  }

  const forma = last.tsb > 5 ? "descansado" : last.tsb < -20 ? "bem carregado" : last.tsb < -10 ? "carregado" : "equilibrado";
  return {
    key: "carga",
    title: "Minha carga de treino",
    headline: `Forma ${last.tsb > 0 ? "+" : ""}${Math.round(last.tsb)} — corpo ${forma}`,
    lines,
    source: "corridas e sessões de academia dos últimos 90 dias (CTL/ATL/TSB)",
  };
}

function ritmosSection(i: BriefInput): BriefSection | null {
  const m = i.metrics;
  if (!m) return null;

  /*
   * As previsões de prova entram aqui, e não só quando existe prova marcada.
   *
   * Em teste (20/09) a IA respondeu "maratona em torno de 3h45" multiplicando o
   * ritmo de maratona pela distância — conta feita pelo modelo, que é
   * exatamente o que a ADR-02 proíbe. Com a previsão de Daniels no dossiê ela
   * não precisa calcular: o número já está aqui, e é melhor do que o dela.
   */
  const lines: string[] = [
    `VDOT ${num(m.vdot)} · VO₂ máx estimado ${num(m.vo2max)}.`,
    `Limiar de frequência cardíaca (LTHR) estimado: ${m.lthr} bpm.`,
    `Ritmos de treino: ${m.paces.map(p => `${p.label} ${paceToString(p.pace_max_sec)}–${paceToString(p.pace_min_sec)}`).join(" · ")} (min/km).`,
    `Faixas de FC: ${m.zones.map(z => `Z${z.zone} ${z.min_bpm}${z.max_bpm ? `–${z.max_bpm}` : "+"}`).join(" · ")} bpm.`,
    `Previsão de tempo neste VDOT: ${m.predictions.map(p => `${p.distance_label} ${timeToString(p.predicted_seconds)}`).join(" · ")}.`,
  ];

  return {
    key: "ritmos",
    title: "Meus ritmos e zonas",
    headline: `VDOT ${num(m.vdot)}, do teste de ${i.testDate ? longDate(i.testDate) : "calibração"}`,
    lines,
    source: i.testDate ? `teste de ${shortDate(i.testDate)} (fórmulas de Daniels)` : "último teste de calibração",
  };
}

function adesaoSection(i: BriefInput): BriefSection | null {
  const weeks = i.adherence.filter(w => w.score != null);
  if (weeks.length === 0) return null;

  const lines = weeks.map(w =>
    `Semana de ${shortDate(w.weekStart)}: ${w.score}% — ${w.doneCount} feitos, ${w.adaptedCount} adaptados, ${w.partialCount} parciais, ${w.missedCount} perdidos.`);

  const avg = Math.round(weeks.reduce((s, w) => s + (w.score ?? 0), 0) / weeks.length);
  return {
    key: "adesao",
    title: "Quanto do plano eu cumpro",
    headline: `Média de ${avg}% nas últimas ${plural(weeks.length, "semana", "semanas")}`,
    lines,
    source: "planos gerados × treinos registrados, dia a dia",
  };
}

function provasSection(i: BriefInput): BriefSection | null {
  const future = i.races
    .filter(r => r.race_date >= i.date)
    .sort((a, b) => a.race_date.localeCompare(b.race_date));
  const past = i.races
    .filter(r => r.race_date < i.date && r.time_seconds != null)
    .sort((a, b) => b.race_date.localeCompare(a.race_date))
    .slice(0, 3);
  if (future.length === 0 && past.length === 0) return null;

  const lines: string[] = [];
  for (const r of future) {
    const d = daysUntil(i.date, r.race_date);
    lines.push(`${r.name} — ${km(r.distance_km)} em ${longDate(r.race_date)}, ${d === 0 ? "é hoje" : `daqui a ${plural(d, "dia", "dias")}`}${r.is_target_race ? " · prova-alvo" : ""}.`);
    const pred = i.metrics?.predictions.find(p => Math.abs(p.distance_km - r.distance_km) < 0.3);
    if (pred) lines.push(`Previsão para essa distância, no VDOT de hoje: ${timeToString(pred.predicted_seconds)}.`);
  }
  for (const r of past) {
    lines.push(`Feita: ${r.name} — ${km(r.distance_km)} em ${timeToString(r.time_seconds!)} (${longDate(r.race_date)}).`);
  }

  const next = future[0];
  return {
    key: "provas",
    title: "Minhas provas",
    headline: next
      ? `${next.name} em ${plural(daysUntil(i.date, next.race_date), "dia", "dias")}`
      : "Nenhuma prova marcada",
    lines,
    source: "provas cadastradas e a previsão do teste mais recente",
  };
}

function metasSection(i: BriefInput): BriefSection | null {
  const active = i.goals.filter(g => g.status === "active");
  if (active.length === 0) return null;

  const lines: string[] = [];
  for (const g of active) {
    const alvo = g.target_time_seconds ? timeToString(g.target_time_seconds) : "sem tempo definido";
    lines.push(`${g.race_name} — ${km(g.distance_km)} em ${alvo}${g.race_date ? `, ${longDate(g.race_date)}` : ""}.`);
    const pred = i.metrics?.predictions.find(p => Math.abs(p.distance_km - g.distance_km) < 0.3);
    if (pred && g.target_time_seconds) {
      const diff = pred.predicted_seconds - g.target_time_seconds;
      lines.push(diff > 0
        ? `Hoje o teste projeta ${timeToString(pred.predicted_seconds)} — ${timeToString(Math.abs(diff))} acima do alvo.`
        : `Hoje o teste projeta ${timeToString(pred.predicted_seconds)} — já dentro do alvo.`);
    }
  }

  return {
    key: "metas",
    title: "Minhas metas",
    headline: active.length === 1 ? lines[0] : `${plural(active.length, "meta ativa", "metas ativas")}`,
    lines,
    source: "metas cadastradas e a previsão do teste mais recente",
  };
}

function tenisSection(i: BriefInput): BriefSection | null {
  const active = i.shoes.filter(s => !s.retired);
  if (active.length === 0) return null;

  const lines = active.map(s => {
    const w = wearOf(s, i.shoeRuns);
    return `${s.name} (${SHOE_META[s.category].label}): ${Math.round(w.km)} de ~${w.lifespan} km — ${w.note}`;
  });
  const trocar = active.filter(s => wearOf(s, i.shoeRuns).status === "trocar").length;
  const atencao = active.filter(s => wearOf(s, i.shoeRuns).status === "atencao").length;

  return {
    key: "tenis",
    title: "Meus tênis",
    headline: trocar > 0 ? `${plural(trocar, "par passou", "pares passaram")} da vida útil`
      : atencao > 0 ? `${plural(atencao, "par chegando", "pares chegando")} ao fim da vida útil`
      : `${plural(active.length, "par em uso", "pares em uso")}, todos dentro da vida útil`,
    lines,
    source: "quilometragem registrada por par",
  };
}

/**
 * O que merece atenção — e só o que merece.
 *
 * Esta é a única seção que "conclui" algo, e mesmo assim não calcula: ela só
 * junta o que os outros leitores já marcaram como problema. Sem achado, a
 * seção não existe — inventar preocupação é pior do que ficar calado.
 */
function alertasSection(i: BriefInput, sections: BriefSection[]): BriefSection | null {
  const lines: string[] = [];

  if (i.overtraining && i.overtraining.level !== "ok") {
    for (const s of i.overtraining.signals) lines.push(`${s.label}: ${s.detail}`);
  }
  if (i.recovery?.score != null && i.recovery.verdict === "baixa") {
    lines.push(`Recuperação baixa hoje (${i.recovery.score}/100): ${i.recovery.advice.headline}`);
  }
  for (const s of i.shoes.filter(s => !s.retired)) {
    const w = wearOf(s, i.shoeRuns);
    if (w.status === "trocar") lines.push(`Tênis ${s.name}: ${Math.round(w.km)} km — ${w.note}`);
  }
  const missed = i.week?.days.flatMap(d => d.missed.map(m => `${d.short}: ${m.label}`)) ?? [];
  if (missed.length >= 2) lines.push(`Sessões previstas que não aconteceram nesta semana — ${missed.join("; ")}.`);
  if (i.sleep && i.sleep.debtHours >= 5) {
    lines.push(`Sono: ${num(i.sleep.debtHours)} h abaixo do alvo na semana.`);
  }

  if (lines.length === 0) {
    // Um atleta sem nenhum dado não recebe um "está tudo bem": não há como
    // saber, e a tranquilidade falsa é pior que o silêncio.
    if (sections.length === 0) return null;
    return {
      key: "alertas",
      title: "Algum alerta?",
      headline: "Nada pedindo atenção agora.",
      lines: [`Recuperação, carga, tênis e as sessões da semana estão dentro do esperado em ${shortDate(i.date)}.`],
      source: sections.map(s => s.title.toLowerCase()).join(", "),
    };
  }

  return {
    key: "alertas",
    title: "Algum alerta?",
    headline: plural(lines.length, "ponto pedindo atenção", "pontos pedindo atenção"),
    lines,
    source: "recuperação, carga, tênis, sono e as sessões da semana",
  };
}

// ─── O dossiê ────────────────────────────────────────────────────────────────

export function buildBrief(input: BriefInput): AthleteBrief {
  const sections = [
    hojeSection(input),
    recuperacaoSection(input),
    semanaSection(input),
    semanaPassadaSection(input),
    evolucaoSection(input),
    cargaSection(input),
    sonoSection(input),
    ritmosSection(input),
    adesaoSection(input),
    provasSection(input),
    metasSection(input),
    tenisSection(input),
  ].filter((s): s is BriefSection => s != null);

  if (input.debrief?.length) {
    sections.push({
      key: "debrief",
      title: "Memória de treino",
      headline: "Seu esforço percebido nas últimas atividades com feedback.",
      lines: input.debrief.map(row => `${shortDate(row.date)} · ${row.modality} · ${row.perception}${row.rpe != null ? ` · PSE ${row.rpe}/10` : ""}`),
      source: "percepção que você registrou no Debrief",
    });
  }
  const alertas = alertasSection(input, sections);
  if (alertas) sections.push(alertas);

  return { date: input.date, firstName: input.firstName, sections };
}

export function sectionOf(brief: AthleteBrief, key: BriefKey): BriefSection | null {
  return brief.sections.find(s => s.key === key) ?? null;
}

/**
 * O dossiê como texto, que é o que o modelo recebe.
 *
 * Tudo que a IA pode dizer sobre este atleta está neste texto. Se um número não
 * aparece aqui, ela não tem como saber — e o prompt manda dizer isso.
 */
export function briefText(brief: AthleteBrief): string {
  const parts = [`DOSSIÊ DO ATLETA${brief.firstName ? ` — ${brief.firstName}` : ""}, em ${longDate(brief.date)}.`];
  for (const s of brief.sections) {
    parts.push([
      `## ${s.title}`,
      s.headline,
      ...s.lines.map(l => `- ${l}`),
      `(fonte: ${s.source})`,
    ].join("\n"));
  }
  return parts.join("\n\n");
}

// ─── As sugestões da tela ────────────────────────────────────────────────────

export interface Suggestion {
  id: string;
  label: string;
  /** A pergunta como o atleta a faria — é ela que fica gravada na conversa. */
  question: string;
  keys: BriefKey[];
}

const ALL_SUGGESTIONS: Suggestion[] = [
  { id: "hoje",           label: "Meu treino de hoje",     question: "Como está meu treino de hoje?",             keys: ["hoje", "recuperacao"] },
  { id: "semana",         label: "Como vai minha semana",  question: "Como está indo minha semana?",              keys: ["semana"] },
  { id: "semana_passada", label: "A semana que fechou",    question: "Como foi a semana passada?",                keys: ["semana_passada"] },
  { id: "evolucao",       label: "O que está melhorando",  question: "O que está melhorando para mim?",           keys: ["evolucao"] },
  { id: "recuperacao",    label: "Minha recuperação",      question: "Como está minha recuperação hoje?",         keys: ["recuperacao", "sono"] },
  { id: "carga",          label: "Minha carga de treino",  question: "Como está minha carga de treino?",          keys: ["carga"] },
  { id: "ritmos",         label: "Meus ritmos e zonas",    question: "Quais são meus ritmos e zonas de treino?",   keys: ["ritmos"] },
  { id: "adesao",         label: "Quanto do plano cumpri", question: "Quanto do plano eu venho cumprindo?",       keys: ["adesao"] },
  { id: "provas",         label: "Minhas provas",          question: "Como estão minhas provas?",                 keys: ["provas", "metas"] },
  { id: "tenis",          label: "Meus tênis",             question: "Como estão meus tênis?",                    keys: ["tenis"] },
  { id: "debrief",        label: "Minha memória de treino", question: "Como percebi o esforço nos treinos recentes?",   keys: ["debrief"] },
  { id: "alertas",        label: "Algum alerta?",          question: "Tem algum alerta para mim?",                keys: ["alertas"] },
];

/** Só as sugestões que este atleta tem dado para responder. */
export function suggestionsFor(brief: AthleteBrief): Suggestion[] {
  const have = new Set(brief.sections.map(s => s.key));
  return ALL_SUGGESTIONS.filter(s => s.keys.some(k => have.has(k)));
}

export function suggestionById(id: string): Suggestion | null {
  return ALL_SUGGESTIONS.find(s => s.id === id) ?? null;
}

/**
 * A resposta de uma sugestão: as seções que ela cobre, escritas.
 *
 * Determinística de ponta a ponta — nenhuma chamada ao modelo, e por isso
 * instantânea, de graça e impossível de errar um número.
 */
export function answerSuggestion(brief: AthleteBrief, suggestion: Suggestion): { content: string; sources: string[] } | null {
  const parts: string[] = [];
  const sources: string[] = [];

  for (const key of suggestion.keys) {
    const s = sectionOf(brief, key);
    if (!s) continue;
    parts.push([`**${s.headline}**`, ...s.lines.map(l => `- ${l}`)].join("\n"));
    sources.push(s.source);
  }

  if (parts.length === 0) return null;
  return { content: parts.join("\n\n"), sources };
}
