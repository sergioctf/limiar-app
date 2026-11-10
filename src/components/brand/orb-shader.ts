/**
 * A esfera da Limi IA, em metal líquido.
 *
 * ## Por que um shader, e não um desenho
 *
 * A versão em SVG era um desenho parado: cinco recortes com gradiente. Por
 * melhor que fossem os gradientes, continuava sendo papel recortado — não
 * abria, não fechava, não respondia à luz. "Ficou péssima" (Sérgio, 09/11), e
 * ele tem razão.
 *
 * As opções reais eram três:
 *
 *   1. **three.js** — 3D de verdade, cromo por mapa de ambiente, fácil de
 *      autorar. Custa ~160 KB comprimidos num PWA de 13 dependências que roda
 *      no celular. Dependência grande para um objeto.
 *   2. **Shader cru** — este arquivo. Zero dependência, ~6 KB, 60 fps, e o
 *      cromo sai do mesmo lugar de onde sai na vida real: o reflexo do
 *      ambiente na superfície.
 *   3. **Vídeo pré-renderizado** — fidelidade perfeita, mas um objeto morto:
 *      não reage a estado, e pesa em bytes.
 *
 * ## Como ele é líquido
 *
 * A esfera não é uma malha com partes: é um **campo de distância**. Um núcleo
 * e seis gotas em volta, combinados por `smin` — um mínimo suave. É o `smin`
 * que faz a mágica: quando as gotas se afastam, a superfície não se parte,
 * ela **estica**, formando pontes antes de romper. É assim que mercúrio se
 * comporta, e é o que dá a sensação de abrir e fechar sem nenhuma peça
 * articulada.
 *
 * `uOpen` afasta as gotas; `uEnergy` acelera a respiração. Ouvir, pensar e
 * responder são três quantidades diferentes dessas duas coisas — não três
 * animações escritas à mão.
 *
 * ## De onde vem o cromo
 *
 * Metal é espelho. A cor de cada ponto é o **ambiente refletido** na direção
 * em que a superfície aponta. Então existe um ambiente procedural aqui dentro:
 * um estúdio escuro, uma faixa de luz branca no alto (a softbox, que é o que
 * desenha aquele risco branco no metal), e dois refletores violeta nas
 * laterais. Mudar a superfície muda o reflexo sozinho — nenhum gradiente é
 * desenhado à mão.
 */

