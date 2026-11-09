/**
 * Theme selection: dark, light, or whatever the device says.
 *
 * Kept as plain functions rather than a context so the inline boot script and
 * the settings toggle share exactly one definition of "which class goes on the
 * html element" — two implementations of that rule is how a theme ends up
 * flickering or disagreeing with itself.
 */

export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

export const THEME_STORAGE_KEY = "limiar-theme";

export const THEME_LABEL: Record<ThemePreference, string> = {
  dark:   "Escuro",
  light:  "Claro",
  system: "Do sistema",
};

/** Anything unrecognised falls back to the device preference. */
export function normalizeThemePreference(raw: unknown): ThemePreference {
  return raw === "dark" || raw === "light" || raw === "system" ? raw : "system";
}

/**
 * The theme actually applied, given a preference and what the device reports.
 *
 * `systemPrefersDark` is passed in rather than read here so this stays pure and
 * testable — the media query lives at the call site.
 */
export function resolveTheme(pref: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (pref === "dark" || pref === "light") return pref;
  return systemPrefersDark ? "dark" : "light";
}

/** The `<meta name="theme-color">` value, so the browser chrome matches. */
export function themeColor(theme: ResolvedTheme): string {
  return theme === "dark" ? "#08070d" : "#f5f4fa";
}

/**
 * The script that runs before first paint.
 *
 * Without it the page renders in whatever the markup says and then corrects
 * itself once React hydrates — a white flash on every navigation for anyone
 * using the dark theme. It has to be inline and synchronous, which is why it is
 * a string rather than a module.
 */
export function themeBootScript(): string {
  return `(function(){try{
var p=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})||"system";
var d=p==="dark"||(p!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);
var r=document.documentElement;
r.classList.remove("dark","light");
r.classList.add(d?"dark":"light");
var m=document.querySelector('meta[name="theme-color"]');
if(m)m.setAttribute("content",d?${JSON.stringify(themeColor("dark"))}:${JSON.stringify(themeColor("light"))});
}catch(e){document.documentElement.classList.add("dark");}})();`;
}

/** Apply a resolved theme to the document. Safe to call repeatedly. */
export function applyTheme(theme: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor(theme));
}

export function readStoredPreference(): ThemePreference {
  if (typeof localStorage === "undefined") return "system";
  try {
    return normalizeThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function storePreference(pref: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Private browsing denies storage; the theme still applies for this session.
  }
}
