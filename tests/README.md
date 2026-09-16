# Testes dos motores

```bash
npm test
```

## Por que isto existe

Os motores de treino do Limiar são ~9.000 linhas de matemática de fisiologia
esportiva. Até aqui eles eram verificados por scripts descartáveis — escritos,
rodados, apagados. Todo bug sério encontrado nesta base foi achado assim:

| Bug | Como se manifestava |
|---|---|
| `.FIT` sem duração e sem alvos | Arquivo abria, importava, e o relógio não guiava nada |
| Pace de natação lido como por-km | Alvo de 7,4 m/s — três vezes o recorde mundial |
| Notificação da noite anunciava o dia errado | Cron às 01:00 UTC = 22:00 BRT do dia anterior |
| Deload que não deloadava | Menos séries por exercício liberava tempo, entravam mais exercícios |
| Volume semanal encolhendo sozinho | 30 km/semana viravam 14 km em seis semanas, com o app dizendo "+10%" |
| HIIT do Strava não classificado | `HighIntensityIntervalTraining` não batia com `"hiit"` |
| Tiro maior que o longão | Piso fixo de 5,5 km na sessão de qualidade, em semanas de 12 km |
| "Você saiu rápido demais" num fartlek | Comparar 1ª × 2ª metade lê alternância como desabamento |
| Ritmos `Infinity` | Teste com distância 0 passava sem validação e envenenava tudo |
| Gráfico de forma com 89 dias | Datas locais misturadas com `new Date("YYYY-MM-DD")` (UTC) |
| Forma que não fecha na conta | TSB calculado antes do arredondamento: 47,4 − 83,9 = −36,5, mostrava −36,6 |
| "Monte sua semana" marcado como feito | Salvar musculação gravava `training_prefs` inteiro, dias de corrida padrão junto |
| Musculação sumindo | Dia com corrida retornava cedo e descartava a sessão de força |
| Tela mostrando 5 dias de força, motor usando 4 | `training_prefs.strengthDays` e `strength_prefs.days` eram lojas independentes |
| Longão de 5 km para quem correu 21 | Volume olhava só 4 semanas; sem memória do que o atleta já fez |
| Plano de meia idêntico ao de 5 km | `raceKm` nunca entrava no cálculo de volume, só no rótulo |

Nenhum deles quebrava nada visivelmente. Todos passariam de novo sem estes
testes. É esse o ponto: o app não falha com erro, ele falha **prescrevendo a
coisa errada com aparência de certeza**.

## O que cada arquivo cobre

| Arquivo | Cobre |
|---|---|
| `performance.test.ts` | **VDOT contra a tabela do Daniels**, ritmos, zonas de Friel, previsões de Riegel — a raiz de todo número do app |
| `training-load.test.ts` | TSS, CTL/ATL/TSB, sequência de dias e o score de prontidão |
| `workout-builder.test.ts` | Alocação leve → tiro → longão, conservação de volume, gating de ritmo/FC antes do teste, tabela km a km |
| `plan-notify.test.ts` | Aritmética de fuso BRT nos 7 dias da semana, formato das notificações |
| `workout-fit.test.ts` | Codifica o `.FIT` e **decodifica de volta** para conferir duração e alvos |
| `strength.test.ts` | Seleção de exercícios, blocos de 4 semanas, deload real, progressão dupla |
| `workout-execution.test.ts` | Previsto × executado km a km, detecção de saída rápida, tiros que desandam, hábitos recorrentes |
| `advisor.test.ts` | Os achados do conselheiro e a pureza dos patches |
| `test-status.test.ts` | A trava do teste de 3 km e o que cada estado libera |
| `sports-cardio-macro.test.ts` | Taxonomia de esportes, calorias, travas do cardio, fases do macro-plano |

## Convenções

- **Um atleta só** (`fixtures.ts`): VDOT 43,7 / LTHR 165. Uma falha se lê como
  "isso quebrou para um corredor de 43 VDOT", não como "uns números mudaram".
- **Asserções sobre comportamento, não sobre números exatos.** `longão ≤ 45% da
  semana` sobrevive a um ajuste de arredondamento; `longão === 13.5` não.
