/**
 * O token de ingestão do Atalho do iPhone.
 *
 *   GET  /api/health/wellness-token                   → existe um? (nunca o valor)
 *   POST /api/health/wellness-token {regenerate:true} → gera, mostra uma vez
 *
 * O banco guarda o **hash**, não o token — o porquê está em
 * `src/lib/wellness-token.ts`. Daí a mudança de contrato: o GET não tem mais
 * como devolver o token, porque nem nós sabemos qual é. Quem perder, gera
 * outro, como em qualquer chave de API.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hashWellnessToken, newWellnessToken } from "@/lib/wellness-token";

const json = (value: unknown, status = 200) =>
  NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { data: profile } = await supabase
    .from("profiles").select("wellness_token").eq("id", user.id).maybeSingle();

  /*
    Antes isto criava um token na primeira visita e já o devolvia. Criar uma
    credencial só porque alguém abriu a tela é deixar uma chave na porta de
    quem nunca pediu — e agora, com o hash, ela nem poderia ser mostrada
    depois. O token nasce quando o atleta pede.
  */
  return json({ hasToken: Boolean(profile?.wellness_token) });
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const body = await request.json().catch(() => ({}));
  if (!body?.regenerate) return json({ error: "Nada a fazer" }, 400);

  const token = newWellnessToken();
  const { error } = await supabase
    .from("profiles")
    .update({ wellness_token: hashWellnessToken(token) })
    .eq("id", user.id);

  if (error) return json({ error: "Falha ao gerar token" }, 500);

  // A única vez que ele existe em claro deste lado.
  return json({ token, once: true });
}
