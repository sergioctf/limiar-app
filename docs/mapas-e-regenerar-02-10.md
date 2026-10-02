# O mapa que pedia chave, e o botão que não existia — 02/10/2026

## 1. "API KEY REQUIRED"

### O que era

O CARTO (`basemaps.cartocdn.com/dark_all`) **passou a exigir chave**. E exige da
pior forma possível para quem monitora: devolve

```
HTTP/1.1 200 OK
Content-Type: image/png
Content-Length: 2513
```

— um PNG de 256×256 perfeitamente válido, com os dizeres **"API KEY REQUIRED /
carto.com/basemaps/apikey"** escritos em cima. Todas as telhas do mundo passaram
a ter os mesmos 2.513 bytes.

### O erro da minha verificação de 01/10

Em 01/10 eu conferi quatro URLs do CARTO, vi `200` nas quatro e escrevi que as
telhas estavam no ar. **Estavam** — e nenhuma delas era um mapa. Eu também
abri o mapa numa página local, contei "2 telhas carregadas" e dei por
verificado, sem olhar o que estava dentro delas.

Duas regras que ficam disso:

- **Status não é conteúdo.** Para um recurso visual, a verificação é o pixel.
- Telhas de lugares diferentes **não podem** ter o mesmo tamanho. `z=12` no Rio
  e `z=5` do outro lado do mundo voltando ambos com 2.513 bytes era a resposta
  inteira, e estava na minha frente.

E uma consequência de projeto: o fallback que eu tinha acabado de escrever —
trocar de provedor no primeiro `tileerror` — **não serviria para nada**. Não
houve erro. O CDN respondeu com sucesso, cobrando.

### O que ficou

`src/lib/map-tiles.ts`, um lugar só para os dois mapas do app:

- **Fonte: `tile.openstreetmap.org`.** É a origem, não um revendedor; é
  gratuita; tem política de uso publicada (e o Limiar, com oito atletas, está
  muito abaixo do que ela chama de uso pesado); e quando bloqueia, bloqueia com
  erro HTTP de verdade — que o Leaflet reporta.
- **O tema do app decide a cor.** As telhas do OSM são claras, o que já serve o
  tema claro. No escuro elas são invertidas por filtro CSS
  (`invert(1) hue-rotate(180deg)` — sem o `hue-rotate`, a água fica laranja).
  O filtro fica no **painel de telhas**, não no mapa: inverter o mapa inteiro
  deixaria a rota laranja azul.
- **Falhar calado acabou.** Se as telhas não vierem, a tela diz "O mapa de fundo
  não carregou — o trajeto continua correto", em vez de um retângulo cinza.
- **`tests/map-tiles.test.ts`** guarda a decisão: a URL não pode ter `apikey`,
  `token`, `{s}` nem deixar de creditar o OSM. Teste nenhum vê pixel, mas este
  para a volta para um CDN com chave e manda ler o porquê.

Verificado no navegador, nos dois temas, com telhas reais de São Paulo: ruas
legíveis, nomes legíveis, rota laranja por cima.

---

## 2. O botão "Regenerar" que tinha sido removido

Um usuário tentou atualizar as semanas de treino em **Treinador → Meus dias de
treino → Minha semana** e não conseguiu.

A causa estava escrita na própria tela. O rodapé do card dizia:

> Use **Regenerar** no plano para aplicar

apontando para um botão que o redesenho do Treinador tinha removido. Quem
trocava os dias de corrida salvava a preferência e via o plano continuar igual,
sem nada para tocar.

A regeneração nunca deixou de existir — só perdeu a porta. A única entrada que
sobrou foi o aviso "Seu plano está desatualizado", que aparece **(a)** quando o
motor detecta a diferença e **(b)** se nenhum aviso mais urgente estiver
ocupando a faixa acima do plano, que só mostra o primeiro.

### O que ficou

Um botão no fim do card, usando a rota que já existia
(`POST /api/coach/weekly-plan/freshness`).

**E ele promete o que o motor cumpre.** `regenerationTarget` congela toda semana
que já começou — o que, para a semana de hoje, é sempre. Um botão escrito
"aplicar agora" seria uma promessa que o motor recusa, e é assim que alguém
acaba apertando dez vezes esperando a semana mudar (foi o que aconteceu em
20/09). Então ele diz:

> **Montar a próxima semana com estes dias**
> A semana em curso não é reescrita — você já se organizou em torno dela. Os
> dias novos valem a partir de segunda.

A exceção é quem ainda não tem plano nesta semana: aí não há o que tirar de
ninguém, e as duas são montadas. O resultado é dito de volta, com o número de
semanas que realmente mudaram.

---

## Verificação

- `npx tsc --noEmit` — limpo
- `npx vitest run` — **94 arquivos, 1.625 testes** (4 novos nas telhas)
- `npx next build` — compila, 94 páginas
- Mapa conferido **no navegador**, com screenshot, nos temas claro e escuro
