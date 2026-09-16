/**
 * Structured treadmill / stair / bike sessions attached to a gym day.
 *
 * "15 min de esteira" tells the athlete nothing: at what incline, how hard, and
 * why. These build the same kind of block structure the running sessions get,
 * anchored on heart rate — pace is meaningless on an incline and doesn't exist
 * at all on a stair machine.
 *
 * Two rules are enforced rather than suggested:
 *   • Cardio AFTER a leg session stays aerobic. Stacking hard intervals on top
 *     of heavy legs is how a "bonus 20 minutes" turns into a lost week.
 *   • Before lifting, cardio is a warm-up and nothing more.
 */
import { hrFor } from "@/lib/workout-builder";
import type { HrTarget } from "@/types";
import type { CardioAddon, CardioMachine } from "@/lib/strength-prefs";
import type { Phase } from "@/lib/strength-builder";

export type CardioIntensity = "recuperacao" | "aerobico" | "tempo" | "intervalado";

export interface CardioBlock {
  label:    string;
  minutes:  number;
  /** Treadmill incline (%) or stair level, when the machine has one. */
  setting?: string;
  hr?:      HrTarget;
  note?:    string;
}

export interface CardioSession {
  machine:  CardioMachine;
  position: "antes" | "depois";
  minutes:  number;
  purpose:  string;
  blocks:   CardioBlock[];
  /** Set when the requested intensity was lowered, with the reason. */
  adjusted?: string;
}

export const CARDIO_INTENSITY_LABEL: Record<CardioIntensity, { label: string; hint: string }> = {
  recuperacao: { label: "Recuperação", hint: "Muito leve, para soltar as pernas" },
  aerobico:    { label: "Aeróbico",    hint: "Z2 contínuo, volume sem impacto" },
  tempo:       { label: "Tempo",       hint: "Esforço controlado e sustentado" },
  intervalado: { label: "Intervalado", hint: "Blocos fortes com recuperação" },
};

const MACHINE_LABEL: Record<CardioMachine, string> = {
  esteira: "Esteira", escada: "Escada", bike: "Bike", nenhum: "—",
};

/** Incline/level guidance per machine and intensity. */
function settingFor(machine: CardioMachine, intensity: CardioIntensity, hard: boolean): string | undefined {
  if (machine === "esteira") {
    if (intensity === "recuperacao") return "inclinação 4-6% · caminhada";
    if (intensity === "aerobico")    return "inclinação 1-2%";
    return hard ? "inclinação 2-4%" : "inclinação 1%";
  }
  if (machine === "escada") {
    if (intensity === "recuperacao") return "nível baixo, cadência confortável";
    if (intensity === "aerobico")    return "nível médio, sem apoiar o peso nos braços";
    return hard ? "nível alto" : "nível médio";
  }
  if (machine === "bike") {
    if (intensity === "recuperacao") return "carga leve, cadência 90+";
    if (intensity === "aerobico")    return "carga moderada";
    return hard ? "carga alta, cadência 80-90" : "carga moderada";
  }
  return undefined;
}

/**
 * Build the session. `lowerBodyDay` and `position` decide whether the requested
 * intensity survives contact with the lifting that surrounds it.
 */
