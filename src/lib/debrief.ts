export const PERCEPTIONS = { light: "Leve", moderate: "Moderado", heavy: "Pesado" } as const;
export type Perception = keyof typeof PERCEPTIONS;

export function validPerception(value: unknown): value is Perception {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PERCEPTIONS, value);
}

export function validRpe(value: unknown): value is number | null | undefined {
  return value == null || (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 10);
}

export function rpeLabel(rpe: number): string {
  if (rpe === 0) return "Repouso";
  if (rpe <= 2) return "Muito leve";
  if (rpe <= 4) return "Leve";
  if (rpe <= 6) return "Moderado";
  if (rpe <= 8) return "Intenso";
  return "Máximo";
}

/** Keep the five-level training engine separate from the athlete's stored PSE. */
export function legacyEffort(perception: Perception, rpe: number | null): number {
  if (perception === "heavy") return rpe != null && rpe >= 9 ? 5 : 4;
  if (perception === "light") return rpe != null && rpe <= 2 ? 1 : 2;
  return 3;
}

export function perceptionOf(effort: number | null): Perception | null {
  if (effort == null) return null;
  return effort <= 2 ? "light" : effort === 3 ? "moderate" : "heavy";
}
