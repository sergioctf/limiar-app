/**
 * A structural guard against the bug that keeps coming back.
 *
 * Three times now the same defect shipped: a Date built or adjusted with LOCAL
 * field methods (`setDate`, `setHours`) and then serialised with
 * `toISOString()`, which is UTC. In Brazil the two disagree by a day every
 * evening after 21:00.
 *
 *   • "Semana inválida" — the client computed Monday locally, sent it as UTC,
 *     and the server rejected its own request every night.
 *   • A 90-day form chart that rendered 89 points.
 *   • `getMondayOf` returning *Tuesday* at 21:34 on a Tuesday, so the dashboard
 *     dropped the athlete's Monday from the week.
 *
 * None of them threw. Reviews did not catch them because each looks correct in
 * isolation. So the rule is enforced here instead of remembered: local fields
 * in, local fields out — `localDateStr` from lib/week.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";

/**
 * Files allowed to serialise with `toISOString().slice(0, 10)`.
 *
 * Each entry is a deliberate decision, not an exemption granted for
 * convenience — anything added here needs a reason written next to it.
 */
const ALLOWED = new Map<string, string>([
  // Walks its 90-day window entirely in UTC, start to finish. Mixing a local
  // cursor into it is what produced the 89-day chart.
  ["src/lib/training-load.ts", "motor de carga é todo-UTC por dentro"],
  // Defines the local alternative; the comparison against UTC is the point.
  ["src/lib/week.ts", "define o serializador local"],
  // Drives its week arithmetic with setUTC* from end to end, after converting
  // the instant to São Paulo first. Consistent, so it is not the defect.
  ["src/lib/weekly-plan.ts", "aritmética de semana é toda setUTC*"],
]);

/**
 * API routes are exempt as a class, not one by one.
 *
 * They only ever execute on the server, where the process runs in UTC — so the
 * local mutators and `toISOString` agree and the mismatch cannot arise. The
 * rule protects code that reaches a browser, which is where the athlete's
 * clock is three hours from the server's.
 *
 * If a route ever renders a date for the athlete rather than filtering a query
 * by one, it belongs on the client side of this line.
 */
const SERVER_ONLY = "src/app/api/";

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** A local-field mutation followed, close by, by a UTC serialisation. */
const RISKY = /(\w+)\.set(?:Date|Hours|Minutes|Month|FullYear)\([^)]*\)[\s\S]{0,300}?\1\.toISOString\(\)\.slice\(0,\s*10\)/;

describe("fuso: campos locais nunca saem como UTC", () => {
  const raiz = join(process.cwd(), "src");
  const arquivos = sourceFiles(raiz);

  it("encontra os fontes do projeto", () => {
    expect(arquivos.length).toBeGreaterThan(50);
  });

  it("nenhum arquivo novo mistura mutação local com serialização UTC", () => {
    const infratores: string[] = [];

    for (const full of arquivos) {
      const rel = full.slice(process.cwd().length + 1).split(sep).join("/");
      if (rel.startsWith(SERVER_ONLY)) continue;
      if (ALLOWED.has(rel)) continue;
      if (RISKY.test(readFileSync(full, "utf8"))) infratores.push(rel);
    }

    expect(
      infratores,
      "Use localDateStr() de @/lib/week — ou, se o cálculo for realmente todo-UTC, " +
      "use setUTCDate/setUTCHours e registre o arquivo na lista ALLOWED com o motivo.",
    ).toEqual([]);
  });

  it("a lista de exceções não cresce em silêncio", () => {
    // Se esta contagem subir, alguém abriu uma exceção — que é exatamente a
    // decisão que merece aparecer num diff.
    expect(ALLOWED.size).toBe(3);
  });
});
