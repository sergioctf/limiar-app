# Saúde entrando na decisão do Treinador

Aplicado em 18/09/2026 ("ponto 4"). Pedido, na análise que Sérgio aprovou:

> Sono, recuperação, percepção de esforço e outros treinos precisam participar da mesma decisão. *"Hoje tem um treino intenso. Você relatou cansaço e suas últimas noites ficaram abaixo do seu habitual. Como está se sentindo?"* O importante é definir **quando** esses sinais justificam uma pergunta ou proposta de ajuste. Perguntar todo dia vira burocracia; ignorar tudo faz Saúde continuar isolada.

Antes, o Treinador só olhava um número (o veredito da recuperação) e oferecia "Trocar por leve" quando ele era "baixa". Agora os sinais entram por origem, com uma regra explícita de quando perguntar. Tudo determinístico: `src/lib/today-check.ts`.

## Os sinais

| Origem | Sinal | Peso |
|---|---|---|
| **Sono** | noite abaixo de 5 h | 2 (forte) |
| | noite 1 h ou mais abaixo do seu habitual (mediana dos últimos 30 dias, com pelo menos 5 noites) | 1 |
| | média das últimas 2–3 noites 45 min ou mais abaixo do habitual | 1 |
| **Relógio** | HRV 12% abaixo da sua base (25% → forte) | 1 / 2 |
| | FC de repouso 5 bpm acima da base (8 → forte) | 1 / 2 |
| | disposição do Garmin, quando você informou, abaixo de 40 (25 → forte) | 1 / 2 |
| **Relato** | cansaço, pouco sono ou estresse num check-in dos últimos 3 dias | 1 |
| | treino recente marcado como "muito difícil" | 1 |
| | energia baixa no check-in da manhã (1 → forte) | 1 / 2 |
| | dor muscular forte no check-in da manhã | 1 |
| | **dor ou incômodo** num check-in recente | 2, e regra própria |
| **Carga** | forma (TSB) ≤ −20 — corrida **e academia** somadas (≤ −30 → forte) | 1 / 2 |

**Cada origem conta uma vez, pelo sinal mais forte.** Uma noite ruim vista três vezes (noite curta, média baixa, disposição do Garmin puxada pelo sono) continua sendo uma noite ruim.

## Quando pergunta

| Situação | O que acontece |
|---|---|
| Sessão exigente (tiro, limiar, fartlek, progressivo, subidas, longão, teste) e pontuação ≥ 2 — um sinal forte, ou dois moderados de **origens diferentes** | **Pergunta** |
| Sessão exigente com um único sinal moderado | Nada |
| Dia leve | **Nunca pergunta.** Com pontuação ≥ 3, uma linha de conselho no card |
| Dor ou incômodo relatado | Pergunta antes de qualquer corrida |
| Descanso, academia, prova, treino já feito, já trocado ou já adaptado | Nada |

### Para não virar burocracia

- **Uma pergunta por dia**, e o pop-up **no máximo uma vez** — depois ela fica no card Hoje até ser respondida ou o treino acontecer.
- Respondeu **"estou bem"** ontem? Hoje só pergunta de novo se os sinais **pioraram**; senão vira uma linha de conselho.
- **Mais de duas perguntas na mesma semana** só com motivo forte (pontuação ≥ 3).
- A decisão do dia fica gravada: dados do relógio chegando no meio do dia não fazem a pergunta aparecer e sumir.

## As respostas

| Resposta | O que o Treinador faz |
|---|---|
| Estou bem — mantenho o treino | Registra. Nada muda |
| Um pouco cansado — prefiro uma versão mais curta | A mesma sessão, menor: a alternativa "mais curta" de **Adaptar este treino** (motivo novo: "Estou cansado"). Original guardado, dá para desfazer |
| Cansado — troco por uma rodagem leve | A troca de recuperação que já existia (`applySwap`), com desfazer |
| Prefiro passar para amanhã | Só aparece quando amanhã comporta sem colar dois dias fortes |
| (dor) Foi pontual · Ainda incomoda — troco por leve · Amanhã | idem |

**Nada muda sozinho.** A pergunta substitui no card os botões antigos de "recuperação baixa", em vez de aparecer ao lado deles.

## Onde aparece

- **Pop-up ao abrir o app**, antes do check-in da corrida e da pergunta da semana — só importa antes do treino.
- **Card Hoje**, no lugar dos botões de troca, enquanto não houver resposta.
- **Adaptar este treino** ganhou o motivo "Estou cansado".

## Implementação

- `src/lib/today-check.ts` — sinais, pontuação, decisão, frases.
- `src/app/api/coach/today-check/route.ts` — `GET` (decide e grava a decisão do dia), `POST {action: "prompted"}`, `POST {answer}` (aplica pela adaptação ou pela troca).
- `src/lib/adapt-context.ts` — contexto de adaptação extraído da rota de adaptação, agora compartilhado.
- `src/components/today/TodayCheck.tsx`, `EntryPrompt.tsx`, `TodayCard.tsx`.
- **Migration 033** (`today_checks`: uma linha por dia, com ação, pontuação, sinais, quando o pop-up apareceu e a resposta). **Aplicada em 18/09** pelo SQL Editor; as três políticas (ler, inserir, atualizar a própria linha) conferidas.

## Verificação (18/09/2026)

- **Testes:** `tests/today-check.test.ts` (20 casos — o exemplo da análise, noite ruim contada uma vez, fontes diferentes, relógio, Garmin, academia pela carga, check-in da manhã, dia leve, dor, dias sem decisão, e as três travas anti-burocracia). Suíte: 72 arquivos, 1.369 testes, `tsc` limpo.
- **Produção, dados reais:** hoje é descanso, então nada é perguntado — como deve ser. Os sinais lidos foram "dormiu só 4h40 esta noite" (forte) e "relatou cansaço" (check-in de 16/09): pontuação 3. Num dia de tiro, a pergunta seria *"Hoje tem Tiros curtos 6×200 m. Você dormiu só 4h40 esta noite e relatou cansaço. Como está se sentindo?"*
- **Prévia visual** (página `/dev` temporária, removida): pop-up e card compacto renderizados; a resposta "Estou bem" mostra a confirmação.

## Limites

- A notificação da manhã ainda não faz a pergunta — ela aparece ao abrir o app.
- "Outros treinos" entram pela carga (TSB com academia, bike, natação); a pergunta não diz qual treino pesou.
- Os limiares (12% de HRV, 5 bpm, 45 min de sono) são pontos de partida conservadores; com algumas semanas de respostas gravadas em `today_checks` dá para calibrar com dados.
