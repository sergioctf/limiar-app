/**
 * Two silent failures this closes.
 *
 * The watch measured 412 kcal, sent it to Strava, and the app showed a MET
 * estimate — because every import path except the webhook reads Strava's
 * activity *list*, which omits calories. Nothing errored; the athlete simply
 * planned meals around a number nobody measured.
 *
 * And syncing on app open is only safe if it is throttled. Strava allows 100
 * requests per 15 minutes across the whole application: a sync per navigation
 * would exhaust that budget and take the webhook down with it — for every user,
 * not just the one navigating.
 */
import { describe, it, expect } from "vitest";
import {
  activitiesNeedingDetail, mergeDetail, shouldAutoSync,
  MAX_DETAIL_FETCHES, AUTO_SYNC_MINUTES,
} from "@/lib/strava-enrich";

const act = (id: number, calories?: number | null) => ({ id, calories });

describe("quais atividades merecem uma chamada de detalhe", () => {
  it("escolhe só as que estão sem calorias", () => {
    const r = activitiesNeedingDetail([act(1, 300), act(2, null), act(3, undefined)]);
    expect(r.map(a => a.id)).toEqual([2, 3]);
  });

  it("trata zero como ausente — relógio nenhum grava 0 kcal", () => {
    expect(activitiesNeedingDetail([act(1, 0)]).map(a => a.id)).toEqual([1]);
  });

  it("respeita o orçamento de requisições", () => {
    const muitas = Array.from({ length: 200 }, (_, i) => act(i, null));
    expect(activitiesNeedingDetail(muitas)).toHaveLength(MAX_DETAIL_FETCHES);
  });

  it("aceita orçamento menor e nunca negativo", () => {
    const muitas = Array.from({ length: 10 }, (_, i) => act(i, null));
    expect(activitiesNeedingDetail(muitas, 3)).toHaveLength(3);
    expect(activitiesNeedingDetail(muitas, -5)).toHaveLength(0);
  });

  it("não gasta chamada quando tudo já tem caloria", () => {
    expect(activitiesNeedingDetail([act(1, 200), act(2, 350)])).toEqual([]);
  });
});

describe("juntar o detalhe com a lista", () => {
  it("preenche a caloria que faltava", () => {
    expect(mergeDetail(act(1, null), { calories: 412 }).calories).toBe(412);
  });

  it("nunca sobrescreve um valor que já existia", () => {
    // Re-sincronizar não pode reescrever histórico em silêncio.
    expect(mergeDetail(act(1, 300), { calories: 999 }).calories).toBe(300);
  });

  it("ignora detalhe ausente ou sem caloria", () => {
    expect(mergeDetail(act(1, null), null).calories).toBeNull();
    expect(mergeDetail(act(1, null), {}).calories).toBeNull();
    expect(mergeDetail(act(1, null), { calories: 0 }).calories).toBeNull();
  });

  it("não modifica o objeto original", () => {
    const original = act(1, null);
    mergeDetail(original, { calories: 412 });
    expect(original.calories).toBeNull();
  });
});

describe("quando sincronizar ao abrir o app", () => {
  const agora = new Date("2026-08-05T12:00:00Z");

  it("sincroniza quando nunca sincronizou", () => {
    expect(shouldAutoSync(null, agora)).toBe(true);
    expect(shouldAutoSync(undefined, agora)).toBe(true);
  });

  it("não sincroniza de novo logo em seguida", () => {
    // O caso que protege o limite do Strava: navegar entre telas.
    const cincoMin = new Date(agora.getTime() - 5 * 60_000).toISOString();
    expect(shouldAutoSync(cincoMin, agora)).toBe(false);
  });

  it("sincroniza passado o intervalo", () => {
    const passou = new Date(agora.getTime() - (AUTO_SYNC_MINUTES + 1) * 60_000).toISOString();
    expect(shouldAutoSync(passou, agora)).toBe(true);
  });

  it("sincroniza exatamente no limite", () => {
    const limite = new Date(agora.getTime() - AUTO_SYNC_MINUTES * 60_000).toISOString();
    expect(shouldAutoSync(limite, agora)).toBe(true);
  });

  it("ignora carimbo corrompido em vez de travar para sempre", () => {
    // Um valor ilegível não pode significar "já sincronizei" eternamente.
    expect(shouldAutoSync("ontem", agora)).toBe(true);
    expect(shouldAutoSync("", agora)).toBe(true);
  });

  it("ignora carimbo no futuro — é relógio errado, não sync recente", () => {
    const futuro = new Date(agora.getTime() + 86_400_000).toISOString();
    expect(shouldAutoSync(futuro, agora)).toBe(true);
  });
});
