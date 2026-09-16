# Disposição do Limiar × Training Readiness do Garmin

Investigação e aplicação de 16/09/2026. Sérgio escolheu **A como padrão e B como opção** — ver "O que foi aplicado", no fim.

## O relato

Sérgio, 16/09: o Limiar mostrava disposição na casa dos 60; o Garmin, entre 20 e 40. *"A leitura do Garmin condiz muito mais com como estou me sentindo. Dormi muito pouco essa noite, estou cansado, venho treinando bastante durante a semana."*

## Dá para puxar a disposição direto do Garmin?

**Hoje, não.** Os dados que o intervals.icu entrega para a conta do Sérgio (lidos direto do banco, 12 a 16/09) trazem sono, nota de sono, HRV, FC de repouso, passos, peso e qualidade do sono. **Não vem nenhum valor de disposição (`readiness`), Body Battery nem estresse.** O campo existe na API do intervals.icu, mas chega vazio para esta conta.

Os outros caminhos também estão fechados:

- **API da Garmin:** programa de desenvolvedores fechado a apps novos (ver `HANDOFF.md`, seção 8.5).
- **Apple Saúde:** o Garmin não escreve a disposição lá.
- **API não oficial do Garmin Connect:** exigiria usuário e senha da Garmin do atleta e fere os termos de uso. Descartado.

A única forma de ter o número exato do Garmin é **o próprio atleta informá-lo** (por exemplo, um campo opcional no check-in da manhã).

## Por que os números divergem

Cálculo do Limiar para 16/09, reconstruído com os mesmos dados da tela:

| Componente | Valor do dia | Nota | Peso |
|---|---|---|---|
| Sono | 4,2 h, nota Garmin 52 | 52 | 0,22 |
| FC de repouso | 51 bpm contra média ~53 | 96 | 0,10 |
| Forma (TSB) | −2,9 | 73 | 0,20 |
| HRV | 81 ms | **fora do score** — só 4 noites de base, exige 7 | 0,18 |
| Recuperação do fabricante | não chega | — | 0,30 |

Com só três componentes presentes, os pesos são renormalizados: (52×0,22 + 96×0,10 + 73×0,20) ÷ 0,52 = **69**.

Os fatores que o Garmin usa no Training Readiness, segundo o manual do Forerunner 265:

1. Nota de sono da última noite
2. Tempo de recuperação
3. Status de HRV
4. Carga aguda
5. Histórico de sono (últimas 3 noites)
6. Histórico de estresse (últimos 3 dias)

Onde o nosso cálculo se afasta disso, em ordem de impacto:

1. **Uma noite de 4 horas pesa pouco.** Sono tem 22% do peso e não existe "histórico de sono": 6,3 h na noite anterior e 4,2 h nesta não se somam como débito. No Garmin, sono aparece duas vezes (última noite e três noites).
2. **A renormalização infla o número quando falta sinal.** Sem HRV e sem a nota do fabricante, a FC de repouso boa (96) e a forma neutra (73) ganham peso desproporcional. Um score com metade das entradas é apresentado com a mesma cara de um completo — o ponto que a outra IA chamou de "precisão maior do que a cobertura permite".
3. **A carga ignora musculação e outros esportes.** O TSB só conta corridas; uma semana puxada de academia aparece como "descansado" (dívida A8 do handoff). O Garmin usa carga aguda de tudo o que o relógio registrou.
4. **HRV ainda em calibração.** Resolve sozinho em 3 noites (a base exige 7), mas até lá o sinal mais importante está ausente.
5. **Não há tempo de recuperação nem estresse.** O intervals.icu não entrega estresse para esta conta.

## Opções para decidir

- **A. Aproximar o cálculo do que o Garmin faz**, sem copiar: histórico de sono de 3 noites e teto para noite muito curta (menos de 5 h não pode resultar em disposição "alta"); puxar para o neutro em vez de renormalizar quando faltam sinais importantes; incluir musculação e outros esportes na carga aguda; exibir a cobertura ("3 de 5 sinais") ao lado do número.
- **B. Deixar o atleta informar o número do Garmin** num campo opcional pela manhã e usá-lo no espaço de "recuperação do fabricante" (peso 0,30), hoje vazio.
- **A + B (recomendado):** B por duas ou três semanas vira o gabarito para calibrar A com dados reais, em vez de ajustar pesos no palpite; depois o campo pode continuar opcional.

