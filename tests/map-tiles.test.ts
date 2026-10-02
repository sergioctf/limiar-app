import { describe, expect, it } from "vitest";
import { OSM_ATTRIBUTION, OSM_TILES } from "@/lib/map-tiles";

/*
  O mapa ficou um mês quebrado sem ninguém notar.

  O CARTO passou a exigir chave e, em vez de errar, passou a devolver HTTP 200
  com um PNG escrito "API KEY REQUIRED". Nenhum teste quebrou, nenhum log
  reclamou, e a verificação que eu fiz — conferir o status das telhas — passou
  com louvor enquanto o atleta via um retângulo cinza.

  Estes testes não conseguem ver pixel. O que eles guardam é a decisão: a fonte
  é o OpenStreetMap, sem chave e sem revendedor no meio. Se alguém trocar por um
  CDN com `apikey` na URL, isso aqui para a troca e manda ler o porquê.
*/
describe("telhas do mapa", () => {
  it("vêm do OpenStreetMap, sem intermediário", () => {
    expect(OSM_TILES).toContain("tile.openstreetmap.org");
  });

  it("não dependem de chave, token ou conta", () => {
    expect(OSM_TILES).not.toMatch(/apikey|api_key|access[-_]?token|\{key\}|\{token\}/i);
  });

  it("não usam subdomínios rotativos, que nenhum provedor atual aceita", () => {
    expect(OSM_TILES).not.toContain("{s}");
  });

  it("creditam o OpenStreetMap, que é condição de uso", () => {
    expect(OSM_ATTRIBUTION).toContain("OpenStreetMap");
    expect(OSM_ATTRIBUTION).toContain("openstreetmap.org/copyright");
  });
});
