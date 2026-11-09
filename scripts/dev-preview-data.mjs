// All examples are invented. Relative dates keep the week and recent history populated.
const id = n => `d3a10000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const athleteId = id(1);
export const newcomerId = id(2);
const friendId = id(3);
const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const labels = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const offset = (date, amount) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0, 10);
};
function spDate(now) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function previewData(now = new Date()) {
  const today = spDate(now);
  const dayOfWeek = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const monday = offset(today, -dayOfWeek);
  const created = now.toISOString();
  const profile = (user, name, username, scenario, sports, complete) => ({
    id: user, name, username, email: `${scenario}@limiar.example`,
    sports, onboarding_completed_at: complete ? created : null,
    training_prefs: complete ? { runDays: ["Mon", "Thu", "Sat"], runDaysConfirmed: true } : null,
    created_at: created, height_cm: 171,
    birth_date: "1994-05-11", sex: "female", wellness_token: null,
  });
  const easy = {
    type: "easy", sport: "corrida", label: "Rodagem leve", distance_km: 6, pace: "6:15–6:40/km",
    description: "Ritmo de conversa, sem acelerar no fim.",
    structure: { blocks: [{ kind: "run", distance_km: 6, intensity: "E", pace: "6:15–6:40/km" }] },
  };
  const strength = {
    type: "strength", sport: "musculacao", label: "Força de base", duration_min: 35,
    description: "Movimento controlado, com duas repetições de reserva.",
    strength: {
      estimatedMinutes: 35, muscles: ["quadriceps", "core"], cardio: null, notes: [], deloaded: false,
      exercises: [{ exerciseId: "agachamento_livre", name: "Agachamento livre", sets: 3, reps: [8, 10],
        rir: 2, restSeconds: 90, main: true, unilateral: false, cue: "Desça com controle.", timeBased: false }],
    },
  };
  const rest = { type: "rest", label: "Descanso", description: "Dia livre para recuperar." };
  const tempo = { ...easy, type: "tempo", label: "Ritmo sustentado", distance_km: 8, pace: "5:45–6:00/km",
    structure: { blocks: [{ kind: "warmup", distance_km: 2, intensity: "E" },
      { kind: "run", distance_km: 4, intensity: "T", pace: "5:45–6:00/km" },
      { kind: "cooldown", distance_km: 2, intensity: "E" }] } };
  const long = { ...easy, type: "long_run", label: "Longão confortável", distance_km: 10,
    structure: { blocks: [{ kind: "run", distance_km: 10, intensity: "E", pace: "6:15–6:40/km" }] } };
  const shape = [easy, strength, rest, tempo, rest, long, strength];
  function report(delta, index) {
    const week = offset(monday, delta);
    const plan = {
      week_start: week, generated_at: `${offset(week, -1)}T16:00:00Z`, phase: "base",
      ai_message: "Semana de base: manter as rodagens confortáveis e repetir o ritmo com consistência.",
      days: days.map((day, i) => ({ day, dayPt: labels[i], ...(delta === 0 && i === dayOfWeek ? easy : shape[i]) })),
    };
    return { id: id(20 + index), user_id: athleteId, period_start: week, period_type: "week",
      created_at: plan.generated_at, full_report: JSON.stringify(plan) };
  }
  function run(user, n, ago, distance, pace, name) {
    const duration = Math.round(distance * pace);
    return {
      id: id(n), user_id: user, date: offset(today, -ago), type: "easy", distance_km: distance,
      duration_seconds: duration, moving_time_seconds: duration, elapsed_time_seconds: duration + 35,
      avg_pace_seconds_per_km: pace, avg_hr: 143 + n % 10, max_hr: 170, name, calories: Math.round(distance * 62),
      elevation_gain: 48, source: "manual", deleted_at: null, created_at: created,
    };
  }
  const recent = run(athleteId, 100, 1, 6.2, 379, "Rodagem no parque");
  const runs = [
    recent, run(athleteId, 101, 3, 9.6, 392, "Longão de domingo"),
    ...Array.from({ length: 10 }, (_, i) => run(athleteId, 102 + i, 5 + i * 3, 5 + i % 4, 368 + i * 3, "Corrida ao ar livre")),
    run(friendId, 112, 1, 7.2, 345, "Volta pelo bairro"),
  ];
  const activities = [
    { id: id(200), user_id: athleteId, date: today, name: "Pedal ao ar livre", sport_type: "Ride",
      duration_seconds: 1920, distance_m: 12400, avg_hr: 131, calories: 240, source: "manual", deleted_at: null },
    { id: id(201), user_id: athleteId, date: offset(today, -2), name: "Força na academia", sport_type: "WeightTraining",
      duration_seconds: 2520, distance_m: null, calories: 148, source: "manual", deleted_at: null },
  ];
  return {
    profiles: [
      profile(athleteId, "Marina Costa", "marinacosta", "atleta", ["corrida", "musculacao", "ciclismo"], true),
      profile(newcomerId, null, null, "novo", [], false),
      profile(friendId, "Rafa Lima", "rafalima", "amigo", ["corrida"], true),
    ],
    runs, activities,
    coach_reports: [-7, 0, 7].map(report),
    performance_tests: [{ id: id(300), user_id: athleteId, test_date: offset(today, -22), distance_km: 3,
      time_seconds: 942, avg_hr: 172, max_hr: 188, created_at: created }],
    wellness_data: Array.from({ length: 35 }, (_, i) => ({
      id: id(400 + i), user_id: athleteId, date: offset(today, -i), source: "manual_import", created_at: created,
      sleep_seconds: 25500 + (i % 7) * 300, sleep_score: 77 + i % 8, hrv_ms: 45 + (i * 3) % 9,
      hrv_status: "balanced", resting_hr: 54 + i % 4, stress_avg: 28 + i % 12, body_battery: 74,
      active_kcal: 440 + i % 8 * 18, resting_kcal: 1560,
    })),
    body_measurements: [{ id: id(500), user_id: athleteId, date: offset(today, -3), weight_kg: 65.2, body_fat_pct: 23 }],
    friendships: [{ id: id(600), requester_id: athleteId, addressee_id: friendId, status: "accepted", created_at: created }],
    run_feedback: [{ run_id: recent.id, user_id: athleteId, status: "answered", effort: 3, rpe: 5,
      context: null, note: "Consegui manter o ritmo de conversa.", planned: easy, updated_at: created }],
    ai_messages: [
      { id: id(700), user_id: athleteId, date: today, role: "user", content: "Como chego à próxima rodagem?", created_at: `${today}T10:00:00Z` },
      { id: id(701), user_id: athleteId, date: today, role: "assistant",
        content: "Comece em ritmo de conversa. Se estiver confortável depois dos primeiros dez minutos, mantenha o ritmo até o fim.",
        created_at: `${today}T10:00:01Z` },
    ],
  };
}
