"use client";

import { useEffect, useRef } from "react";
import { ORB_FRAGMENT, ORB_VERTEX } from "./orb-shader";
import type { OrbState } from "./LimiOrb";

/**
 * O WebGL que desenha a esfera. A física está em `orb-shader.ts`.
 *
 * O que este arquivo garante é que ela seja uma boa cidadã do app:
 *
 * - **Pausa quando não está à vista.** Um `IntersectionObserver` corta o laço.
 *   O botão flutuante vive em todas as telas; deixá-lo girando atrás de uma
 *   folha aberta é gastar bateria para ninguém ver.
 * - **Pausa quando a aba perde o foco.**
 * - **Respeita `prefers-reduced-motion`**: desenha um quadro e para.
 * - **Devolve o SVG se não houver WebGL.** Ninguém fica sem esfera porque o
 *   aparelho é velho.
 * - **Limita a resolução a 2×** do tamanho real em tela. O canvas do botão tem
 *   44 px; renderizar 4K nele seria absurdo.
 * - **Não chama `loseContext()`.** Parece a coisa limpa a fazer na saída, e
 *   custou uma hora de investigação: `WEBGL_lose_context.loseContext()` perde
 *   o contexto **daquele canvas para sempre**, e o StrictMode do React monta,
 *   desmonta e monta de novo o mesmo elemento. Na segunda montagem,
 *   `getContext` devolvia o contexto já perdido — `isContextLost()` verdadeiro
 *   logo na criação, compilação falhando com log vazio, e a esfera caindo no
 *   desenho em SVG sem nenhuma pista do motivo. O canvas sai do DOM na
 *   desmontagem e o contexto é coletado sozinho; o que a limpeza precisa fazer
 *   é parar o laço e os observadores, e só.
 */

/** Quanto cada estado abre e energiza a esfera. */
const STATES: Record<OrbState, { open: number; energy: number }> = {
  idle:      { open: 0.06, energy: 0.25 },
  listening: { open: 0.72, energy: 1.0 },
  thinking:  { open: 0.34, energy: 0.8 },
  speaking:  { open: 0.52, energy: 0.9 },
  success:   { open: 0.2,  energy: 0.45 },
};

export function OrbCanvas({ state = "idle", still = false, className = "", onFail }: {
  state?: OrbState;
  still?: boolean;
  className?: string;
  /** Chamado uma vez se o WebGL não estiver disponível. */
  onFail?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /* O alvo vive num ref para a troca de estado não reiniciar o laço. */
  const target = useRef(STATES[state]);
  target.current = STATES[state] ?? STATES.idle;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let raf = 0;
    let rodando = false;
    let io: IntersectionObserver | null = null;
    let visibilidade: (() => void) | null = null;

    const gl = canvas.getContext("webgl", {
      alpha: true, antialias: false, premultipliedAlpha: false,
      powerPreference: "low-power",
    });

    /** Uma saída só, que sempre devolve o contexto. */
    function encerrar(falhou = false) {
      rodando = false;
      cancelAnimationFrame(raf);
      io?.disconnect();
      if (visibilidade) document.removeEventListener("visibilitychange", visibilidade);
      if (falhou) onFail?.();
    }

    if (!gl) { encerrar(true); return; }

    function compilar(tipo: number, src: string) {
      const sh = gl!.createShader(tipo);
      if (!sh) return null;
      gl!.shaderSource(sh, src);
      gl!.compileShader(sh);
      if (gl!.getShaderParameter(sh, gl!.COMPILE_STATUS)) return sh;
      // Log vazio com o contexto perdido não é erro de sintaxe — ver a nota
      // sobre `loseContext` no cabeçalho.
      console.error("[orb] shader:", gl!.getShaderInfoLog(sh) || "(sem log)",
        "| contexto perdido:", gl!.isContextLost());
      gl!.deleteShader(sh);
      return null;
    }

    const vs = compilar(gl.VERTEX_SHADER, ORB_VERTEX);
    const fs = vs ? compilar(gl.FRAGMENT_SHADER, ORB_FRAGMENT) : null;
    if (!vs || !fs) { encerrar(true); return () => encerrar(); }

    const prog = gl.createProgram();
    if (!prog) { encerrar(true); return () => encerrar(); }
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("[orb] link:", gl.getProgramInfoLog(prog) || "(sem log)");
      encerrar(true); return () => encerrar();
    }
    gl.useProgram(prog);

    // Um triângulo que cobre a tela; todo o desenho acontece no fragmento.
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "uRes");
    const uTime = gl.getUniformLocation(prog, "uTime");
    const uOpen = gl.getUniformLocation(prog, "uOpen");
    const uEnergy = gl.getUniformLocation(prog, "uEnergy");

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const quieto = still || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const inicio = performance.now();
    let open = target.current.open;
    let energy = target.current.energy;

    function dimensionar() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas!.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width * dpr));
      const h = Math.max(1, Math.round(r.height * dpr));
      if (canvas!.width !== w || canvas!.height !== h) {
        canvas!.width = w; canvas!.height = h;
        gl!.viewport(0, 0, w, h);
      }
    }

    function quadro(agora: number) {
      if (gl!.isContextLost()) { encerrar(true); return; }
      dimensionar();
      open += (target.current.open - open) * 0.06;
      energy += (target.current.energy - energy) * 0.06;
      gl!.uniform2f(uRes, canvas!.width, canvas!.height);
      gl!.uniform1f(uTime, quieto ? 4.2 : (agora - inicio) / 1000);
      gl!.uniform1f(uOpen, open);
      gl!.uniform1f(uEnergy, energy);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
      if (!quieto && rodando) raf = requestAnimationFrame(quadro);
    }

    if (quieto) {
      quadro(performance.now());
      return () => encerrar();
    }

    const tocar = () => { if (!rodando) { rodando = true; raf = requestAnimationFrame(quadro); } };
    const parar = () => { rodando = false; cancelAnimationFrame(raf); };

    io = new IntersectionObserver(([e]) => (e.isIntersecting ? tocar() : parar()), { threshold: 0 });
    io.observe(canvas);
    visibilidade = () => (document.hidden ? parar() : tocar());
    document.addEventListener("visibilitychange", visibilidade);

    return () => encerrar();
  }, [still, onFail]);

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}
