"use client";

/**
 * O tempo, logo abaixo da saudação.
 *
 * Uma linha só: temperatura agora, condição e sensação. Toca e abre as próximas
 * horas — o Sérgio deixou a escolha em aberto ("pode ser um toggle ou não") e a
 * linha fechada é o que cabe no topo da Hoje sem empurrar o treino do dia para
 * baixo da dobra.
 *
 * A localização é pedida **no toque**, nunca sozinha ao abrir o app, e fica
 * guardada só neste navegador. Enquanto ela não existe, o que aparece é um
 * botão, não um espaço vazio.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain,
  CloudSnow, CloudSun, Droplets, Loader2, MapPin, Sun, type LucideIcon,
} from "lucide-react";
import { readForecast, skyKind, weatherUrl, SKY_LABEL, type SkyKind, type WeatherNow as Forecast } from "@/lib/weather";

const COORDS_KEY = "limiar_coords";
const CACHE_KEY = "limiar_weather";
/** Dez minutos: o bastante para poupar pedido, pouco para a linha envelhecer. */
const CACHE_MS = 10 * 60 * 1000;

const ICON: Record<SkyKind, LucideIcon> = {
  limpo: Sun,
  poucas_nuvens: CloudSun,
  nublado: Cloud,
  nevoa: CloudFog,
  garoa: CloudDrizzle,
  chuva: CloudRain,
  pancada: CloudRain,
  trovoada: CloudLightning,
  neve: CloudSnow,
};

/** Chuva pede um tom próprio; o resto fica neutro para não competir com o treino. */
const TINT: Record<SkyKind, string> = {
  limpo: "text-amber-300",
  poucas_nuvens: "text-amber-200/80",
  nublado: "text-surface-300",
  nevoa: "text-surface-400",
  garoa: "text-sky-300",
  chuva: "text-sky-300",
  pancada: "text-sky-300",
  trovoada: "text-violet-300",
  neve: "text-sky-200",
};

function readStored<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}

export function WeatherNow() {
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [state, setState] = useState<"idle" | "asking" | "loading" | "denied" | "failed">("idle");
  const [open, setOpen] = useState(false);

  // Coordenadas já autorizadas antes, e a última previsão, se ainda vale.
  useEffect(() => {
    const saved = readStored<{ lat: number; lon: number }>(COORDS_KEY);
    if (saved) setCoords(saved);
    const cached = readStored<{ at: number; data: Forecast }>(CACHE_KEY);
    if (cached && Date.now() - cached.at < CACHE_MS) setForecast(cached.data);
  }, []);

  const load = useCallback(async (lat: number, lon: number) => {
    setState("loading");
    try {
      const res = await fetch(weatherUrl(lat, lon));
      const data = readForecast(await res.json());
      if (!data) { setState("failed"); return; }
      setForecast(data);
      setState("idle");
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data })); } catch { /* sem cache, tudo bem */ }
    } catch {
      setState("failed");
    }
  }, []);

  useEffect(() => {
    if (coords && !forecast && state === "idle") load(coords.lat, coords.lon);
  }, [coords, forecast, state, load]);

  function askLocation() {
    if (!("geolocation" in navigator)) { setState("failed"); return; }
    setState("asking");
    navigator.geolocation.getCurrentPosition(
      pos => {
        const c = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        try { localStorage.setItem(COORDS_KEY, JSON.stringify(c)); } catch { /* segue sem guardar */ }
        setCoords(c);
        load(c.lat, c.lon);
      },
      () => setState("denied"),
      { timeout: 10_000, maximumAge: 30 * 60 * 1000 },
    );
  }

  if (state === "denied" || state === "failed") return null;

  if (!coords) {
    return (
      <button
        type="button"
        onClick={askLocation}
        disabled={state === "asking"}
        className="flex min-h-[32px] items-center gap-1.5 text-xs text-surface-500 transition-colors hover:text-surface-300 disabled:opacity-60"
      >
        {state === "asking"
          ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Pedindo sua localização…</>
          : <><MapPin className="h-3.5 w-3.5" /> Ver o tempo agora</>}
      </button>
    );
  }

  if (!forecast) {
    return (
      <p className="flex min-h-[32px] items-center gap-1.5 text-xs text-surface-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando o tempo…
      </p>
    );
  }

  // `kind` é novo: uma previsão guardada antes dele ainda pode estar no cache.
  const kind = forecast.kind ?? skyKind(forecast.code);
  const Icon = ICON[kind];

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex min-h-[32px] items-center gap-2 text-sm text-surface-300 transition-colors hover:text-surface-100"
      >
        <Icon className={`h-4 w-4 shrink-0 ${TINT[kind]}`} />
        <span className="font-semibold tabular-nums text-surface-100">{forecast.tempC}°</span>
        <span className="text-surface-400">{SKY_LABEL[kind]}</span>
        {forecast.feelsLikeC != null && forecast.feelsLikeC !== forecast.tempC && (
          <span className="text-xs text-surface-500">sensação {forecast.feelsLikeC}°</span>
        )}
        {forecast.next.length > 0 && (
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-surface-600 transition-transform ${open ? "rotate-180" : ""}`} />
        )}
      </button>

      {open && forecast.next.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {forecast.next.map(h => {
            const k = skyKind(h.code);
            const HourIcon = ICON[k];
            return (
              <div
                key={h.label}
                className="flex min-w-[58px] shrink-0 flex-col items-center gap-1 rounded-xl bg-surface-800/60 px-2 py-2"
              >
                <span className="text-[10px] text-surface-500">{h.label}</span>
                <HourIcon className={`h-4 w-4 ${TINT[k]}`} />
                <span className="text-xs font-semibold tabular-nums text-surface-200">{h.tempC}°</span>
                {h.rainChance != null && h.rainChance >= 20 && (
                  <span className="flex items-center gap-0.5 text-[10px] text-sky-300">
                    <Droplets className="h-2.5 w-2.5" />{h.rainChance}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
