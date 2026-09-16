/**
 * GET  /api/profile/identity → current identity, what's missing, handle ideas
 * PUT  /api/profile/identity → save first name, surname and @username
 *
 * The rules live in profile-identity.ts; this route owns the database — which
 * handles are already taken, and writing the result.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  splitFullName, fullNameOf, normalizeUsername, identityProblems,
  suggestUsernames, profileNeedsIdentity,
} from "@/lib/profile-identity";

/** Handles in use by everyone else — the caller's own never blocks them. */
async function takenUsernames(
  supabase: ReturnType<typeof createClient>, exceptUserId: string,
): Promise<string[]> {
  const { data } = await supabase.from("profiles").select("id, username").limit(1000);
  return (data ?? [])
    .filter(p => p.id !== exceptUserId && p.username)
    .map(p => p.username as string);
}

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("name, username").eq("id", user.id).maybeSingle();

  const { firstName, lastName } = splitFullName(profile?.name);
  const taken = await takenUsernames(supabase, user.id);

  return NextResponse.json({
    firstName,
    lastName,
    username: profile?.username ?? "",
    needsIdentity: profileNeedsIdentity(profile, user.email),
    problems: identityProblems({ firstName, lastName, username: profile?.username ?? "" }, { taken }),
    suggestions: profile?.username ? [] : suggestUsernames({ firstName, lastName }, taken),
  });
}

export async function PUT(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const identity = {
    firstName: String(body?.firstName ?? "").trim(),
    lastName:  String(body?.lastName ?? "").trim(),
    username:  normalizeUsername(body?.username),
  };

  const taken = await takenUsernames(supabase, user.id);
  const problems = identityProblems(identity, { taken });
  if (Object.keys(problems).length > 0) {
    return NextResponse.json({ error: "Dados incompletos", problems }, { status: 400 });
  }

  const { error } = await supabase
    .from("profiles")
    .update({ name: fullNameOf(identity), username: identity.username })
    .eq("id", user.id);

  if (error) {
    // A unique index on username is the real guard; the pre-check above only
    // makes the common case a friendly message instead of a database error.
    const conflict = /duplicate|unique/i.test(error.message);
    return NextResponse.json(
      conflict
        ? { error: "Dados incompletos", problems: { username: "Esse username já está em uso." } }
        : { error: "Não foi possível salvar." },
      { status: conflict ? 400 : 500 },
    );
  }

  return NextResponse.json({ ok: true, name: fullNameOf(identity), username: identity.username });
}
