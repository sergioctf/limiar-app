# Disposição do Limiar × Training Readiness do Garmin

Investigação de 16/09/2026. **Nada foi alterado no cálculo** — este documento registra o diagnóstico para decidirmos o que fazer.

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
