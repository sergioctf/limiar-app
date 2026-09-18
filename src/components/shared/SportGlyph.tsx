/**
 * One line icon per sport — the clean replacement for the emojis (Sérgio,
 * 18/09: "trocar esses emojis por algo mais clean, mas manter a parte visual").
 * Same weight and size as the rest of the interface, so a week of activities
 * reads as one system instead of a row of stickers.
 */
import {
  Activity, Bike, Dumbbell, Flower2, Footprints, Mountain, PersonStanding, Waves, type LucideIcon,
} from "lucide-react";
import type { SportKey } from "@/lib/sports";

const ICON: Partial<Record<SportKey, LucideIcon>> = {
  corrida: Footprints,
  musculacao: Dumbbell,
  ciclismo: Bike,
  bike_indoor: Bike,
  natacao: Waves,
  caminhada: PersonStanding,
  trilha: Mountain,
  yoga: Flower2,
  pilates: Flower2,
  alongamento: Flower2,
};

export function sportIcon(sport: string | null | undefined): LucideIcon {
  return (sport && ICON[sport as SportKey]) || Activity;
}

export function SportGlyph({ sport, className = "w-4 h-4" }: { sport: string | null | undefined; className?: string }) {
  const Icon = sportIcon(sport);
  return <Icon className={className} aria-hidden="true" />;
}
