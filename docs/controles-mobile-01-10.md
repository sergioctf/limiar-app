# O padrão de controles no celular — 01/10/2026

Item 7 da lista, vindo da revisão que o Sérgio trouxe:

> Os botões melhoraram, mas os fluxos ainda não seguem o padrão que combinamos.
> Por exemplo, Mover de dia: abre um bloco dentro do card, mostra sete botões
> estreitos, aplica a mudança ao tocar no dia, e o botão inicial ainda usa
> altura mínima de 38 px.

Estava certo em cada ponto — inclusive no mais grave, que ele não chamou de
grave: **mover aplicava no toque**, sem confirmação e sem dizer o que ia
acontecer.

## O painel, agora um só

`src/components/ui/Sheet.tsx` é o primitivo. Ele garante quatro coisas, que são
o contrato que a revisão pediu:

1. **Título com o escopo** — "Mover longão · De sábado, só nesta semana". Diz o
   que vai mudar, não só o verbo.
2. **Opções confortáveis** — linhas de 52 px, com rótulo e detalhe, em vez de
   sete quadradinhos de três letras numa grade. O alvo mínimo em qualquer botão
   do painel é 48 px.
3. **A consequência antes da confirmação** — "Longão sai de sábado e passa para
   terça. O volume da semana não muda."
4. **Confirmar e cancelar em posição previsível** — sempre no pé, cancelar à
   esquerda, confirmar à direita e maior. Erro e carregamento sempre no mesmo
   lugar, logo acima deles.

Fecha no toque fora, no X e no Esc; trava a rolagem do fundo; nasce de baixo no
celular e centraliza no computador; respeita a área segura do iPhone.

Converteram-se: **Mover de dia**, **Adaptar a musculação**, **Reorganizar a
semana** e **Marcar o teste**. (O adaptar da corrida já era uma folha de baixo
com fluxo próprio de múltiplos passos; fica para a próxima passada.)

## O que mudou em cada um

- **Mover de dia** — era um bloco dentro do card com sete botões estreitos que
  moviam no toque. Agora: sete linhas com o dia por extenso, o dia atual
  marcado como "é onde está hoje" e desabilitado, consequência escrita, e
  "Mover para terça" como confirmação.
- **Reorganizar a semana** — o "Confirmar" trocava de lugar conforme o passo
  (escolher dias → ver prévia → confirmar). Agora os botões ficam no pé do
  painel, e os dias viraram duas colunas de 48 px com o nome inteiro.
- **Adaptar a musculação** — era um painel inline com chips de minutos; virou
  opções com a diferença explicada ("Tenho 40 minutos · 12 min a menos que
  hoje") e a caixa de "deixar assim para sempre" com 48 px de alvo.
- **Marcar o teste** — já era uma folha, mas com campo de data nativo e chips.
  Virou lista de dias com "amanhã"/"daqui a 3 dias" ao lado.

## Os três ajustes menores

- **Alvos de 44 px** em todos os gatilhos (eram 38): Mover, Adaptar, Perguntar,
  no card de corrida e no de musculação.
- **O que é RIR, por toque.** Estava no atributo `title`, que não existe no
  celular — e a tela de musculação é usada de pé, entre duas séries. Agora é um
  botão com ícone de ajuda que abre a explicação no mesmo painel padrão.
- **O botão da IA sai da frente.** Ele cobria "Meus dias de sempre" e a conversa
  da semana no Treinador. Em vez de empurrá-lo para cima em cada tela — o que
  só move o problema —, ele some nos últimos 140 px de rolagem, que é onde as
  ações de rodapé moram, e volta ao subir.

## Conferido

`tsc` limpo, `next build` limpo, **1.614 testes**. Os três painéis percorridos
no celular (375 px): título, escopo, opções de 52 px, consequência e botões no
pé, nos três.
