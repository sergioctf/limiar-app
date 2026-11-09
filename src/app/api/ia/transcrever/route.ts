import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, cleanupExpiredEntries } from "@/lib/admin-rate-limit";
import { AUDIO_TYPES, MAX_AUDIO_BYTES } from "@/lib/voice";

export const maxDuration = 25;

export async function POST(request: Request) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: "Entre novamente para transcrever." }, { status: 401 });

  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) return NextResponse.json({ error: "A transcrição está indisponível. Você pode escrever." }, { status: 503 });

  cleanupExpiredEntries();
  if (!checkRateLimit(`voice:${user.id}`, 5, 60_000).allowed) {
    return NextResponse.json({ error: "Aguarde um minuto para transcrever de novo." }, { status: 429 });
  }

  const size = Number(request.headers.get("content-length") ?? 0);
  if (size > MAX_AUDIO_BYTES + 8192) return NextResponse.json({ error: "A gravação ficou muito longa." }, { status: 413 });

  const input = await request.formData().catch(() => null);
  const audio = input?.get("audio");
  const type = audio instanceof File ? audio.type.split(";")[0] : "";
  const ext = Object.prototype.hasOwnProperty.call(AUDIO_TYPES, type) ? AUDIO_TYPES[type] : null;
  if (!(audio instanceof File) || !audio.size || audio.size > MAX_AUDIO_BYTES || !ext || input?.get("consent") !== "yes") {
    return NextResponse.json({ error: "Confira o áudio e tente novamente." }, { status: 400 });
  }

  const payload = new FormData();
  payload.set("file", audio, `gravacao.${ext}`);
  payload.set("model", "whisper-large-v3-turbo");
  payload.set("language", "pt");
  payload.set("response_format", "json");

  try {
    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: payload,
      signal: AbortSignal.timeout(18_000),
      cache: "no-store",
    });
    const data = response.ok ? await response.json() : null;
    const text = typeof data?.text === "string" ? data.text.trim() : "";
    if (text) return NextResponse.json({ text }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { /* The audio and provider response are never logged. */ }
  return NextResponse.json({ error: "Não consegui transcrever. Tente novamente ou escreva sua mensagem." }, { status: 502 });
}
