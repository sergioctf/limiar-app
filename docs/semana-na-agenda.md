# A semana cabendo na agenda

Aplicado em 18/09/2026 ("ponto 5"). Pedido, na análise que Sérgio aprovou:

> A adaptação atual resolve um treino. Eu ampliaria isso para a organização da semana: *"Esta semana só consigo treinar terça, quinta e sábado."* O treinador reorganizaria as sessões, explicaria o que priorizou e pediria confirmação. Com o tempo, poderia reconhecer padrões: *"Você costuma precisar encurtar o treino de quarta. Quer deixar esse dia mais leve no planejamento?"* A agenda deveria ser um dado do planejamento, e não aparecer apenas como justificativa depois de algo não acontecer.

Três partes, todas determinísticas.

## 1. "Minha agenda desta semana" — reorganizar a semana

No card do plano, no **Treinador**, abaixo das abas *Esta semana / Próxima*. Você marca os dias em que consegue correr, vê a proposta com a explicação e confirma. Nada muda antes do **Confirmar**, e **Desfazer** devolve a semana como estava.

`src/lib/week-fit.ts` não usa regra fixa: testa **todas** as formas de distribuir as sessões nos dias escolhidos (no máximo alguns milhares) e fica com a melhor, pontuando:

| O que conta | Peso |
|---|---|
| Manter o longão / o teste / o treino forte / a rodagem | 100 / 90 / 40 / 10 |
| Dois dias fortes seguidos | −50 (mais que o valor de um treino forte) |
| Longão fora do seu dia preferido, ou fora do último dia de corrida | −8 |
| Semana que não abre com leve, quando há rodagem | −5 (sua ordem **leve → tiro → longão**) |
| Cada dia que a sessão anda | −0,5 (mexer o mínimo) |

Consequências práticas:

- Faltando dias, **a rodagem sai primeiro**; o longão fica acima de tudo.
- Um tiro que só caberia **na véspera do longão sai** — dois dias fortes seguidos cobram mais do que rendem.
- **Não compensa** os km que saíram; a explicação diz o volume antes e depois.
- A sessão muda **inteira** (estrutura, etiqueta de qualidade, adaptação); a **musculação de cada dia fica onde estava**; a frase "Depois, musculação…" que falava de outro dia não viaja junto.
- Na semana em andamento, só hoje e os próximos dias; um dia já corrido não se move. Com troca de recuperação ativa, pede para desfazer a troca antes.
- Prova não se move e conta como dia forte.

O registro fica no próprio plano (`rearrangement`, com os dias originais) e a agenda em `week_availability`.

## 2. A agenda como dado do planejamento

Para uma semana **ainda não montada**, a agenda é guardada, e quando a semana for gerada (pelo botão ou pelo cron de segunda) ela já nasce nesses dias (`prefsForAgenda` dentro de `ensureWeeklyPlan`). O card mostra "Montada nos dias que você deu para esta semana". A impressão digital do plano continua usando os dias do seu perfil, para uma agenda de uma semana nunca fazer o plano parecer "desatualizado". **Desfazer** apaga a agenda da semana, para uma regeneração não trazê-la de volta.

**Migration 034** (`week_availability`: uma linha por semana, dias válidos garantidos no banco; ler, inserir, atualizar e apagar só a própria linha). **Aplicada em 18/09** pelo SQL Editor, com as quatro políticas conferidas.

## 3. O padrão: "você costuma precisar ajustar o treino de quarta"

`src/lib/day-patterns.ts` lê as últimas 8 semanas e marca o dia da semana cujo **treino forte ou longão** precisou de ajuste — encurtado, adaptado por tempo ou cansaço, trocado pela recuperação ou não feito — em **pelo menos 3 ocorrências e pelo menos metade delas**. Adaptar por falta de ladeira ou por preferência de formato **não conta**: isso não é o dia estar apertado.

Vira uma observação do **Conselheiro** (aplicar ou manter):

- Quando o plano consegue honrar sem quebrar leve → tiro → longão, oferece **"Deixar quarta mais leve"** — uma preferência nova, `lightDays`, que o montador passa a respeitar: o treino forte vai para outro dia de corrida que **não abre a semana e não fica na véspera do longão**.
- Quando **não** consegue, a observação vem **sem botão** e diz por quê. É o caso da semana do Sérgio: com corrida na segunda, quarta e sábado, tirar o tiro da quarta o colocaria na segunda, abrindo a semana com treino forte. Aí ela sugere trocar o dia de corrida em "Minha semana", ou usar "Minha agenda desta semana" e "Adaptar este treino" quando a quarta apertar.
- Para o **longão**, o dia leve não se aplica (o longão fecha a semana); a sugestão é escolher outro dia para ele.

A preferência só entra na impressão digital do plano **quando definida** — como foi feito com "excluir ladeira" —, para nenhum outro atleta ver "plano desatualizado" de repente.

## Verificação (18/09/2026)

- **Testes:** `tests/week-fit.test.ts` (13 — o exemplo terça/quinta/sábado, musculação preservada, sessão movida inteira, explicação, desfazer, falta de dias, tiro na véspera do longão, só um dia, semana em andamento, dia já corrido, troca ativa, agenda que já cabe, agenda como dado) e `tests/day-patterns.test.ts` (9 — padrão com 3 de 4, dois dias ruins não são padrão, adaptação por local não conta, dias futuros ignorados, sugestão com e sem botão, não repete, aplica e move o tiro, dia leve cede à ordem). Suíte: 74 arquivos, 1.391 testes, `tsc` limpo.
- **Produção, só prévias (nada gravado):**
  - Semana de 21/09, com terça, quinta e sábado: *"O longão (11 km) fica no sábado. O treino forte (Tiros curtos 6×200 m) vai para quinta. A rodagem leve de 9,5 km vai para terça."* Musculação de segunda, terça, quinta e sexta mantida; quarta vira descanso. Tela conferida com a proposta, *Voltar* e *Confirmar*. Depois de *Voltar*, o plano real continuou igual (sem `rearrangement`).
  - Semana atual com só domingo: *"O longão (9,5 km) fica no domingo."* — o longão já tinha sido movido para domingo pelo próprio Sérgio.
  - Semana fora do alcance: recusada com 400.
  - Conselheiro: nenhum dia com padrão ainda. O histórico não tem 3 ajustes no mesmo dia.

## Limites

- Só esta semana e a próxima.
- A reorganização não redistribui volume nem muda a estrutura das sessões — move sessões inteiras.
- O padrão depende de semanas com plano e do registro de adaptações e check-ins, que começaram em 16/09; deve aparecer, quando existir, a partir de algumas semanas de uso.
