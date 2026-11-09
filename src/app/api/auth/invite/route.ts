import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIP } from "@/lib/admin-rate-limit";
import { createAdminClient, createClient } from "@/lib/supabase/server";

const inviteErrors: Record<string, string> = {
  invalid: "Código de convite inválido.",
  expired: "Este convite expirou.",
  exhausted: "Este convite já atingiu o limite de usos.",
};

export async function POST(request: NextRequest) {
  const { allowed } = checkRateLimit(`invite:${getClientIP(request)}`, 10, 15 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json({ error: "Muitas tentativas. Tente novamente mais tarde." }, { status: 429 });
  }
  const body = await request.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!code || code.length > 200 || !email || email.length > 254 || password.length < 6 || password.length > 1024) {
    return NextResponse.json({ error: "Confira o convite, o e-mail e a senha." }, { status: 400 });
  }

  const admin = createAdminClient();
  const check = () => admin.rpc("signup_invite_status", { invite_code: code });
  const { data: status, error: checkError } = await check();
  if (checkError) {
    return NextResponse.json({ error: "Cadastro indisponível agora. Tente novamente mais tarde." }, { status: 503 });
  }
  if (status !== "ok") {
    return NextResponse.json({ error: inviteErrors[status] ?? inviteErrors.invalid }, { status: 400 });
  }

  const { data, error } = await createClient().auth.signUp({
    email, password,
    options: {
      data: { signup_invite: code },
      emailRedirectTo: new URL("/auth/callback", request.nextUrl.origin).toString(),
    },
  });
  if (error) {
    const { data: current } = await check();
    return NextResponse.json({
      error: inviteErrors[current] ?? "Não foi possível criar a conta. Confira o e-mail e a senha ou tente entrar.",
    }, { status: 400 });
  }
  return NextResponse.json({ ok: true, signedIn: Boolean(data.session) });
}
