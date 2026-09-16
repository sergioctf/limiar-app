import { describe, it, expect } from "vitest";
import { explainLoad, LOAD_GLOSSARY } from "@/lib/load-explainer";
import { tsbLabel } from "@/lib/training-load";

const reading = (tsb: number, ctl = 45, atl = 45 - tsb) => ({ ctl, atl, tsb });

describe("bands", () => {
  it.each([
    [ 25, "muito_descansado"],
    [ 10, "descansado"],
    [  0, "equilibrio"],
    [ -5, "treinando"],
    [-15, "treinando"],
    [-25, "fatigado"],
    [-40, "overreaching"],
  ])("form %i falls in %s", (tsb, band) => {
    expect(explainLoad(reading(tsb)).band).toBe(band);
  });

  it("agrees with the badge the card already shows", () => {
    // Two places must not disagree about whether the athlete is fatigued.
    const pairs: Array<[number, string]> = [
      [ 25, "Muito descansado"],
      [ 10, "Descansado ✓"],
      [  0, "Equilíbrio ✓"],
      [-15, "Em treinamento"],
      [-25, "Fatigado"],
      [-40, "Overreaching ⚠"],
    ];
    const nossoRotulo: Record<string, string> = {
      muito_descansado: "Muito descansado",
      descansado:       "Descansado ✓",
      equilibrio:       "Equilíbrio ✓",
      treinando:        "Em treinamento",
      fatigado:         "Fatigado",
      overreaching:     "Overreaching ⚠",
    };
    for (const [tsb, esperado] of pairs) {
      expect(tsbLabel(tsb).label).toBe(esperado);
      expect(nossoRotulo[explainLoad(reading(tsb)).band]).toBe(esperado);
    }
  });
});

describe("the sentence", () => {
  it("always states the form value with its sign", () => {
    expect(explainLoad(reading(-9)).headline).toContain("−9".replace("−", "-"));
    expect(explainLoad(reading(12)).headline).toContain("+12");
  });

  it("never leaves the athlete without something to do", () => {
    for (const tsb of [30, 10, 0, -10, -25, -45]) {
      const e = explainLoad(reading(tsb));
      expect(e.headline.length).toBeGreaterThan(30);
      expect(e.advice.length).toBeGreaterThan(30);
    }
  });

  it("reads a high form as good for racing but bad for building", () => {
    const e = explainLoad(reading(25));
    expect(e.headline).toMatch(/prova/i);
    expect(e.advice).toMatch(/volume|prova/i);
  });

  it("treats being tired mid-block as normal, not as a failure", () => {
    const e = explainLoad(reading(-15));
    expect(e.headline).toMatch(/adaptação|bloco|treino/i);
    expect(e.headline).not.toMatch(/erro|problema grave/i);
  });

  it("tells someone deep in the red to back off", () => {
    const e = explainLoad(reading(-45));
    expect(e.advice).toMatch(/reduza|descanso/i);
  });

  /*
   * These used to require the headline to restate CTL and ATL — "fadiga (44) e
   * fitness (42) andando juntos". The card prints both numbers immediately
   * above the sentence, so quoting them back was the app reading its own screen
   * aloud, and it pushed the copy to four lines nobody finished.
   *
   * What the sentence owes the athlete is the *form* value it is interpreting,
   * so the words are anchored to a number, and then what to do. The other two
   * numbers are already on screen.
   */
  it("names the balanced state without restating the cards above it", () => {
    const e = explainLoad({ ctl: 42, atl: 44, tsb: -2 });
    expect(e.band).toBe("equilibrio");
    expect(e.headline).toContain("-2");
    expect(e.headline).not.toContain("42");
    expect(e.headline).toContain("equilíbrio");
  });

  it("tells a rested athlete what the rest costs them", () => {
    const e = explainLoad({ ctl: 38, atl: 18, tsb: 20 });
    expect(e.headline).toContain("+20");
    expect(e.headline).toMatch(/construir|prova/i);
    expect(e.advice).toMatch(/volume|escorre/i);
  });

  it("stays short enough to be read", () => {
    // Four lines of prose on a dashboard is a textbook, and textbooks go unread.
    for (const tsb of [25, 10, -2, -12, -25, -40]) {
      const e = explainLoad({ ctl: 40, atl: 40 - tsb, tsb });
      expect(e.headline.length, String(tsb)).toBeLessThan(110);
      expect(e.advice.length, String(tsb)).toBeLessThan(130);
    }
  });
});

describe("not enough history", () => {
  it("says so instead of interpreting noise", () => {
    const e = explainLoad(reading(-40), { daysOfData: 10 });
    expect(e.warmingUp).toBe(true);
    expect(e.headline).toMatch(/histórico/i);
    // And does not hand out a scary instruction based on ten days of data.
    expect(e.advice).not.toMatch(/reduza agora/i);
  });

  it("speaks normally once there is a month of data", () => {
    const e = explainLoad(reading(-40), { daysOfData: 40 });
    expect(e.warmingUp).toBe(false);
    expect(e.advice).toMatch(/reduza/i);
  });

  it("assumes there is enough when nobody says otherwise", () => {
    expect(explainLoad(reading(0)).warmingUp).toBe(false);
  });
});

describe("glossary", () => {
  it("defines all three numbers", () => {
    const e = explainLoad(reading(0));
    expect(e.glossary.map(g => g.term)).toEqual(["CTL", "ATL", "TSB"]);
    expect(e.glossary.map(g => g.label)).toEqual(["Fitness", "Fadiga", "Forma"]);
  });

  it("explains each one in a full sentence", () => {
    for (const g of LOAD_GLOSSARY) {
      expect(g.text.length).toBeGreaterThan(40);
      expect(g.text).toMatch(/\.$/);
    }
  });

  it("hands back a copy, so a component cannot mutate the source", () => {
    const e = explainLoad(reading(0));
    e.glossary[0].text = "adulterado";
    expect(LOAD_GLOSSARY[0].text).not.toBe("adulterado");
  });
});
