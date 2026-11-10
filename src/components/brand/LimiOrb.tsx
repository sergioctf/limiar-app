import { useId } from "react";

export type OrbState = "idle" | "listening" | "thinking" | "speaking" | "success";

/**
 * A esfera da Limi IA.
 *
 * Pétalas de metal polido em volta de um núcleo que acende. O mesmo desenho
 * serve o botão flutuante e a tela da conversa — uma identidade, dois tamanhos.
 *
 * ## Por que as pétalas agora têm cada uma o seu gradiente
 *
 * Na primeira versão as cinco compartilhavam **um** gradiente, com o mesmo
 * ângulo. O resultado é uma colagem de recortes idênticos: nenhuma das faces
 * discorda das outras sobre onde está a luz, e sem discordância não há volume.
 * Uma esfera só parece esfera quando cada face devolve a luz de um jeito
 * diferente.
 *
 * Aqui cada pétala tem o seu eixo — da que encara a luz (quase branca na
 * aresta de cima) à que está de costas (quase preta, com só o rebote violeta
 * do ambiente). É a diferença entre elas que o olho lê como curvatura.
 *
 * E, como na fita, o que faz parecer metal é o **choque de valor**: cada
 * gradiente salta de `#0a0812` a `#ffffff` em poucos por cento. Degradê suave
 * pareceria plástico.
 */

/**
 * As cinco faces. `axis` é o eixo do gradiente de cada uma, em coordenadas do
 * próprio desenho — é ele que decide de onde a luz chega naquela pétala.
 */
const PLATES = [
  { path: "M30 77C35 47 61 23 91 21C120 18 142 28 148 41C125 32 105 34 85 48C67 59 47 79 30 77Z",
    shift: "-8px, -13px", axis: [28, 80, 150, 24], lit: 1 },
  { path: "M91 23C120 14 161 28 175 58C186 81 173 108 157 118C163 94 151 79 131 68C117 60 110 38 91 23Z",
    shift: "13px, -8px",  axis: [92, 22, 178, 118], lit: .85 },
  { path: "M175 73C191 98 177 143 155 158C139 170 117 175 96 170C117 161 130 146 135 128C139 113 156 102 175 73Z",
    shift: "13px, 10px",  axis: [178, 72, 96, 170], lit: .5 },
  { path: "M151 156C131 180 94 190 62 174C43 165 32 151 31 131C52 150 70 150 89 145C108 140 129 159 151 156Z",
    shift: "-5px, 15px",  axis: [150, 158, 32, 130], lit: .35 },
  { path: "M25 68C17 92 19 124 35 144C52 163 75 151 81 142C59 137 57 121 62 103C68 81 49 68 25 68Z",
    shift: "-14px, 4px",  axis: [24, 66, 82, 146], lit: .6 },
];

export function LimiOrb({ state = "idle", className = "", still = false }: {
  state?: OrbState;
  className?: string;
  still?: boolean;
}) {
  const id = useId();
  return (
    <svg viewBox="0 0 200 200" fill="none" aria-hidden="true" focusable="false"
      data-state={state} data-still={still || undefined} className={`limi-orb ${className}`}>
      <defs>
        {/*
          O núcleo é luz vazando de dentro, não uma bola roxa na frente.

          Ele cai para transparente antes da borda: o que se vê entre as
          pétalas é brilho, e o que se vê atrás delas é o corpo escuro da
          esfera. Com o núcleo opaco até o fim, a esfera virava um disco roxo
          com aparas de metal em volta.
        */}
        <radialGradient id={`${id}-core`} cx=".44" cy=".4" r=".55">
          <stop offset="0"   stopColor="#ffffff" />
          <stop offset=".1"  stopColor="#f0ddff" />
          <stop offset=".26" stopColor="#b47cf8" />
          <stop offset=".5"  stopColor="#6d28d9" stopOpacity=".75" />
          <stop offset=".76" stopColor="#2a1448" stopOpacity=".35" />
          <stop offset="1"   stopColor="#0a0714" stopOpacity="0" />
        </radialGradient>

        {/* O corpo da esfera, atrás de tudo: dá fundo às frestas. */}
        <radialGradient id={`${id}-body`} cx=".38" cy=".32" r=".72">
          <stop offset="0"   stopColor="#2a2340" />
          <stop offset=".55" stopColor="#120e1f" />
          <stop offset="1"   stopColor="#06050c" />
        </radialGradient>

        {/* Um gradiente por pétala, cada um no seu eixo. */}
        {PLATES.map((p, i) => (
          <linearGradient key={i} id={`${id}-p${i}`}
            x1={p.axis[0]} y1={p.axis[1]} x2={p.axis[2]} y2={p.axis[3]} gradientUnits="userSpaceOnUse">
            <stop offset="0"   stopColor="#0a0812" />
            <stop offset=".12" stopColor={p.lit > .6 ? "#8a6cc4" : "#3b2d5c"} />
            <stop offset=".26" stopColor={p.lit > .6 ? "#ffffff" : "#b9c0d6"} stopOpacity={.55 + p.lit * .45} />
            <stop offset=".36" stopColor="#c9d0e6" stopOpacity={.5 + p.lit * .5} />
            <stop offset=".52" stopColor="#1b1729" />
            <stop offset=".66" stopColor={p.lit > .45 ? "#9aa3bd" : "#4a4460"} />
            <stop offset=".78" stopColor={p.lit > .45 ? "#f4f2ff" : "#6f6a86"} stopOpacity={.4 + p.lit * .6} />
            <stop offset=".9"  stopColor="#1a1430" />
            <stop offset="1"   stopColor="#9b6cf0" stopOpacity=".8" />
          </linearGradient>
        ))}

        {/* Halo largo e fraco. Estreito e forte parecia adesivo recortado. */}
        <radialGradient id={`${id}-halo`} cx=".5" cy=".5" r=".5">
          <stop offset=".42" stopColor="#8b5cf6" stopOpacity="0" />
          <stop offset=".72" stopColor="#8b5cf6" stopOpacity=".16" />
          <stop offset=".88" stopColor="#a78bfa" stopOpacity=".2" />
          <stop offset="1"   stopColor="#8b5cf6" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* A luz que escapa por trás das pétalas. */}
      <circle cx="100" cy="100" r="99" fill={`url(#${id}-halo)`} />
      <circle cx="100" cy="100" r="88" fill={`url(#${id}-body)`} />
      <circle className="limi-orb-core" cx="100" cy="100" r="60" fill={`url(#${id}-core)`} />

      {/* A órbita: uma elipse fina que dá o eixo da esfera. */}
      <ellipse cx="100" cy="100" rx="71" ry="45" transform="rotate(-32 100 100)"
        stroke="#d0b1ff" strokeOpacity=".4" strokeWidth=".9" />

      <g className="limi-orb-shell">
        {PLATES.map((plate, index) => (
          <path key={plate.path} d={plate.path} className="limi-orb-plate"
            style={{ "--plate-shift": plate.shift, "--plate-delay": `${index * 36}ms` } as React.CSSProperties}
            fill={`url(#${id}-p${index})`}
            /* A aresta acesa é proporcional ao quanto a face encara a luz. */
            stroke="#ffffff" strokeOpacity={.25 + plate.lit * .55}
            strokeWidth="1.1" strokeLinejoin="round" />
        ))}
      </g>
    </svg>
  );
}
