"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, X } from "lucide-react";
import { AUDIO_TYPES, MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS } from "@/lib/voice";

type VoiceState = "idle" | "permission" | "listening" | "ready" | "thinking";

export function VoiceInput({ onText, onState, disabled = false }: {
  onText: (text: string) => void;
  onState?: (state: VoiceState) => void;
  disabled?: boolean;
}) {
  const [state, setState] = useState<VoiceState>("idle");
  const [disclose, setDisclose] = useState(false);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const mic = useRef<MediaStream | null>(null);
  const upload = useRef<AbortController | null>(null);
  const time = useRef<ReturnType<typeof setInterval> | null>(null);
  const dropped = useRef(false);
  const mounted = useRef(false);
  const micRequest = useRef(0);
  const wave = useRef<HTMLSpanElement>(null);
  const visual = useRef<{ context: AudioContext; frame: number } | null>(null);
  const onStateRef = useRef(onState);
  useEffect(() => { onStateRef.current = onState; }, [onState]);
  useEffect(() => { onStateRef.current?.(state); }, [state]);

  function releaseMic() {
    if (time.current) clearInterval(time.current);
    time.current = null;
    mic.current?.getTracks().forEach(track => track.stop());
    mic.current = null;
    if (visual.current) {
      cancelAnimationFrame(visual.current.frame);
      void visual.current.context.close().catch(() => {});
      visual.current = null;
    }
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      micRequest.current++;
      dropped.current = true;
      if (recorder.current?.state === "recording") recorder.current.stop();
      releaseMic();
      upload.current?.abort();
      onStateRef.current?.("idle");
    };
  }, []);

  function animateLevel(stream: MediaStream) {
    if (typeof AudioContext === "undefined" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    try {
      const context = new AudioContext();
      const analyzer = context.createAnalyser();
      analyzer.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyzer);
      const samples = new Uint8Array(analyzer.fftSize);
      const measure = () => {
        if (!visual.current) return;
        analyzer.getByteTimeDomainData(samples);
        const level = samples.reduce((peak, sample) => Math.max(peak, Math.abs(sample - 128)), 0);
        wave.current?.style.setProperty("--voice-level", String(.18 + Math.min(.82, level / 65)));
        visual.current.frame = requestAnimationFrame(measure);
      };
      visual.current = { context, frame: requestAnimationFrame(measure) };
      void context.resume().catch(() => {});
    } catch { /* Recording works even without amplitude visualization. */ }
  }

  async function start() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("O microfone não está disponível neste navegador. Você pode escrever.");
      return;
    }
    const mimeType = Object.keys(AUDIO_TYPES).find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) { setError("A gravação não é compatível com este navegador."); return; }
    setState("permission");
    const request = ++micRequest.current;
    dropped.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current || request !== micRequest.current) { stream.getTracks().forEach(track => track.stop()); return; }
      mic.current = stream;
      const recording = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64_000 });
      recorder.current = recording;
      const chunks: BlobPart[] = [];
      recording.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recording.onstop = () => {
        if (request !== micRequest.current) return;
        releaseMic();
        if (!mounted.current || dropped.current) return;
        const blob = new Blob(chunks, { type: recording.mimeType || mimeType });
        if (!blob.size || blob.size > MAX_AUDIO_BYTES) {
          setError("O áudio ficou vazio ou muito longo. Grave novamente.");
          setState("idle");
          return;
        }
        setAudio(blob);
        setState("ready");
      };
      recording.onerror = () => {
        if (request !== micRequest.current) return;
        dropped.current = true;
        releaseMic();
        setError("Não consegui gravar. Você pode escrever.");
        setState("idle");
      };
      recording.start();
      animateLevel(stream);
      setElapsed(0);
      setState("listening");
      const startedAt = Date.now();
      time.current = setInterval(() => {
        const seconds = Math.floor((Date.now() - startedAt) / 1000);
        setElapsed(seconds);
        if (seconds >= MAX_AUDIO_SECONDS && recording.state === "recording") recording.stop();
      }, 250);
    } catch {
      if (request !== micRequest.current) return;
      releaseMic();
      if (mounted.current && !dropped.current) {
        setError("Confira a permissão do microfone ou continue por texto.");
        setState("idle");
      }
    }
  }

  function cancel() {
    micRequest.current++;
    dropped.current = true;
    if (recorder.current?.state === "recording") recorder.current.stop();
    releaseMic();
    upload.current?.abort();
    setAudio(null);
    setError("");
    setState("idle");
    setDisclose(false);
  }

  async function transcribe() {
    if (!audio || state !== "ready") return;
    const controller = new AbortController();
    upload.current = controller;
    setState("thinking");
    setError("");
    try {
      const data = new FormData();
      data.set("audio", audio, "gravacao");
      data.set("consent", "yes");
      const response = await fetch("/api/ia/transcrever", { method: "POST", body: data, signal: controller.signal });
      const result = await response.json().catch(() => null);
      if (!response.ok || typeof result?.text !== "string") throw new Error(result?.error ?? "Não consegui transcrever.");
      if (controller.signal.aborted) return;
      onText(result.text);
      cancel();
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : "Falha ao transcrever.");
        setState("ready");
      }
    }
  }

  if (!disclose) {
    return <button type="button" className="btn-ghost shrink-0" onClick={() => setDisclose(true)} disabled={disabled} aria-label="Ditado por voz"><Mic className="h-4 w-4" aria-hidden /></button>;
  }

  return (
    <div className="space-y-2 rounded-xl border border-surface-700 bg-surface-900/60 p-3">
      {state === "idle" && <p className="text-xs text-surface-400">Ao tocar em Transcrever, o áudio será enviado à Groq. Revise o texto antes de salvar ou enviar. O Limiar não guarda a gravação.</p>}
      {state === "permission" && <p role="status" className="text-sm">Aguardando microfone…</p>}
      {state === "listening" && (
        <div className="flex items-center gap-3 text-sm font-medium">
          <span ref={wave} className="limiar-voice-wave" aria-hidden />
          Gravando <span className="tabular-nums">0:{String(elapsed).padStart(2, "0")}</span>
        </div>
      )}
      {state === "ready" && <p className="text-xs text-surface-400">Gravação pronta para transcrever.</p>}
      {state === "thinking" && <p role="status" className="text-sm">Transcrevendo…</p>}
      {error && <p role="alert" className="text-xs text-surface-200">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {state === "idle" && <button type="button" onClick={() => void start()} className="btn-primary"><Mic className="h-4 w-4" /> Gravar</button>}
        {state === "listening" && <button type="button" onClick={() => recorder.current?.stop()} className="btn-primary"><Square className="h-4 w-4" /> Finalizar</button>}
        {state === "ready" && <button type="button" onClick={() => void transcribe()} className="btn-primary">Transcrever</button>}
        <button type="button" onClick={cancel} className="btn-ghost"><X className="h-4 w-4" /> Cancelar</button>
      </div>
    </div>
  );
}
