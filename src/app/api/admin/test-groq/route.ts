/**
 * GET /api/admin/test-groq?secret=limiar_admin_2026
 * Tests Groq API connectivity and returns the actual error if failing.
 */
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rawKey = process.env.GROQ_API_KEY ?? "";
  // Strip BOM (charCode 65279) exactly as ai.ts does
  const apiKey = (rawKey.charCodeAt(0) === 65279 ? rawKey.slice(1) : rawKey).trim() || undefined;

  if (!apiKey) {
    return NextResponse.json({
      error: "GROQ_API_KEY not set",
      key_present: false,
      raw_length: rawKey.length,
      first_char_code: rawKey.charCodeAt(0),
    });
  }

  const keyPreview = `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`;
  const firstCharCode = rawKey.charCodeAt(0);

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: "Say OK." }],
        max_tokens: 10,
      }),
    });

    const body = await res.json();

    if (!res.ok) {
      return NextResponse.json({
        key_present: true,
        key_preview: keyPreview,
        first_char_code: firstCharCode,
        bom_stripped: firstCharCode === 65279,
        groq_status: res.status,
        groq_error: body,
      });
    }

    return NextResponse.json({
      success: true,
      key_present: true,
      key_preview: keyPreview,
      first_char_code: firstCharCode,
      bom_stripped: firstCharCode === 65279,
      groq_status: res.status,
      groq_response: body?.choices?.[0]?.message?.content,
      model_used: body?.model,
    });
  } catch (err) {
    return NextResponse.json({
      key_present: true,
      key_preview: keyPreview,
      first_char_code: firstCharCode,
      bom_stripped: firstCharCode === 65279,
      fetch_error: err instanceof Error ? err.message : String(err),
    });
  }
}
