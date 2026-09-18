/**
 * The app's areas — decided by Sérgio on 18/09.
 *
 *   Hoje         — the day and the week
 *   Treinador    — plan, adaptations, conversation; Provas and Metas live here
 *   Histórico    — what was done and how it evolves: Atividades, Calendário, Gráficos
 *   Saúde        — sleep, recovery, trends, load and form
 *   Amigos       — its own area, more prominent than it was
 *   Configurações — its own area, always one tap away
 *
 * One definition, read by the sidebar, the bottom bar and the tabs inside each
 * area, so a page can never belong to one area in the menu and another in its
 * own tabs.
 */
import {
  ClipboardList, HeartPulse, History, Settings, Sun, Users, type LucideIcon,
} from "lucide-react";

export interface NavArea {
  key: "hoje" | "treinador" | "historico" | "saude" | "amigos" | "config";
  href: string;
  label: string;
  icon: LucideIcon;
  /** Every path that belongs to the area — the menu lights it up on all of them. */
  paths: string[];
  /** Tabs across the area's own pages, when it has more than one. */
  tabs?: Array<{ href: string; label: string }>;
  /** The width every page of the area shares, so its tabs line up with the content. */
  width?: "max-w-3xl" | "max-w-4xl";
}

export const NAV_AREAS: NavArea[] = [
  { key: "hoje", href: "/", label: "Hoje", icon: Sun, paths: ["/"] },
  {
    key: "treinador", href: "/coach", label: "Treinador", icon: ClipboardList, paths: ["/coach", "/races", "/goals"], width: "max-w-3xl",
    tabs: [{ href: "/coach", label: "Plano" }, { href: "/races", label: "Provas" }, { href: "/goals", label: "Metas" }],
  },
  {
    key: "historico", href: "/runs", label: "Histórico", icon: History, paths: ["/runs", "/calendar", "/analytics", "/activities"], width: "max-w-4xl",
    tabs: [{ href: "/runs", label: "Atividades" }, { href: "/calendar", label: "Calendário" }, { href: "/analytics", label: "Gráficos" }],
  },
  { key: "saude", href: "/health", label: "Saúde", icon: HeartPulse, paths: ["/health"] },
  { key: "amigos", href: "/friends", label: "Amigos", icon: Users, paths: ["/friends"] },
  { key: "config", href: "/settings", label: "Configurações", icon: Settings, paths: ["/settings"] },
];

/** The area a path belongs to. "/" only matches itself. */
export function areaOf(pathname: string): NavArea | null {
  return NAV_AREAS.find(a => a.paths.some(p => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`)))) ?? null;
}

