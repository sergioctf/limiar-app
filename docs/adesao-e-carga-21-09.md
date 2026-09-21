# Adesão e carga — três números que mentiam (21/09/2026)

Dívidas **A11** e **A12** do HANDOFF, mais o item "o alerta de sobrecarga conta só corrida". Ficaram urgentes quando a IA central passou a citar esses números em voz alta: um card errado é um card; uma IA que repete o card errado soa como uma segunda opinião.

Teste primeiro, correção depois — os três bugs foram reproduzidos em teste antes de qualquer linha de conserto.

## A11 — "esta semana" era a semana que vem

`computeAdherenceHistory` ordenava os planos por data e chamava o mais recente de atual. Como o plano da próxima semana é gerado no domingo, a partir daí o card mostrava **sete dias "a fazer"**, adesão nula, e o topo da página falando de outra semana.

**Correção:** semanas que ainda não começaram ficam de fora. Não existe aderir a um plano que não começou.

**Nos dados reais do Sérgio (21/09):** o plano de 21/09 já estava no banco. Antes, o card abriria nele; agora abre em 14/09, com 83%.

## A12 — a musculação de hoje já nascia perdida

A regra "o dia de hoje ainda não acabou" existia só no ramo da corrida. Uma quinta de academia aparecia **"Perdido" às oito da manhã** — com o treino marcado para as oito da noite. Derrubava a adesão da semana corrente todo dia.

**Correção:** a regra passou a valer para qualquer esporte, aplicada depois da decisão de status.

## O alerta de sobrecarga era cego para metade do treino

Saúde e a recuperação do dia somam musculação, pedal e natação na carga desde 16/09 (`activityTSS`). O alerta de sobrecarga, não — ele chamava `computeTrainingLoad` sem as atividades. O mesmo app mostrava **dois TSB para o mesmo dia**, e o aviso que existe justamente para quem está fazendo demais ignorava metade do que essa pessoa faz.

**Correção:** `detectOvertraining` recebe as atividades e as repassa à carga. Os dois carregadores (Home e dossiê da IA) passaram a buscar 180 dias de atividades — a mesma janela das corridas, porque sem o histórico a carga crônica começa do zero e uma rotina antiga de academia aparece como pico novo.

**Nos dados reais:** o ACWR caiu de **1,31 para 1,18**. O limiar de alerta é 1,30 — ou seja, a Home vinha mostrando "Carga subindo rápido" para uma carga que não estava subindo. O sinal sumiu porque era falso.

**Dias sem descanso** também passou a contar qualquer treino. Quem corre num dia e puxa ferro no outro está há duas semanas sem folga, e um sinal que fala de descanso não via nenhum desses dias.

## O terceiro bug, que só apareceu ao comparar os dois

Depois de somar as atividades, o TSB do alerta (−5,1) e o de Saúde (−3,7) **continuavam diferentes**. A causa não era o esporte: `loadRecoveryInputs` não selecionava `moving_time_seconds`.

`estimateTSS` mede a carga pelo **tempo em movimento** — de propósito, porque a FC média e o pace médio do Strava são calculados sobre ele. Sem a coluna, a função caía no tempo total e a carga de Saúde saía inflada por cada semáforo, misturando dois relógios no mesmo número.

**Correção:** uma coluna a mais na consulta. Os dois números viraram **−5,1**.

## O que os testes ensinaram

Um dos testes que escrevi falhou porque **eu** estava errado: eu esperava que somar academia sempre aumentasse a fadiga. Doze semanas da mesma carga extra sobem CTL e ATL juntos, e no equilíbrio o TSB não piora — sobrecarga é *mudança*, não volume. É exatamente o que CTL e ATL existem para separar. O teste ficou, dizendo a coisa certa: quem **começou** a puxar ferro agora aparece mais carregado; quem sempre fez, não.

## Arquivos

| Arquivo | O quê |
|---|---|
| `src/lib/plan-adherence.ts` | A11 (semana futura fora) e A12 (hoje é pendente em qualquer esporte) |
| `src/lib/overtraining.ts` | recebe as atividades; sequência conta qualquer treino |
| `src/lib/training-load.ts` | `computeTrainingStreak` |
| `src/lib/recovery-load.ts` | `moving_time_seconds` na consulta |
| `src/app/page.tsx`, `src/lib/ai-brief-load.ts` | 180 dias de atividades, passadas à carga |
| `tests/plan-adherence.test.ts`, `tests/overtraining-load.test.ts` | 9 testes novos |
