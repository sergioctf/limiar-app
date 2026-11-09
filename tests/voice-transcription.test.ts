import { afterEach, describe, expect, it, vi } from "vitest";

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ auth: { getUser } }) }));
import { POST } from "@/app/api/ia/transcrever/route";

function request(consent: boolean) {
  const body = new FormData();
  body.set("audio", new Blob(["test audio"], { type: "audio/webm" }), "test.webm");
  if (consent) body.set("consent", "yes");
  return new Request("http://localhost/api/ia/transcrever", { method: "POST", body });
}

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("transcrição do Limiar", () => {
  it("exige sessão e consentimento explícito antes de chamar o provedor", async () => {
    const provider = vi.fn();
    vi.stubGlobal("fetch", provider);
    vi.stubEnv("GROQ_API_KEY", "fixture-key");
    getUser.mockResolvedValueOnce({ data: { user: null } }).mockResolvedValueOnce({ data: { user: { id: "a" } } });
    expect((await POST(request(true))).status).toBe(401);
    expect((await POST(request(false))).status).toBe(400);
    expect(provider).not.toHaveBeenCalled();
  });

  it("envia apenas o áudio autorizado e devolve texto para revisão", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "b" } } });
    vi.stubEnv("GROQ_API_KEY", "fixture-key");
    const provider = vi.fn(async (_url: string, input: RequestInit) => {
      const form = input.body as FormData;
      expect(form.get("language")).toBe("pt");
      expect(form.get("file")).toBeInstanceOf(File);
      expect(form.get("consent")).toBeNull();
      return Response.json({ text: "  Treino leve.  " });
    });
    vi.stubGlobal("fetch", provider);
    const result = await POST(request(true));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ text: "Treino leve." });
    expect(result.headers.get("cache-control")).toContain("no-store");
  });
});
