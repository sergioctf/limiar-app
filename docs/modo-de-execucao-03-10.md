# Modo de execução — o treino enquanto ele acontece (03/10/2026)

Item 3 da lista: *"abrir a sessão para **fazer**: séries grandes, marcar o que
completou, cronômetro de descanso. É o que falta para o app servir dentro da
academia, não só antes dela."*

## O buraco

O app tinha as duas pontas e nada no meio:

| Antes | Durante | Depois |
|---|---|---|
| `StrengthSessionView` — a lista do que fazer, em letra de 11 px | **nada** | `StrengthLogger` — uma tabela de inputs para preencher de memória |

Na prática: o atleta abria a lista de quatro exercícios, decorava, treinava
cinquenta minutos, e no fim tentava lembrar quanto tinha posto em cada série.
A progressão de carga do app é calculada exatamente a partir dessas linhas, ou
seja, o número menos confiável do sistema era o que alimentava o motor.

## O que foi feito

Uma tela nova, `src/components/coach/SessionRunner.tsx`, aberta por **"Começar
treino"** no card de musculação — e só no dia da sessão, porque o registro é
datado e oferecer isso na quinta para o treino de sábado é convidar o atleta a
gravar um treino que não aconteceu.

O que ela assume de quem a usa: **de pé, uma mão, a um braço de distância, umas
vinte vezes em cinquenta minutos.** Daí a forma:

- **Um exercício por vez, ocupando a tela.** A lista inteira é planejamento;
  entre duas séries ninguém precisa dela.
- **Só a série ativa fica aberta**, com carga e repetições em passos de polegar
  (±2,5 kg, ±1 rep) e o teclado ainda disponível. As feitas viram uma linha
  verde com o que foi levantado — que é o que se consulta para decidir a
  próxima. As futuras, uma linha só.
- **O descanso começa sozinho** ao marcar a série, com o tempo da própria
  prescrição. Ninguém aperta "iniciar descanso".
- **A última série do exercício não pede descanso** — pede o próximo exercício,
  e o app já vai para ele.
- **Carga sugerida pelo histórico**, vinda de `nextTarget`: ninguém redigita o
  que levantou na semana passada. Quando não há histórico, o campo fica em
  branco; o app não inventa número.

Ao terminar, grava pela **mesma rota de sempre** (`/api/strength/log`), com as
mesmas séries. A progressão não sabe por qual tela o atleta entrou, e não
deveria saber.

## Duas decisões que valem a explicação

**1. O descanso é um instante, não um contador.** Guardar "faltam 90 s" e
subtrair de um em um erra toda vez que a tela apaga — e a tela apaga em todo
descanso com o telefone no bolso. O que se guarda é *quando ele acaba*; o resto
é derivado do relógio. Ele também fica verde no zero em vez de sumir: quem
voltou do bolso depois de dois minutos precisa ver que o tempo passou, não um
espaço vazio.

**2. A sessão sobrevive ao app.** O telefone bloqueia, chega uma ligação, o
navegador descarta a aba. Perder três exercícios por isso faria o atleta não
confiar no modo nunca mais. O estado vai para o `localStorage` do dia e volta
de onde parou — **conferido com um recarregamento completo no meio do treino.**

Na volta, a prescrição de hoje é que manda: se um exercício foi trocado ou a
semana entrou em volume reduzido, o guardado só preenche o que ainda existe.

## Um bug encontrado durante a verificação

A primeira versão perdia séries. O `fetch` do histórico, ao responder,
**sobrescrevia o estado inteiro** — quem abrisse o modo e marcasse a primeira
série antes de a rede responder via a marcação sumir. No subsolo de uma
academia, essa é a situação normal, não a exceção.

A regra agora está em `reconcileLate`, com teste: **uma série marcada, ou com
carga digitada, é do atleta** e não é tocada pelo que chegou depois. O resto
aceita a sugestão.

(No caminho, consertei também um `setState` chamado dentro do *updater* de
outro `setState` — funcionava por sorte e é exatamente o tipo de coisa que para
de funcionar numa atualização do React.)

## Corrida não ganhou modo de execução

De propósito. Quem executa a corrida é o relógio, que já dá volta, ritmo e
alarme de tiro sem precisar do telefone na mão. O papel do app na corrida é
antes (o que fazer e em que ritmo) e depois (o check-in). Colocar um
cronômetro de tela aí seria uma segunda interface pior para algo que já
funciona.

## O que ficou no código

| Arquivo | O quê |
|---|---|
| `src/lib/session-runner.ts` | O estado da sessão em andamento: semear, progresso, próximo pendente, descanso, rascunho, reconciliação. Tudo puro. |
| `src/components/coach/SessionRunner.tsx` | A tela. Só desenha. |
| `src/components/coach/week/StrengthCard.tsx` | "Começar treino", no dia |
| `src/lib/week.ts` | `isoDateOfWeekDay` — a data inteira de um dia da semana, que é o que vai para o registro |

## Verificação

- `npx tsc --noEmit` — limpo
- `npx vitest run` — **95 arquivos, 1.662 testes** (37 novos: 34 em
  `session-runner`, 3 em `week`)
- `npx next build` — compila, 94 páginas
- **Conferido no navegador em 375 px**, tema escuro: sessão inteira marcada
  (10/10), avanço automático entre exercícios, descanso correndo com o tempo
  certo de cada exercício, recarregamento no meio voltando ao exercício 2 com
  4 séries guardadas, e nenhum erro no console.
