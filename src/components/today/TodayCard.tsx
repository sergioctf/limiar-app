"use client";

import Link from "next/link";
import { Check, ArrowRight, Moon } from "lucide-react";
import type { Today } from "@/lib/today";
import { Card } from "@/components/ui/Surface";
import { Pill } from "@/components/ui/Metric";
import type { Tone } from "@/components/ui/tone";
import { Ring } from "@/components/ui/Ring";
import { SwapActions } from "@/components/today/SwapActions";
import { AdaptSessionControl } from "@/components/today/AdaptSession";
import { basisLabel, type RecoveryToday } from "@/lib/recovery-today";

/**
 * The screen's answer, and the only thing on it at full size.
 *
 * Everything else on the home screen is a summary that opens; this is the one
 * block that says something without being asked. The size is doing the work —
 * an athlete should know what today is before reading a word, which is the
 * property the old dashboard lost by giving twenty six blocks equal weight.
 */

const TONE_FOR: Record<Today["state"], Tone> = {
  done:    "good",
  planned: "brand",
  rest:    "neutral",
  no_plan: "warn",
};

const STATUS: Record<Today["state"], string> = {
  done:    "Feito",
  planned: "Hoje",
  rest:    "Hoje",
  no_plan: "Hoje",
};

const VERDICT_TONE: Record<string, Tone> = { alta: "good", moderada: "warn", baixa: "alert" };

export function TodayCard({ today, recovery }: { today: Today; recovery?: RecoveryToday | null }) {
  const tone = TONE_FOR[today.state];
  const swapped = today.session?.swap ?? null;

  return (
    <Card density="roomy" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Pill tone={tone}>{STATUS[today.state]}</Pill>
        {today.state === "done" && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
            <Check className="w-3.5 h-3.5" />
            {today.doneKm.toFixed(1).replace(".0", "")} km registrados
          </span>
        )}
        {today.state === "rest" && <Moon className="w-4 h-4 text-surface-600" />}
      </div>

      <div>
        {swapped && (
          <p className="mb-1 text-xs font-medium text-surface-500">
            Trocado hoje · era {swapped.original.label}
            {swapped.original.distance_km ? ` ${String(swapped.original.distance_km).replace(".", ",")} km` : ""}
          </p>
        )}
        {today.session?.movedFrom && (
          <p className="mb-1 text-xs font-medium text-surface-500">Vindo de {today.session.movedFrom.toLowerCase()}</p>
        )}
        <h1 className="text-[28px] leading-tight font-black text-surface-100 tracking-tight">
          {today.headline}
        </h1>
        {today.detail && (
          <p className="text-sm text-surface-400 mt-2 leading-relaxed">{today.detail}</p>
        )}

        {/*
          The reason, in the athlete's own week.

          Every choice here was argued — the kind of hard session comes from the
          position in the four-week block, the long run is a deliberate share of
          the volume, the easy days are held easy on purpose. None of it ever
          reached the screen, so a carefully built plan arrived looking like a
          spreadsheet. One line is the difference between prescribing and
          coaching, and the reasoning already exists.
        */}
        {today.why && (
          <p className="text-xs text-surface-500 mt-3 pl-3 border-l-2 border-surface-700 leading-relaxed">
            {today.why}
          </p>
        )}
      </div>

      {/*
        Recovery, beside the session it is about.

        It lived one tab away, so the number and the decision it implied never
        met: the athlete read "Tiro 5×800" here and "recuperação 38" there, and
        had to put the two together themselves — or, more often, never saw the
        second. The ring is small on purpose; the session stays the headline.
      */}
      {recovery && recovery.score != null && (
        <Link
          href="/health"
          className="flex items-center gap-3 rounded-2xl border border-surface-700 bg-surface-900/40 p-3 transition-colors hover:border-surface-600 active:scale-[0.99]"
        >
          <Ring ratio={recovery.score / 100} size={48} thickness={5} tone={VERDICT_TONE[recovery.verdict ?? "moderada"]}>
            <span className="text-sm">{recovery.score}</span>
          </Ring>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-surface-100">{recovery.short}</span>
            <span className="block truncate text-xs text-surface-500">
              Recuperação · {basisLabel(recovery)}
            </span>
          </span>
          <ArrowRight className="w-4 h-4 shrink-0 text-surface-600" />
        </Link>
      )}

      {recovery?.offer && !recovery.offer.undo && (
        <div className="space-y-2">
          <p className="text-xs leading-relaxed text-surface-400">{recovery.advice.detail}</p>
          <SwapActions offer={recovery.offer} />
        </div>
      )}
      {recovery?.offer?.undo && <SwapActions offer={recovery.offer} compact />}

      {recovery?.needsCheckin && today.state !== "done" && (
        <Link
          href="/health?checkin=1"
          className="flex min-h-[44px] items-center justify-between rounded-xl bg-surface-700/30 px-3 text-sm text-surface-300 hover:text-surface-100"
        >
          <span>Como você dormiu? Check-in de 20 s afina a recuperação</span>
          <ArrowRight className="w-4 h-4 shrink-0" />
        </Link>
      )}

      {/*
        One action, or none. A hero with three buttons is a menu, and a menu is
        what this screen was replacing.
      */}
      {today.state === "no_plan" && today.prompt && (
        <Link href={today.prompt.href} className="btn-primary w-full">
          {today.prompt.text}
          <ArrowRight className="w-4 h-4" />
        </Link>
      )}

      {/* Decided before leaving (Sérgio, 16/09): adapt here, and the check-in compares against it. */}
      {today.state === "planned" && today.session && today.doneKm === 0 && (
        <AdaptSessionControl day={today.session} />
      )}

      {today.state === "planned" && today.session && (
        <Link
          href="/coach"
          className="flex items-center justify-between min-h-[44px] text-sm text-surface-400 hover:text-surface-200 transition-colors"
        >
          Ver o treino completo
          <ArrowRight className="w-4 h-4" />
        </Link>
      )}

      {/*
        The calibration nudge sits under the session, never over it. Somebody who
        opened the app to train today should get today first; the reason their
        paces are missing is context, not a gate.
      */}
      {today.prompt?.kind === "test" && (
        <Link
          href={today.prompt.href}
          className="flex items-start gap-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 p-3 min-h-[44px]"
        >
          <span className="text-sm text-amber-200/90 leading-snug">{today.prompt.text}</span>
          <ArrowRight className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        </Link>
      )}
    </Card>
  );
}
