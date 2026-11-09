/**
 * Theme bugs are cheap to ship and loud to experience: a white flash on every
 * page load, or a toggle that disagrees with what is on screen. Both come from
 * the boot script and the React code holding different ideas of the same rule,
 * so the rule lives in one place and is checked here.
 */
import { describe, it, expect } from "vitest";
import {
  normalizeThemePreference, resolveTheme, themeColor, themeBootScript,
  THEME_STORAGE_KEY, THEME_LABEL,
} from "@/lib/theme";

describe("preferência", () => {
  it("aceita as três opções válidas", () => {
    for (const p of ["dark", "light", "system"] as const) {
      expect(normalizeThemePreference(p)).toBe(p);
    }
  });

  it("cai no sistema diante de lixo", () => {
    for (const junk of [null, undefined, "", "roxo", 42, {}]) {
      expect(normalizeThemePreference(junk)).toBe("system");
    }
  });

  it("tem rótulo para toda opção", () => {
    for (const p of ["dark", "light", "system"] as const) {
      expect(THEME_LABEL[p].length).toBeGreaterThan(0);
    }
  });
});

describe("resolver o tema", () => {
  it("escolha explícita ignora o sistema", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("system segue o dispositivo", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("cor da barra do navegador", () => {
  it("acompanha o fundo da página em cada tema", () => {
    expect(themeColor("dark")).toBe("#08070d");
    expect(themeColor("light")).toBe("#f5f4fa");
  });
});

describe("script anti-piscada", () => {
  const script = themeBootScript();

  it("usa a mesma chave de armazenamento que o resto do app", () => {
    // Se divergirem, o script pinta um tema e o app pinta outro.
    expect(script).toContain(JSON.stringify(THEME_STORAGE_KEY));
  });

  it("aplica exatamente uma classe de tema", () => {
    // Deixar as duas classes na raiz faria a última regra do CSS vencer,
    // que é o tipo de bug que só aparece depois de mudar o arquivo.
    expect(script).toContain('classList.remove("dark","light")');
  });

  it("cai no escuro se qualquer coisa falhar", () => {
    // localStorage bloqueado em navegação privada não pode deixar a página sem
    // tema nenhum — que renderiza texto claro sobre fundo claro.
    expect(script).toMatch(/catch\(e\)\{document\.documentElement\.classList\.add\("dark"\)/);
  });

  it("é executável e não lança", () => {
    expect(() => new Function(script)).not.toThrow();
  });

  it("roda em um DOM simulado e escolhe o tema guardado", () => {
    const classes = new Set<string>();
    const root = {
      classList: {
        add:    (...c: string[]) => c.forEach(x => classes.add(x)),
        remove: (...c: string[]) => c.forEach(x => classes.delete(x)),
      },
    };
    const sandbox = {
      localStorage: { getItem: () => "light" },
      window: { matchMedia: () => ({ matches: true }) },
      document: { documentElement: root, querySelector: () => null },
    };

    new Function("localStorage", "window", "document", script)(
      sandbox.localStorage, sandbox.window, sandbox.document,
    );

    // Guardado "light" vence o sistema que diz escuro.
    expect(Array.from(classes)).toEqual(["light"]);
  });
});
