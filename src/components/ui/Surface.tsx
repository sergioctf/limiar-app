"use client";

import { ChevronRight } from "lucide-react";
import { TONE, type Tone } from "./tone";

/**
 * The layout primitives every screen is built from.
 *
 * There were 121 components and an empty `ui/` folder, so each one hand-rolled
 * its own markup: four different card paddings (p-3, p-4, p-5, p-8), a dozen
 * spellings of the same header, and no shared idea of what a "row" looks like.
 * The result reads as a collection of screens by different authors.
 *
 * One rhythm, defined once. Everything below composes from these.
 */

/* ── Card ─────────────────────────────────────────────────────────────────── */

interface CardProps {
  children: React.ReactNode;
  /** `tight` for lists and nested blocks, `roomy` for a screen's hero. */
  density?: "tight" | "default" | "roomy";
  tone?: Tone;
  className?: string;
}

const PAD = { tight: "p-3", default: "p-4", roomy: "p-6" } as const;

export function Card({ children, density = "default", tone, className = "" }: CardProps) {
  const t = tone && tone !== "neutral" ? TONE[tone] : null;
  return (
    <div
      className={[
        "rounded-2xl border",
        t ? `${t.bg} ${t.border}` : "bg-surface-800 border-surface-700",
        PAD[density],
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

/* ── Section ──────────────────────────────────────────────────────────────── */

interface SectionProps {
  title: string;
  /** One line under the title. Skip it unless it earns its space. */
  subtitle?: string;
  /** A single action, right-aligned. More than one belongs inside the section. */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * A titled group.
 *
 * The title is small and quiet on purpose: it labels the content rather than
 * competing with it. On a screen where every heading shouted, the athlete's eye
 * had nowhere to land.
 */
export function Section({ title, subtitle, action, children, className = "" }: SectionProps) {
  return (
    <section className={`space-y-2.5 ${className}`}>
      <div className="flex items-baseline justify-between gap-3 px-0.5">
        <div className="min-w-0">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">
            {title}
          </h2>
          {subtitle && <p className="text-xs text-surface-500 mt-0.5">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/* ── Row ──────────────────────────────────────────────────────────────────── */

interface RowProps {
  label: React.ReactNode;
  value?: React.ReactNode;
  /** Secondary line under the label. */
  detail?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  href?: string;
  tone?: Tone;
}

/**
 * A single line of information, optionally tappable.
 *
 * This is the workhorse of progressive disclosure: a screen made of rows shows
 * a lot and says little, and each row opens into the detail it summarises.
 * Tappable rows get the chevron — an affordance the old cards left the athlete
 * to guess at.
 */
export function Row({ label, value, detail, icon, onClick, href, tone = "neutral" }: RowProps) {
  const t = TONE[tone];
  const inner = (
    <>
      {icon && <span className={`shrink-0 ${t.text}`}>{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-surface-200 truncate">{label}</span>
        {detail && <span className="block text-xs text-surface-500 truncate mt-0.5">{detail}</span>}
      </span>
      {value != null && (
        <span className={`shrink-0 text-sm font-semibold tabular-nums ${tone === "neutral" ? "text-surface-100" : t.text}`}>
          {value}
        </span>
      )}
      {(onClick || href) && <ChevronRight className="w-4 h-4 shrink-0 text-surface-600" />}
    </>
  );

  const base = "w-full flex items-center gap-3 py-3 text-left";

  if (href) return <a href={href} className={`${base} min-h-[44px]`}>{inner}</a>;
  if (onClick) {
    return (
      <button onClick={onClick} className={`${base} min-h-[44px] active:opacity-60 transition-opacity`}>
        {inner}
      </button>
    );
  }
  return <div className={base}>{inner}</div>;
}

/** Rows inside a card, with hairlines between them. */
export function RowGroup({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-surface-700/60">{children}</div>;
}

/* ── Reveal ───────────────────────────────────────────────────────────────── */

/**
 * A list whose children arrive one after another.
 *
 * The app had this and the restructure dropped it: `stagger-in` was on the old
 * screens and my rewrite replaced those containers with plain `space-y`, which
 * is why everything now appears at once and the app reads as static. Sérgio
 * noticed before I did.
 *
 * Motion here is doing real work — a list that assembles itself tells you it
 * was just computed, and gives the eye an order to read in. It respects
 * `prefers-reduced-motion` through the `stagger-in` rule in globals.css.
 */
export function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`stagger-in ${className}`}>{children}</div>;
}
