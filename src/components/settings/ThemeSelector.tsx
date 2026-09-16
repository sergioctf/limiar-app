"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, Monitor, Check } from "lucide-react";
import {
  THEME_LABEL, applyTheme, readStoredPreference, resolveTheme, storePreference,
  type ThemePreference,
} from "@/lib/theme";

const ICON: Record<ThemePreference, typeof Moon> = {
  dark: Moon, light: Sun, system: Monitor,
};

const HINT: Record<ThemePreference, string> = {
  dark:   "Como sempre foi.",
  light:  "Melhor sob sol forte.",
  system: "Acompanha o aparelho.",
};

const OPTIONS: ThemePreference[] = ["dark", "light", "system"];

/**
 * Theme choice, applied the moment it is picked.
 *
 * No save button: a theme you cannot see until you confirm is a theme you
 * cannot judge. The preference lives in localStorage rather than the profile
 * because it belongs to the device — the same athlete may well want dark on a
 * phone at 5am and light on a laptop at noon.
 */
export function ThemeSelector() {
  const [pref, setPref] = useState<ThemePreference>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPref(readStoredPreference());
    setReady(true);
  }, []);

  // "Do sistema" has to keep following the system, not just at page load.
  useEffect(() => {
    if (pref !== "system" || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => applyTheme(resolveTheme("system", mq.matches));
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [pref]);

  function choose(next: ThemePreference) {
    setPref(next);
    storePreference(next);
    const systemDark = typeof window !== "undefined"
      && window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(resolveTheme(next, systemDark));
  }

  return (
    <div className="card p-4 space-y-3">
      <div>
        <h3 className="font-bold text-surface-100 text-sm">Aparência</h3>
        <p className="text-[11px] text-surface-500 mt-0.5">
          Vale só neste aparelho.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map(opt => {
          const Icon = ICON[opt];
          const on = ready && pref === opt;
          return (
            <button
              key={opt}
              onClick={() => choose(opt)}
              aria-pressed={on}
              className={`relative flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-colors ${
                on
                  ? "bg-brand-500/15 border-brand-500/40"
                  : "bg-surface-700/30 border-surface-700 hover:border-surface-600"
              }`}
            >
              {on && (
                <Check className="w-3 h-3 text-brand-400 absolute top-1.5 right-1.5" />
              )}
              <Icon className={`w-5 h-5 ${on ? "text-brand-400" : "text-surface-400"}`} />
              <span className={`text-[11px] font-semibold ${on ? "text-brand-300" : "text-surface-300"}`}>
                {THEME_LABEL[opt]}
              </span>
              <span className="text-[10px] text-surface-500 leading-tight text-center">
                {HINT[opt]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