export function buildCardioSession(
  addon: CardioAddon,
  opts: {
    intensity?: CardioIntensity;
    lthr?: number | null;
    phase?: Phase;
    lowerBodyDay?: boolean;
  } = {},
): CardioSession | null {
  if (!addon || addon.machine === "nenhum" || addon.minutes <= 0) return null;

  const machine = addon.machine;
  const position = addon.position;
  const lthr = opts.lthr ?? null;
  const total = addon.minutes;

  // The add-on carries its own intensity; `opts` only overrides it. Reading
  // solely from `opts` silently ignored the athlete's choice for any caller
  // that forgot to forward it.
  let intensity: CardioIntensity = opts.intensity ?? addon.intensity ?? "aerobico";
  let adjusted: string | undefined;

  // Before lifting it's a warm-up — anything else steals the session.
  if (position === "antes" && intensity !== "recuperacao") {
    intensity = "recuperacao";
    adjusted = "Antes da musculação o cardio é aquecimento: mantido leve para não comprometer as cargas.";
  }

  // After legs, hard cardio compounds the damage instead of adding fitness.
  if (position === "depois" && opts.lowerBodyDay && (intensity === "tempo" || intensity === "intervalado")) {
    intensity = "aerobico";
    adjusted = "Dia de pernas: o cardio depois fica aeróbico. Intervalado em cima de perna pesada só acumula fadiga.";
  }

  // Race week keeps everything easy.
  if ((opts.phase === "taper" || opts.phase === "race") && intensity !== "recuperacao") {
    intensity = "recuperacao";
    adjusted = "Semana de prova: cardio só para manter o movimento.";
  }

  const easyHr = hrFor("E", lthr);
  const tempoHr = hrFor("T", lthr);
  const hardHr = hrFor("I", lthr);

  const blocks: CardioBlock[] = [];
  let purpose: string;

  if (intensity === "recuperacao") {
    blocks.push({
      label: position === "antes" ? "Aquecimento" : "Regenerativo",
      minutes: total,
      setting: settingFor(machine, "recuperacao", false),
      hr: easyHr,
      note: position === "antes"
        ? "Só elevar a temperatura e lubrificar as articulações."
        : "Ritmo de conversa fácil — se cansar, está rápido demais.",
    });
    purpose = position === "antes"
      ? "Preparar o corpo para levantar."
      : "Circulação e soltura sem adicionar fadiga.";

  } else if (intensity === "aerobico") {
    blocks.push({ label: "Aquecimento", minutes: Math.min(5, Math.round(total * 0.2)), setting: settingFor(machine, "recuperacao", false), hr: easyHr });
    blocks.push({
      label: "Contínuo",
      minutes: total - Math.min(5, Math.round(total * 0.2)),
      setting: settingFor(machine, "aerobico", false),
      hr: easyHr,
      note: "Mantenha a FC na faixa; suba ou desça a carga para ficar dentro dela.",
    });
    purpose = machine === "escada"
      ? "Volume aeróbico com forte demanda de glúteo e quadril — sem impacto."
      : "Volume aeróbico de baixo impacto, somando à corrida sem custo articular.";

  } else if (intensity === "tempo") {
    const warm = Math.max(5, Math.round(total * 0.25));
    const cool = Math.max(3, Math.round(total * 0.15));
    blocks.push({ label: "Aquecimento", minutes: warm, setting: settingFor(machine, "recuperacao", false), hr: easyHr });
    blocks.push({
      label: "Bloco forte", minutes: total - warm - cool,
      setting: settingFor(machine, "tempo", true), hr: tempoHr,
      note: "Esforço que você sustentaria por ~1 hora: forte, mas controlado.",
    });
    blocks.push({ label: "Desaquecimento", minutes: cool, setting: settingFor(machine, "recuperacao", false), hr: easyHr });
    purpose = "Estímulo de limiar sem o impacto da corrida.";

  } else {
    const warm = Math.max(5, Math.round(total * 0.25));
    const cool = Math.max(3, Math.round(total * 0.15));
    const workTotal = total - warm - cool;
    const rounds = Math.max(3, Math.min(8, Math.floor(workTotal / 3)));
    blocks.push({ label: "Aquecimento", minutes: warm, setting: settingFor(machine, "recuperacao", false), hr: easyHr });
    blocks.push({
      label: `${rounds}× (1 min forte + 2 min leve)`,
      minutes: rounds * 3,
      setting: settingFor(machine, "intervalado", true), hr: hardHr,
      note: "No minuto forte a FC deve subir de verdade; nos 2 min baixe a carga e respire.",
    });
    blocks.push({ label: "Desaquecimento", minutes: cool, setting: settingFor(machine, "recuperacao", false), hr: easyHr });
    purpose = "Potência aeróbica com baixo impacto — útil quando a perna não aguenta mais tiro na rua.";
  }

  return {
    machine, position, minutes: total,
    purpose: `${MACHINE_LABEL[machine]}: ${purpose}`,
    blocks: blocks.filter(b => b.minutes > 0),
    adjusted,
  };
}