export const ORB_VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const ORB_FRAGMENT = `
precision highp float;

uniform vec2  uRes;
uniform float uTime;
/** 0 = fechada, 1 = pétalas afastadas. */
uniform float uOpen;
/** Quanto ela respira e pulsa. */
uniform float uEnergy;

const float PI = 3.14159265;

/* Mínimo suave: é ele que faz a superfície esticar em vez de partir. */
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

/* O campo: um núcleo e seis gotas que orbitam e respiram. */
float map(vec3 p) {
  p.xz *= rot(uTime * 0.18);
  p.xy *= rot(sin(uTime * 0.13) * 0.22);

  float d = length(p) - 0.44;

  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float ang = fi * (PI / 3.0);
    float t = uTime * (0.45 + 0.08 * uEnergy) + fi * 1.9;
    float lat = sin(t * 0.7) * 0.5;

    /* A distância ao centro é o que abre e fecha. A ponte de metal entre
       duas gotas aparece sozinha, por causa do smin. */
    float reach = 0.54 + uOpen * 0.34 + 0.05 * sin(t * 1.6) * (0.4 + uEnergy);
    vec3 c = vec3(cos(ang) * cos(lat), sin(lat), sin(ang) * cos(lat)) * reach;

    float r = 0.26 + 0.035 * sin(t * 1.2 + fi);
    /* k baixo: as gotas continuam gotas e só esticam perto do encontro.
       Com k alto tudo virava um seixo liso, sem pétala nenhuma. */
    d = smin(d, length(p - c) - r, 0.085);
  }
  return d;
}

vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.0015, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)
  ));
}

/* O estúdio que a superfície reflete. É daqui que vem o cromado. */
vec3 env(vec3 r) {
  /* Chao quase preto, teto prata. O salto entre os dois e o que o metal
     mostra como "linha do horizonte" — a marca registrada do cromo. */
  vec3 c = mix(vec3(0.004, 0.004, 0.012), vec3(0.62, 0.65, 0.80),
               smoothstep(-0.08, 0.14, r.y));

  /* Softbox: a faixa branca que risca o metal. */
  float band = pow(max(0.0, 1.0 - abs(r.y - 0.46) * 7.0), 2.5);
  c += vec3(1.0, 0.99, 1.0) * band * 2.6;

  /* Uma segunda faixa, mais baixa e fraca, para o metal ter duas leituras. */
  c += vec3(0.8, 0.82, 0.95) * pow(max(0.0, 1.0 - abs(r.y + 0.3) * 7.0), 4.0) * 0.5;

  /* Refletores violeta: o ambiente do app entrando no metal. */
  c += vec3(0.62, 0.30, 1.0) * pow(max(0.0, dot(r, normalize(vec3(-0.75, 0.15, 0.5)))), 5.0) * 1.5;
  c += vec3(0.80, 0.52, 1.0) * pow(max(0.0, dot(r, normalize(vec3(0.70, -0.35, 0.45)))), 9.0) * 1.1;
  return c;
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / min(uRes.x, uRes.y);

  vec3 ro = vec3(0.0, 0.0, 2.6);
  vec3 rd = normalize(vec3(uv, -1.9));

  float t = 0.0;
  float hit = 0.0;
  for (int i = 0; i < 72; i++) {
    vec3 p = ro + rd * t;
    float d = map(p);
    if (d < 0.0012) { hit = 1.0; break; }
    t += d * 0.85;
    if (t > 5.0) break;
  }

  /* O núcleo: luz que escapa por onde o metal não cobre. */
  float core = 0.0;
  {
    float b = dot(-ro, rd);
    float h = length(ro + rd * b);
    core = pow(max(0.0, 1.0 - h / 0.72), 2.6);
  }

  vec3 col = vec3(0.0);
  float alpha = 0.0;

  if (hit > 0.5) {
    vec3 p = ro + rd * t;
    vec3 n = normalAt(p);
    vec3 refl = reflect(rd, n);

    vec3 metal = env(refl);

    /* Fresnel: a borda de qualquer superfície reflete mais que o meio. */
    float fres = pow(1.0 - max(0.0, dot(-rd, n)), 3.4);
    metal += env(normalize(mix(refl, n, 0.35))) * fres * 0.8;

    /* O brilho do núcleo atravessando a casca nas partes finas. */
    metal += vec3(0.5, 0.22, 0.9) * core * 0.3;

    /* Especular duro: o ponto de luz que define "polido". */
    vec3 L = normalize(vec3(-0.5, 0.75, 0.45));
    metal += vec3(1.0) * pow(max(0.0, dot(refl, L)), 48.0) * 1.6;

    col = metal;
    alpha = 1.0;
  }

  /* O que não é metal é a luz do núcleo e o halo. */
  vec3 glow = vec3(0.58, 0.25, 0.98) * core * 1.15
            + vec3(0.78, 0.55, 1.0) * pow(core, 5.0) * 1.4;
  col += glow * (1.0 - alpha * 0.55);
  alpha = max(alpha, clamp(core * 1.25, 0.0, 1.0));

  /* Tom e gama, para o branco não chapar. */
  /* Tonemap brando: com o anterior (0.82) o branco especular virava cinza
     e a esfera ficava com cara de pedra-sabao. */
  col = col / (col + vec3(1.45));
  col *= 1.55;
  col = pow(col, vec3(0.4545));

  gl_FragColor = vec4(col, alpha);
}
`;
