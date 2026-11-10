import { useId } from "react";

export type RibbonState = "idle" | "active" | "listening" | "thinking" | "success";

/**
 * A fita cromada — o elemento de assinatura do Limiar.
 *
 * ## O que fazia ela parecer uma mancha roxa
 *
 * A primeira versão pintava as duas faces com gradientes cujas paradas eram
 * todas de valor médio: `#8a58e2`, `#605874`, `#1d172a`, `#78829d`. Tudo
 * roxo-acinzentado, tudo na mesma faixa de luminosidade. O olho não lê isso
 * como metal — lê como um borrão colorido, que foi exatamente o diagnóstico do
 * Sérgio sobre o redesign inteiro.
 *
 * ## O que faz metal parecer metal
 *
 * Cromo não tem cor própria: ele é **o ambiente refletido**. O que o
 * identifica não é o tom, é o **choque de valor** — a passagem abrupta de
 * quase-preto para branco estourado no espaço de poucos por cento do gradiente.
 * Um degradê suave de cinza parece plástico; a chicotada tonal parece metal.
 *
 * Por isso as paradas abaixo saltam: `#07060d` → `#f6f3ff` em 8% de distância,
 * depois despencam para `#17141f`, sobem de novo para branco puro. É feio
 * listado numa tabela e é o que faz a superfície parecer polida.
 *
 * O Master Prompt pedia exatamente isto: *"Não basta preencher um elemento com
 * cinza ou prata… reflexos especulares, áreas claras e escuras, sensação
 * tridimensional."*
 *
 * ## As três camadas
 *
 * 1. **Brilho** — uma forma borrada violeta atrás, que é a luz do ambiente.
 *    Sem ela a fita flutua recortada sobre o fundo.
 * 2. **Corpo** — duas faces dobradas, cada uma com o seu gradiente, em ângulos
 *    diferentes. É a dobra que dá volume; uma face só pareceria uma fita de
 *    papel.
 * 3. **Especular** — um traço branco estreito que percorre a aresta superior.
 *    É o único elemento animado: metal parado é metal morto.
 *
 * A prata base é `#C9D0E6`, do Master Prompt, mas ela aparece como *um* dos
 * tons — nunca como preenchimento.
 */
export function ChromeRibbon({ state = "idle", className = "" }: {
  state?: RibbonState;
  className?: string;
}) {
  const id = useId();
  return (
    <svg viewBox="0 0 400 154" fill="none" aria-hidden="true" focusable="false"
      data-state={state} className={`chrome-ribbon ${className}`}>
      <defs>
        {/*
          A face de cima. O gradiente corre na diagonal da luz, e as paradas
          saltam de valor: sombra, rebote violeta, estouro especular, prata,
          vale escuro, prata de novo, segundo estouro, borda violeta.
        */}
        <linearGradient id={`${id}-face`} x1="42" y1="138" x2="334" y2="19" gradientUnits="userSpaceOnUse">
          <stop offset="0"   stopColor="#07060d" />
          <stop offset=".07" stopColor="#6d4fae" />
          <stop offset=".15" stopColor="#f6f3ff" />
          <stop offset=".21" stopColor="#c9d0e6" />
          <stop offset=".30" stopColor="#2b2740" />
          <stop offset=".41" stopColor="#0b0a12" />
          <stop offset=".53" stopColor="#8d96b2" />
          <stop offset=".62" stopColor="#ffffff" />
          <stop offset=".68" stopColor="#c9d0e6" />
          <stop offset=".79" stopColor="#1d1830" />
          <stop offset=".90" stopColor="#b48aff" />
          <stop offset="1"   stopColor="#0a0912" />
        </linearGradient>

        {/* A face de baixo, mais na sombra e com mais ambiente roxo. */}
        <linearGradient id={`${id}-back`} x1="77" y1="31" x2="317" y2="119" gradientUnits="userSpaceOnUse">
          <stop offset="0"   stopColor="#0d0a16" />
          <stop offset=".13" stopColor="#4b3177" />
          <stop offset=".26" stopColor="#d8dcef" />
          <stop offset=".34" stopColor="#5d5873" />
          <stop offset=".47" stopColor="#100d1b" />
          <stop offset=".61" stopColor="#a9b2cc" />
          <stop offset=".70" stopColor="#f2effb" />
          <stop offset=".84" stopColor="#241b3a" />
          <stop offset="1"   stopColor="#8f63e8" />
        </linearGradient>

        {/* A luz do ambiente, que impede a fita de flutuar recortada. */}
        <radialGradient id={`${id}-glow`} cx=".52" cy=".5" r=".55">
          <stop offset="0"   stopColor="#8b5cf6" stopOpacity=".55" />
          <stop offset=".55" stopColor="#6d28d9" stopOpacity=".22" />
          <stop offset="1"   stopColor="#6d28d9" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}-soft`} x="-30%" y="-80%" width="160%" height="260%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
      </defs>

      <ellipse cx="205" cy="76" rx="150" ry="46" fill={`url(#${id}-glow)`} filter={`url(#${id}-soft)`} />

      <g className="chrome-ribbon-body">
        <path d="M10 123C86 148 120 24 213 26C292 29 314 100 392 25C345 124 297 94 227 58C139 13 88 173 10 123Z"
          fill={`url(#${id}-back)`} stroke="#8d7bc0" strokeOpacity=".45" strokeWidth=".75" />
        <path d="M12 122C104 123 116 64 173 64C232 64 236 122 288 101C327 85 354 35 394 21C365 47 344 108 293 124C234 143 224 81 176 80C120 78 74 147 12 122Z"
          fill={`url(#${id}-face)`} stroke="#efe7ff" strokeOpacity=".5" strokeWidth=".75" />
        {/* A aresta iluminada. O traço é curto e corre — ver `ribbon-sweep`. */}
        <path d="M12 122C104 123 116 64 173 64C232 64 236 122 288 101C327 85 354 35 394 21"
          pathLength="100" className="chrome-ribbon-light"
          stroke="#ffffff" strokeWidth="1.75" strokeLinecap="round" />
      </g>
    </svg>
  );
}