- **Nada de mocks de banco.** Tudo aqui é função pura. O que precisa de Supabase
  mora nas rotas, e as rotas só orquestram.
- **Todo teste que nasceu de um bug real leva um comentário dizendo qual.**
  Daqui a um ano, isso é a diferença entre manter a asserção e apagá-la por
  parecer arbitrária.

## Fase 4 — o chat que mentia

O chat respondeu *"Atualizado o longão de sábado para 8 km"* e não mudou nada.
Duas causas somadas: a IA escrevia a confirmação sem devolver o plano, e o
`UPDATE` que não casa com linha nenhuma **não retorna erro**.

A correção inverteu o desenho: a IA só traduz a frase em edições estruturadas
(`set_distance`, `set_rest`, `swap_days`, `scale_week`), o motor aplica, e a
confirmação é escrita a partir do que realmente mudou. A rota confere que a
gravação atingiu uma linha antes de confirmar qualquer coisa.

## O bug de fuso do navegador

O cliente calculava a segunda-feira com os campos **locais** da data e depois
serializava com `toISOString()`, que converte para **UTC**:

```js
monday.setDate(now.getDate() - daysSinceMonday);   // local
return monday.toISOString().slice(0, 10);          // UTC ← aqui
```

A data intermediária mantém a hora atual, então **depois das 21:00 no Brasil o
UTC já é amanhã** e o resultado saía como segunda + 1 — uma terça. O servidor
rejeitava com "Semana inválida" e o plano parecia não ter sido gerado.

Não era problema de domingo: quebrava toda noite. O mesmo padrão estava em mais
nove lugares, incluindo a data padrão do registro de musculação e do teste de
3 km — treinos da noite eram salvos com a data do dia seguinte.

`src/lib/week.ts` serializa a partir dos campos locais e elimina a classe
inteira. A suíte roda com `TZ=America/Sao_Paulo` e varre as 24 horas dos 7 dias.

## O roster do dia de musculação

A academia não segue o plano: a máquina está ocupada, o movimento dói hoje,
outra coisa parecia melhor. Obrigar o atleta a registrar uma sessão que ele não
fez torna o registro inútil — e o registro é a base de toda a progressão de
carga.

Por isso `StrengthDayPlan.exercises` existe. Ao registrar o treino o atleta
edita a lista (adiciona, remove, muda séries) e o que ele salvar vira a
prescrição daquele dia a partir da semana seguinte. `buildStrengthSession`
honra essa lista quando ela existe; ausente significa "escolha por mim", que é
como todo dia começa.

O `avoid` continua tendo precedência sobre o roster, e o deload continua
valendo — o roster define *quais* exercícios, não *quanto*.

## O catálogo importado

`src/lib/exercise-catalog.ts` é gerado por `node scripts/import-exercises.mjs`
a partir do [free-exercise-db](https://github.com/yuhonas/free-exercise-db)
(domínio público): 240 exercícios com foto, sobre os 37 curados.

As duas listas são **assimétricas de propósito**. O motor escolhe só da lista
curada, onde cada entrada tem `runnerValue` e uma dica escrita para corredor. O
catálogo entra na busca — quando o atleta quer algo que o treinador não
prescreveu. Um exercício do catálogo tem músculo e equipamento corretos, mas
nenhum julgamento; por isso recebe `runnerValue: 1` e cue vazia em vez de uma
inventada. `availableExercises()` nunca devolve item do catálogo, e há teste
para isso — se essa fronteira cair, o atleta recebe "Rosca alternado inclinado"
no lugar de agachamento.

A base é em inglês. O script traduz por tabela de frases e **recompõe a ordem**:
inglês põe o núcleo no fim ("Barbell Incline Bench Press"), português no começo
("Supino inclinado com barra"). Substituição palavra a palavra produziria
"Com barra inclinado supino" — palavras portuguesas em ordem inglesa.

O que não traduz por completo **não é importado**. O resíduo é exato, não
estimado: a tradução fica atrás de sentinelas, então o que sobrar em aberto é
inglês que a tabela não cobriu. Das 675 entradas mapeáveis, 444 traduzem
inteiras e 240 passam pela cota por músculo. É por isso que nenhum nome sai
como "Bradford supino com halteres".
