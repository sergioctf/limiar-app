# Reorganização de 20/09 — a IA assume as leituras, a Hoje recebe o histórico

Fase 3 do plano em [plano-proximos-passos.md](plano-proximos-passos.md), mais os pedidos do Sérgio na mesma conversa.

## A IA foi testada antes de qualquer remoção

Conversa de verdade com a Groq sobre o dossiê real do Sérgio. O teste achou três coisas:

1. **Ela fazia conta.** Perguntado sobre VDOT, o modelo respondeu *"maratona em torno de 3h45"* — multiplicou o ritmo de maratona pela distância. É pequeno, soa certo e é exatamente o que a ADR-02 proíbe. **Correções:** as previsões de Daniels (5 km, 10 km, 21 km, 42 km) entraram na seção "Meus ritmos", para o número já estar lá; e o prompt ganhou uma regra explícita — *"VOCÊ NÃO FAZ CONTA. Nenhuma."* Depois disso ela passou a responder 3:53:49, que é a previsão do motor.
2. **O teto da Groq.** O plano gratuito permite 8.000 tokens por minuto e o dossiê tem ~2.000; três perguntas seguidas batem no limite. O Sérgio pediu "sem limite", e o limite não é nosso — então o app agora **diz qual é**: "Muitas perguntas em sequência. O provedor pediu 19 s — as leituras rápidas continuam valendo enquanto isso." (`callGroqDetailed` lê o `retry-after` da resposta.)
3. **Temperatura 0,7 → 0,3.** Aqui a graça é ser exato, não criativo.

O que ela acertou sem ajuda: "não tenho esse dado" para flexões; mandar procurar fisioterapeuta na dor no joelho; citar a fonte de cada número.

## O que saiu das telas

| Saiu de | O quê | Agora |
|---|---|---|
| Treinador | "Sua semana" (devolutiva) | leitura da IA "A semana que fechou" |
| Histórico | "O que está melhorando para você" | leitura da IA "O que está melhorando" |
| Gráficos | Seus números, recordes, prova-alvo | fim da aba **Hoje** |
| Gráficos | Conquistas | **Amigos → Conquistas** |

Os leitores (`week-recap.ts`, `progress-reading.ts`) continuam inteiros — é deles que a IA lê. O que morreu foram os três cards: `WeekRecapCard`, `ProgressCard`, `HistoryHighlights`.

**Metas ficou como estava.** A sugestão de metas cria meta com um toque — é funcionalidade, não interpretação. A leitura ("você está X acima do alvo") já é da IA.

## O que entrou na Hoje

A ordem da página, de cima a baixo:

```
Boa noite, Sérgio · domingo, 20 de setembro
  23° Parcialmente nublado · sensação 25°     ← novo
[alertas]
Como você está hoje
Treino de hoje                                ← agora colorido pelo tipo
Minha semana
──────────────────────────────────────
Teste de 3 km · refazer em 9 dias             ← novo
Seus números · Recordes · Prova-alvo          ← voltaram de Gráficos
```

**O teste de 3 km ganhou um relógio.** Sérgio: *"é uma das coisas mais importantes desse app, que meio que calibra tudo, e tá meio largado."* Estava: o app dizia a idade do teste ("6 semanas") em dois lugares discretos, e idade não é uma coisa que se coloca na agenda. Agora é contagem — anel que esvazia, "refazer em 9 dias", vermelho quando vence. A régua é a de sempre (`test-status.ts`): vale 8 semanas.

**O tempo, abaixo da saudação.** Uma linha: temperatura, condição e sensação; toca e abre as próximas 6 horas com chance de chuva. Fonte: **Open-Meteo** — sem chave, sem cadastro. A localização é pedida **no toque**, nunca sozinha ao abrir o app, fica guardada só no navegador, e vai **arredondada para duas casas** (~1 km): clima não precisa do endereço de ninguém.

**Cores por tipo de treino na Hoje.** O Treinador já pintava rodagem de verde, limiar de amarelo, tiro de vermelho e longão de roxo; o mapa morava dentro do `WeeklyPlanCard`, então ninguém mais podia falar a língua. Virou `src/lib/session-colors.ts`, e a sessão do dia agora aparece na cor do seu tipo, com o nome do tipo em cima do detalhe.

**Em "Minha semana", não.** Decisão do Sérgio, e é a certa: lá a cor já quer dizer feito / previsto / não feito. Duas gramáticas de cor no mesmo bloco não se somam, se anulam.

## Custo: a Home voltou a carregar o histórico inteiro

"Seus números" e os recordes falam da vida toda, então a consulta de corridas da Home perdeu o corte de 180 dias. Não é a volta da dívida A6: são ~10 colunas numéricas por corrida, nunca o `strava_raw_json`. A carga (`detectOvertraining`) continua olhando só os últimos 180 dias, agora por um filtro em memória.

## Testes

1.449 passando (12 novos). Os de `weather.ts` acharam dois bugs meus antes de qualquer deploy: um código WMO desconhecido virava "Trovoada" (faixa aberta em `>= 95`), e quando a série horária acabava a tela mostrava a **previsão da manhã** como "próximas horas" — errado de um jeito que ninguém percebe olhando.

## Arquivos

| Arquivo | O quê |
|---|---|
| `src/lib/session-colors.ts` | as cores por tipo de sessão, uma vez só |
| `src/lib/weather.ts` | leitura do Open-Meteo, tradução dos códigos, arredondamento da coordenada |
| `src/lib/test-status.ts` | `daysUntilTestDue` |
| `src/components/home/WeatherNow.tsx` | a linha do tempo, com as próximas horas |
| `src/components/home/TestCountdown.tsx` | o relógio do teste |
| `src/components/home/HomeHistory.tsx` | o rodapé da Hoje |
| `src/components/achievements/MyAchievements.tsx` | minhas medalhas, em Amigos |
| `src/app/friends/conquistas/page.tsx` | Amigos → Conquistas |
| `tests/weather.test.ts`, `tests/test-countdown.test.ts` | 12 testes novos |
