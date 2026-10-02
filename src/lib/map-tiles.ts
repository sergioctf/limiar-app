import type * as Leaflet from "leaflet";

/**
 * De onde vêm as telhas do mapa — um lugar só, para os dois mapas do app.
 *
 * ## O que aconteceu (02/10/2026)
 *
 * As telhas vinham do CARTO (`basemaps.cartocdn.com/dark_all`), que **passou a
 * exigir chave**. E a forma como ele exige é o pior caso possível para quem
 * monitora: devolve **HTTP 200**, `Content-Type: image/png`, um PNG legítimo de
 * 256×256 — com os dizeres "API KEY REQUIRED" escritos em cima. Todas as telhas
 * do mundo passaram a ter os mesmos 2.513 bytes.
 *
 * Em 01/10 eu conferi quatro URLs do CARTO, vi `200` nas quatro e concluí que
 * as telhas estavam no ar. Estavam — e nenhuma delas era um mapa. **Status não
 * é conteúdo.** Qualquer verificação futura precisa olhar o pixel, ou pelo
 * menos reparar que telhas de lugares diferentes não podem ter o mesmo tamanho.
 *
 * ## Por que o OpenStreetMap, e não outro CDN escuro
 *
 * Um `tileerror` → troca de provedor não teria salvado nada: não houve erro. O
 * que protege contra esta classe de falha é não depender de um revendedor que
 * um dia resolve cobrar. `tile.openstreetmap.org` é a fonte, é gratuita, tem
 * política de uso publicada (e o Limiar, com oito atletas, está muito abaixo do
 * que ela chama de uso pesado) e, quando bloqueia, bloqueia com erro HTTP de
 * verdade — que o Leaflet reporta e a tela mostra.
 *
 * As telhas do OSM são claras, o que já serve o tema claro do app. No tema
 * escuro elas são invertidas por filtro CSS sobre o painel de telhas (a classe
 * `.map-tiles`, em `globals.css`). O traçado da corrida vive noutro painel e
 * não é afetado — é por isso que o filtro fica no painel, e não no mapa todo.
 */
export const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/**
 * Adiciona a camada base e avisa se ela não vier.
 *
 * `onFailure` é chamado uma vez só, no primeiro erro de telha, para a tela
 * poder dizer o que houve. Um mapa que falha calado vira um retângulo cinza —
 * que foi exatamente o que o atleta viu durante um mês.
 */
export function addBaseTiles(
  L: typeof Leaflet,
  map: Leaflet.Map,
  onFailure?: () => void,
): Leaflet.TileLayer {
  const layer = L.tileLayer(OSM_TILES, { attribution: OSM_ATTRIBUTION, maxZoom: 19 });
  if (onFailure) {
    let avisou = false;
    layer.on("tileerror", () => {
      if (avisou) return;
      avisou = true;
      onFailure();
    });
  }
  return layer.addTo(map);
}
