/**
 * GET /api/friends/suggestions
 *
 * Who the athlete might want to add, and why. The ranking lives in
 * friend-suggestions.ts; this route only gathers the data it needs.
 *
 * Reads the whole (small) user table on purpose: with the app at this size a
 * server-side filter would cost a round trip to save nothing. When it stops
 * being small this becomes a materialised view, not a bigger query.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { suggestFriends, shortfallNote, type Edge, type SuggestionCandidate } from "@/lib/friend-suggestions";
import { localMondayStr } from "@/lib/week";

const WANTED = 5;
/** Guardrail, not a product decision: stop reading if the table ever grows. */
const MAX_SCAN = 500;

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: profiles }, { data: rows }] = await Promise.all([
    supabase.from("profiles")
      .select("id, name, username, created_at, sports, training_prefs, birth_date")
      .limit(MAX_SCAN),
    supabase.from("friendships").select("requester_id, addressee_id, status"),
  ]);

  const edges: Edge[] = (rows ?? []).map(f => ({
    a: f.requester_id as string,
    b: f.addressee_id as string,
    accepted: f.status === "accepted",
  }));

  const mine = (profiles ?? []).find(p => p.id === user.id);
  const prefsOf = (p: { training_prefs?: unknown }) =>
    (p.training_prefs ?? {}) as { runDays?: string[] };

  const candidates: SuggestionCandidate[] = (profiles ?? [])
    .filter(p => p.id !== user.id)
    .map(p => ({
      id:        p.id as string,
      name:      (p.name as string) ?? null,
      username:  (p.username as string) ?? null,
      createdAt: (p.created_at as string) ?? null,
      sports:    (p.sports as string[]) ?? null,
      runDays:   prefsOf(p).runDays ?? null,
      birthDate: (p.birth_date as string) ?? null,
      // Weekly volume is deliberately absent: pulling every candidate's runs to
      // rank a list of five would be a query per user for a tiebreak. The other
      // signals decide it, and the reason shown stays true either way.
      weeklyKm:  null,
    }));

  const suggestions = suggestFriends(
    {
      id:        user.id,
      sports:    (mine?.sports as string[]) ?? null,
      runDays:   mine ? prefsOf(mine).runDays ?? null : null,
      birthDate: (mine?.birth_date as string) ?? null,
      weeklyKm:  null,
    },
    candidates,
    edges,
    { weekStart: localMondayStr(), limit: WANTED },
  );

  return NextResponse.json({
    suggestions,
    note: shortfallNote(suggestions.length, WANTED, candidates.length),
  });
}
