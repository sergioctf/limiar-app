# O fluxo do teste de 3 km, e sete ajustes — 01/10/2026

Nove itens apontados por Sérgio depois de usar o teste marcado por um dia. Sete
foram resolvidos, dois não se reproduziram e um ficou no radar.

O objetivo, nas palavras dele:

> Marcar o teste → aparecer claramente na agenda → no dia, ter um botão fácil
> para registrar → reconhecer automaticamente a corrida realizada → concluir a
> calibração → mostrar tudo que foi atualizado, sem considerar a atividade como
> fora do plano e sem pedir o feedback normal de treino.

---

## 1. Registrar o teste ficou tão fácil quanto marcar

**O que estava errado.** Marcar era um toque, em qualquer lugar. Registrar era
três: ir ao Treinador → Calibração → rolar até o fim da página → "Novo teste".
E o app *continuava oferecendo "marcar teste"* no dia do teste, como se nada
tivesse sido marcado.

**O que mudou.** Nasceu um componente só —
[TestAction.tsx](src/components/coach/TestAction.tsx) — que sabe em que ponto do
ciclo o atleta está e mostra **uma** ação:

| Estado | O que aparece |
| --- | --- |
| Nada marcado | **Marcar teste de 3 km** (abre o calendário ali mesmo) |
| Marcado para hoje | **Registrar teste de 3 km** |
| Marcado para outro dia | a data + **Remarcar** |
| Já registrado | **Marcar** — o próximo passo do teste é o próximo teste |

A última linha não convida a repetir um teste feito ontem: quem exibe a ação é
o aviso de teste vencendo, que só aparece quando o último teste envelhece.

Ele não renderiza nada até saber o estado — meio segundo de silêncio é melhor
que um botão que troca de função na frente do atleta.

Os três lugares que ofereciam a ação passaram a usar o mesmo componente:
[StaleTestWarning.tsx](src/components/coach/StaleTestWarning.tsx),
[TestCalibrationCard.tsx](src/components/dashboard/TestCalibrationCard.tsx) e o
card do dia na agenda ([RunCard.tsx](src/components/coach/week/RunCard.tsx)).

"Registrar" leva para `/coach/calibracao?registrar=1`, e
[CalibrationContent.tsx](src/components/coach/CalibrationContent.tsx) abre o
formulário sozinho ao ler esse parâmetro (e o apaga da URL em seguida). Quem
acabou de correr 3 km no limite não veio ler sobre VDOT — veio digitar o tempo.

## 2. O teste continua na agenda depois de executado

`applyPlannedTest` descartava qualquer teste cujo status não fosse `scheduled`.
No instante em que o tempo era registrado, o status virava `done` e o teste
**desaparecia da semana** — a sessão mais importante do mês saía do histórico no
segundo em que foi cumprida.

```ts
// src/lib/planned-test.ts
if (!test || (test.status !== "scheduled" && test.status !== "done")) return plan;
```

Com `done`, a sessão carrega `testDone: true`, e o card do dia troca as ações por
**"Ver o que o teste recalibrou"**.

## 3. A corrida do teste não é mais "fora do plano"

O overlay do teste existia apenas em `CoachContent` (estado do React). Toda
outra tela que lia o plano gravado via o dia como o motor o escreveu — sem o
teste. A corrida do teste não casava com sessão nenhuma e virava "atividade fora
do plano".

Agora o overlay entra **na leitura do plano**, em
[weekly-plan.ts](src/lib/weekly-plan.ts):

```ts
const [{ data }, test] = await Promise.all([ /* coach_reports */, loadPlannedTest(db, userId) ]);
const withTest = applyPlannedTest(parsed, test);
return { plan: withCheckedNote(withTest), reportId: row.id };
```

Quem lê o plano por `loadWeeklyPlan` passou a ver o teste sem saber que ele é um
overlay: Home, agenda, adesão, check-in, notificações.

## 4. Sem check-in normal depois do teste

A regra ficou como função pura, em
[run-feedback.ts](src/lib/run-feedback.ts) (`asksForCheckIn`), com seis testes:

- treino comum → pergunta
- corrida fora do plano → pergunta
- teste **marcado** e não registrado → **pergunta** (a resposta pode ser "não
  fiz", e aí era um treino comum)
- teste **registrado** → cala: o formulário de calibração já foi o check-in
- check-in já respondido → fica, mesmo no dia do teste
- adiado ou recusado não silenciam nada

E [performance-tests/route.ts](src/app/api/performance-tests/route.ts) fecha a
marcação ao salvar o resultado (`status: "done"`), sem travar o salvamento se a
atualização falhar.

## 5. Os mapas — **não reproduzido**

Verifiquei: as tiles do CARTO respondem **200** (quatro variantes de URL
testadas), as corridas recentes têm polyline, o token do Strava é válido, e numa
página de reprodução local o mapa renderizou com as tiles carregadas.

Mesmo assim, falhar calado era um problema real: se o CDN cai, a tela ficava
cinza sem explicação. [RouteMap.tsx](src/components/runs/RouteMap.tsx) e
[RunsWorldMap.tsx](src/components/runs/RunsWorldMap.tsx) agora trocam para o
OpenStreetMap no primeiro `tileerror`, uma vez só.

**Preciso saber o que você vê** — qual tela, e se é caixa cinza ou mensagem.

## 6. "Comparar com amigos" — **não reproduzido**

A rota responde, e há 3 amizades aceitas. Mas
[AchievementCompare.tsx](src/components/achievements/AchievementCompare.tsx)
transformava **qualquer** erro da rota numa lista vazia, e a tela mostrava a
comparação "só você" — indistinguível de quem não tem amigos. Quem clicou em
"Comparar com amigos" e caiu nessa tela conclui, com razão, que o botão não
funciona.

Agora um erro é um erro: mensagem visível e **"Tentar de novo"**.

## 7. Treino de hoje antes de "Como você está hoje"

Em [HomeContent.tsx](src/components/home/HomeContent.tsx). Quem abre o app de
manhã quer saber o que vai fazer; como o corpo está é a segunda pergunta — e é
uma pergunta *sobre o treino*, não sobre si mesma.

## 8. O aviso de recuperação parou de explicar o óbvio

"Monitore a recuperação. Mantenha treinos leves…" dizia ao atleta para fazer o
que o app faz por ele. Ficou só a parte acionável, em
[overtraining.ts](src/lib/overtraining.ts):

> Mantenha treinos leves e evite aumentar a carga agora.

## 9. Animação de "level up" pós-teste — **no radar**

Mostrar VDOT, zonas, ritmos e previsões sendo recalculados. Fica para depois
que este fluxo estiver rodando na mão de verdade.

---

## O conselheiro: notificação primeiro, detalhe no clique

Pedido no mesmo turno. [AdvisorCard.tsx](src/components/coach/AdvisorCard.tsx)
agora abre fechado: um botão de 52 px — **"Sugestões para sua semana"** + a
quantidade — e nada mais. A lista só existe depois do toque, e nenhuma sugestão
abre por conta própria. Sem sugestão, o card grande verde saiu: sobrou a
legenda *"Nada a ajustar por enquanto"*.

---

## Verificação

- `npx tsc --noEmit` — limpo
- `npx vitest run` — **93 arquivos, 1.621 testes** (6 novos em `asksForCheckIn`)
- `npx next build` — compila; nenhuma rota `preview-*` no bundle
