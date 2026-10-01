/**
 * Os números que decidem o menu, lidos uma vez por página.
 *
 * Contagens com `head: true` — o Postgres devolve só o total, sem linha
 * nenhuma —, todas em paralelo. É o preço de uma ida ao banco para o app parar
 * de oferecer seis portas vazias a quem acabou de entrar (ver
 * `nav-visibility.ts`).
 *
 * Falha em silêncio e, na dúvida, mostra: um erro de rede não pode esconder
 * metade do app de quem já usa.
 */
import { hasHealthDevice } from "@/lib/health-access";
import { EMPTY_NAV, type NavData } from "@/lib/nav-visibility";
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

async function countOf(query: PromiseLike<{ count: number | null }>): Promise<number> {
  try {
    const { count } = await query;
    return count ?? 0;
  } catch { return 0; }
}

export async function loadNavData(admin: Db, userId: string): Promise<NavData> {
  const [runs, activities, races, goals, friends, icu, whoop, measured, token] = await Promise.all([
    countOf(admin.from("runs").select("id", { count: "exact", head: true })
      .eq("user_id", userId).is("deleted_at", null)),
    countOf(admin.from("activities").select("id", { count: "exact", head: true })
      .eq("user_id", userId).is("deleted_at", null)),
    countOf(admin.from("races").select("id", { count: "exact", head: true }).eq("user_id", userId)),
    countOf(admin.from("goals").select("id", { count: "exact", head: true }).eq("user_id", userId)),
    // Qualquer vínculo social conta, aceito ou pendente, nos dois sentidos —
    // as colunas são `requester_id` e `addressee_id` (ver /api/friends/feed).
    countOf(admin.from("friendships").select("id", { count: "exact", head: true })
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)),
    countOf(admin.from("intervals_connections").select("user_id", { count: "exact", head: true })
      .eq("user_id", userId)),
    countOf(admin.from("whoop_connections").select("user_id", { count: "exact", head: true })
      .eq("user_id", userId)),
    countOf(admin.from("wellness_data").select("date", { count: "exact", head: true })
      .eq("user_id", userId).neq("source", "checkin")),
    (async () => {
      try {
        const { data } = await admin.from("profiles").select("wellness_token").eq("id", userId).maybeSingle();
        return (data?.wellness_token as string | null) ?? null;
      } catch { return null; }
    })(),
  ]);

  return {
    ...EMPTY_NAV,
    runs, activities, races, goals, friends,
    healthDevice: hasHealthDevice({
      intervals: icu > 0,
      whoop: whoop > 0,
      wellnessToken: token,
      measuredRows: measured,
    }),
  };
}