Fonte dos fatores: [Forerunner 265 Series — Training Readiness](https://www8.garmin.com/manuals/webhelp/GUID-F41EAFB3-6CC9-42DE-9C6C-9E358DBB0671/EN-US/GUID-C21BE0C8-A08E-4DA1-B6C6-2E0E2DDDB372.html).

## O que foi aplicado (16/09/2026)

Decisão do Sérgio: *"sim para A + B [...] mas vamos considerar A como padrão, B só como opcionalidade"*.

### A — o cálculo padrão (`src/lib/readiness.ts`)

| Mudança | Antes | Agora |
|---|---|---|
| Pesos | recuperação do fabricante 0,30 · sono 0,22 · HRV 0,18 · FC repouso 0,10 · forma 0,20 · dor 0,10 · RPE 0,06 | recuperação do fabricante/Garmin 0,25 · sono 0,25 · **sono das últimas noites 0,10** · HRV 0,20 · FC repouso 0,10 · forma 0,20 · dor 0,10 · RPE 0,05 |
| Sono das últimas noites | não existia | média de horas das últimas 2–3 noites: ≤4,5 h → 15 · 5 h → 30 · 5,5 h → 40 · 6 h → 55 · 6,5 h → 70 · 7 h → 85 · ≥7,5 h → 100 (interpolado) |
| Noite curta | nenhuma regra | **teto:** menos de 4 h 30 → no máximo 40; menos de 5 h 30 → no máximo 60 (nunca "alta"). O motivo aparece na tela |
| Sinal ausente (com relógio) | o peso sumia e os presentes eram renormalizados | sono, sono das últimas noites, HRV e FC de repouso ausentes **contam como neutro (50)** no peso deles. Sem relógio (só check-in) nada muda |
| Cobertura | invisível | "Relógio + carga · 3 de 4 sinais" e "Sem leitura hoje, contando como neutro: HRV" |
| Carga (forma) | só corridas | **musculação, HIIT, bike e natação entram** (`activityTSS` em `training-load.ts`): pela FC quando existe (limitada a 0,9 do limiar), senão por esporte (musculação 0,70, HIIT 0,85, bike 0,65, natação 0,70). Vale para a Saúde e para o card de Forma do dashboard |
| Base da FC de repouso | média | mediana (igual ao card de vitais) |

**Com os dados reais de 16/09:** score **40, baixa** (antes 69), com o aviso *"Noite de 4h13: a disposição fica limitada"*. Componentes: sono 52, sono das últimas noites 35, FC de repouso 92, forma 67 (TSB −5,5 com a academia, antes −2,9), HRV neutro por calibração. O Garmin marcou 20–40.

### B — opcional (`GarminReadinessField`, `/api/health/garmin-readiness`)

Na Saúde, abaixo do score, para quem tem relógio: *"Seu Garmin mostra outra disposição? Informe o número (opcional)"*. O número (1–100) é gravado em `wellness_data.garmin_readiness` do dia e entra no espaço de recuperação do fabricante (peso 0,25) como **mais um sinal** — não substitui o cálculo. Pode editar ou remover.

**Migration 031 aplicada em 16/09** (depois que Sérgio entrou de novo no Supabase). Verificado em produção: a coluna existe, o campo aparece na Saúde e a rota recusa 0, 101 e texto com 400, sem gravar nada. Nenhum número foi informado em nome do atleta.

### Testes

`tests/readiness-model-a.test.ts` (19 casos, incluindo a manhã de 16/09 como caso real) e um caso novo em `recovery-today.test.ts` para o rótulo de cobertura. Suíte: 1.245 testes, `tsc` limpo.

### Próximo passo de calibração

Com o campo B preenchido por 2–3 semanas, comparar o score A de cada manhã com o número do Garmin e com o esforço relatado no check-in pós-treino, e só então ajustar pesos e tetos — com dados, não no palpite.

### Leitura independente (16/09/2026)

Quando o número do Garmin é informado, `Readiness.withoutGarmin` guarda o score calculado **sem** ele, e o campo na Saúde mostra "Leitura do Limiar sem este número: X". É esse valor que deve ser comparado com o Garmin na calibração: o score que já inclui o número do Garmin estaria, em parte, se comparando com ele mesmo.
