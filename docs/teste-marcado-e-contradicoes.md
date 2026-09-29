# Marcar o teste, e duas contradições — 29/09/2026

## 1. O aviso do teste parou de dar sermão

O estado "aging" (dois meses desde o último teste) explicava em três linhas por
que o condicionamento muda e como treinar abaixo do que se aguenta *"custa
evolução em silêncio"*. Quem já fez um teste sabe para que ele serve.

Ficou a data e o botão. O texto longo continua no estado `stale` (~4 meses), que
é quando o plano realmente está prescrevendo ritmo errado.

## 2. "Registrar" virou "Marcar"

O teste era a única coisa importante do app que não existia **antes** de
acontecer: o aviso dizia "seu teste tem 8 semanas" e oferecia *registrar* um
novo — um formulário para preencher depois de correr. Entre a intenção e a
corrida não havia nada, e é aí que a intenção morre.

Agora:

```
Marcar teste de 3 km  →  calendário  →  entra na semana no mesmo instante
```

**Como ele entra** (`src/lib/planned-test.ts`):

- **Não mexe na semana.** O motor não roda de novo, o volume não é recalculado,
  as outras sessões ficam onde estão. O teste é uma camada por cima do plano
  guardado — por isso aparece no instante em que é marcado, sem esperar nada.
- **Conta como quilômetro e ocupa o lugar da corrida do dia** — na prática, o
  treino de tiro. São 6 km: 2 de aquecimento, 3 no limite, 1 de volta à calma.
  Somar o teste ao tiro seria prescrever dois treinos de qualidade no mesmo dia.
- **A musculação do dia continua lá.** São duas sessões, não uma escolha.
- Num dia de descanso, ele simplesmente aparece.

**No dia marcado**, o check-in do treino abre com a pergunta
(`TestDayQuestion`):

> Você realizou o teste de 3 km hoje?
> **Fiz — registrar o tempo** · **Não fiz — remarcar**

"Fiz" leva ao formulário que recalibra ritmos, zonas e previsões. "Não fiz"
remarca para outro dia — em vez de deixar o teste morrer numa data que passou —
e o check-in segue normalmente, sobre o que foi feito de verdade.

No card do dia, o teste oferece **Remarcar teste** no lugar de "Mover de dia":
ele é uma marcação, não uma linha do plano, e mover chamaria o motor para mexer
numa corrida que já não está ali.

**Banco:** migration **037** (`planned_tests`), com índice único parcial — um
agendamento aberto por atleta, então "marcar de novo" é remarcar. RLS por dono
nas quatro operações. Aplicada em produção em 29/09.

## 3. O recado da semana envelhecia

O texto citava *"5,5 km na segunda"* com a corrida já na terça.

A trava que existia (`noteRespectsPlan`) só olhava **números**: 5,5 km estava no
plano, então passava. A regra nova (`noteMatchesDays`) olha a amarração entre
dia e distância — e é estreita de propósito: citar um dia sem número continua
valendo ("mantenha o domingo livre"), porque isso não é uma afirmação sobre a
sessão daquele dia.

A verificação roda na **leitura** do plano (`withCheckedNote`, em
`loadWeeklyPlan` e no primeiro render do Treinador), não na escrita. São seis
rotas que mexem no plano — mover, adaptar, reorganizar, trocar o treino de hoje,
o chat e as duas da musculação — e cada uma teria que lembrar de invalidar o
texto. Assim nenhuma precisa saber que o recado existe.

Quando o recado não passa, entra o do motor, que só diz o que o plano tem.

## 4. "Nenhum treino de força registrado" para quem treinou

A agenda reconhecia a musculação vinda do relógio; o Conselheiro olhava só
`strength_logs` (série, repetição, carga) e anunciava que nada tinha sido
registrado. Duas telas discordando sobre o mesmo atleta.

Agora o cálculo distingue **ir** de **anotar**:

| Situação | O que o Conselheiro diz |
|---|---|
| Foi à academia, não anotou séries | **Suas sessões de musculação estão registradas** — falta carga para a progressão |
| Não foi | Nenhum treino de força registrado |

A primeira caiu para severidade baixa: não é um problema de treino, é um dado
que falta.

## 5. Uma cor que nunca existiu

O teste aparece na agenda em rosa — e apareceu sem cor nenhuma. `bg-pink-500`
nunca entrou no CSS porque **`src/lib` não estava nos `content` do Tailwind**, e
é lá que mora `session-colors.ts`, o mapa de cores compartilhado entre a Hoje e
o Treinador. As outras cores funcionavam por coincidência: as mesmas classes
apareciam em algum componente.

Uma linha no `tailwind.config.ts` (`./src/lib/**/*.{js,ts}`), e qualquer classe
escrita numa lib volta a existir.

## 6. Um efeito que engolia a seleção

Com o teste marcado, tocar num dia da agenda não fazia nada: o efeito que
seleciona "hoje" depende do objeto do plano, e a camada do teste criava um
objeto novo a cada render. `useMemo` no plano sobreposto resolveu.

---

**Conferido:** `tsc` limpo, `next build` limpo, **1.594 testes** (20 novos:
`planned-test`, a trava de dia do recado e o teste do Conselheiro). Fluxo
conferido na tela: marcar → aparece na quarta no lugar do tiro → o resumo da
semana cai de 27 km para 24 km → o card oferece Remarcar.
