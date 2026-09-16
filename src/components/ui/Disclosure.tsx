"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "./Surface";

/**
 * The primitive that lets the app be full of features and still feel calm.
 *
 * The brief was "clean, like Whoop, and full of features", which sounds
 * contradictory and is not: Whoop carries an enormous amount of data and shows
 * almost none of it at rest. Depth lives one tap down, so the surface stays
 * readable while nothing is actually removed.
 *
 * That is the trade this component makes everywhere it is used. A dashboard of
 * 26 competing blocks becomes a handful of answers, each of which opens.
 */

interface DisclosureProps {
  title: string;
  /** The one line worth reading without opening it. */
  summary?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  /** Open on first render — for the section the athlete came for. */
  defaultOpen?: boolean;
}

export function Disclosure({ title, summary, icon, children, defaultOpen = false }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card density="tight">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 min-h-[44px] px-1 text-left"
      >
        {icon && <span className="shrink-0 text-surface-500">{icon}</span>}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-surface-200">{title}</span>
          {summary && <span className="block text-xs text-surface-500 truncate mt-0.5">{summary}</span>}
        </span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-surface-500 transition-transform duration-300 ease-smooth ${open ? "rotate-180" : ""}`}
        />
      </button>
      {/*
        Rendered only when open rather than hidden with CSS: several of these
        sections mount charts and fire their own fetches, and a dashboard that
        loads twenty six blocks to show three is the performance half of the
        same clutter problem.
      */}
      {open && (
        /*
          Content is mounted on open rather than hidden with CSS: several of
          these sections mount charts and fire their own fetches, and loading
          twenty six blocks to show three is the performance half of the same
          clutter problem.

          The slide-up is what makes the opening read as *this row expanding*
          rather than the page suddenly being different. Motion here is not
          decoration — it is what preserves the spatial context that tells the
          athlete where they are.
        */
        <div className="pt-3 px-1 pb-1 animate-slide-up">{children}</div>
      )}
    </Card>
  );
}
