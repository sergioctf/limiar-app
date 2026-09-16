# Metodologia de treino do Limiar

Base científica do gerador de planos. Toda regra aqui é **determinística** — o
motor calcula a sessão a partir do VDOT/LTHR do atleta, e a IA só escreve a
descrição em volta. Isso evita treino "inventado" e mantém o plano auditável.

---

## 1. Zonas de ritmo (Jack Daniels — VDOT)

O VDOT vem do teste de 3 km. As cinco intensidades, como % da velocidade
associada ao VO₂max (vVO₂max):

| Sigla | Nome | % vVO₂max | Uso |
|---|---|---|---|
| **E** | Fácil / rodagem | 62–72% | base aeróbica, maior parte do volume |
| **M** | Maratona | 78–83% | ritmo-alvo de prova longa |
| **T** | Limiar / tempo | 85–88% | limiar de lactato, 20–40 min contínuos |
| **I** | Intervalo | 95–100% | VO₂max, repetições de 3–5 min |
| **R** | Repetição | 105–112% | economia e velocidade, 200–400 m |

Implementado em `src/lib/performance.ts` (`buildTrainingPaces`).

## 2. Distribuição de intensidade

Daniels recomenda:
- **70–80%** do volume em E
- **10–15%** em M + T
- **10–15%** em I + R

Isso é o modelo polarizado/piramidal: a maior parte fácil de verdade, e o
trabalho duro concentrado em poucas sessões.

## 3. Tetos de volume por tipo de sessão

Limites por sessão, como **% do volume semanal** — são os guard-rails que
impedem o plano de prescrever treino demais:

| Sessão | Teto | Observação |
|---|---|---|
| **Longão** | 25–30% | nunca ultrapassar, mesmo em maratona |
| **T (limiar)** | 10% | pode ser dividido em 2 sessões em ciclo de maratona |
| **I (intervalo)** | 8% | máximo por sessão: o menor entre 10 km e 8% |
| **R (repetição)** | 5% | volume total de tiros rápidos |

## 4. Estrutura de intervalados

- Repetições de **3 a 5 minutos** (800 m e 1000 m são os formatos clássicos)
- Recuperação em **trote**, de duração semelhante à repetição
- Regra prática: descanso = **50–90% do tempo da repetição** (~70% é o mais comum)
- Sempre com aquecimento e desaquecimento em ritmo E

## 5. Zonas de frequência cardíaca (Joe Friel — % LTHR)

O LTHR é estimado a partir do teste; as faixas usadas:

| Zona | % LTHR | Sensação |
|---|---|---|
| Z1 | < 85% | recuperação |
| Z2 | 85–89% | aeróbico, conversa fácil |
| Z3 | 90–94% | tempo |
| Z4 | 95–99% | limiar |
| Z5a | 100–102% | acima do limiar |
| Z5b | 103–106% | VO₂max |

**Por esporte:** o LTHR não é o mesmo em todos os esportes. Offsets aplicados
sobre o LTHR de corrida (`src/lib/sport-metrics.ts`):
- Ciclismo: **−8 bpm** (peso apoiado, menos massa muscular recrutada)
- Natação: **−13 bpm** (posição horizontal, reflexo de mergulho)

## 6. Periodização de longo prazo

Fases na ordem: **base → build → peak → taper**.

- Progressão de volume **≤ 10% por semana**
- **A cada 4ª semana**, semana de recuperação com **−30%** de volume
- **Taper**: 2–3 semanas reduzindo volume em **40–60%**, mantendo a intensidade
  (reduzir volume, não qualidade — cortar intensidade no taper tira a afiação)

## 7. Estrutura semanal do atleta (preferência do Sérgio)

Três corridas por semana, **nesta ordem**:
1. **Rodagem leve** — menor volume da semana
2. **Tiro / intervalado**
3. **Longão**

Musculação e outros esportes se encaixam ao redor, sem quebrar a sequência e
respeitando o princípio duro/fácil (nunca dois dias duros seguidos).

---

## 8. Musculação para corredores

### 8.1 Carga: pesado ganha de leve

Meta-análise comparando treino de força pesado × pliometria para economia de corrida:
**carga alta vence**. Treino com cargas **≥90% de 1RM** (≤4 repetições) melhora a economia
de corrida de forma mais confiável e maior do que cargas moderadas (70–89% 1RM).
Alto volume com carga leve **não** produz o efeito.

Pliometria também funciona, e a **combinação** das duas dá a melhor adaptação
neuromuscular. O efeito exige tempo: **10–14 semanas** de força pesada, 8–10 de pliometria.

Isso é contraintuitivo para corredor: o instinto é fazer muitas repetições com pouco peso
("resistência muscular"), e é justamente o que **não** melhora a corrida.

### 8.2 Interferência: o que atrapalha o quê

Força e endurance no mesmo dia competem entre si:
- **≥6 h entre as sessões** minimiza a interferência aguda (mínimo aceitável: 3 h)
- Se as duas no mesmo dia, fazer a **corrida primeiro** quando ela é a prioridade
- Força pesada causa dano muscular que **prejudica a corrida por até 48 h**

Consequência prática para o gerador: **nunca colocar força pesada de pernas na véspera
de um treino de qualidade ou do longão**.

### 8.3 Frequência e divisão

- **2× por semana** é o ponto ideal para corredor
- **2× por grupo muscular** supera 1× de forma significativa
- Full body funciona bem para iniciante; **upper/lower** para intermediário em 4×/semana
- "Bro split" (1 grupo por semana, volume altíssimo por sessão) é inferior
- Há teto de estímulo por sessão (~15 séries) — acima disso, dividir em mais dias

### 8.4 Seleção de exercícios

Correr é um gesto **unilateral** — a seleção deve refletir isso.

| Categoria | Exercícios | Por quê |
|---|---|---|
| Compostos | Agachamento, levantamento terra, RDL | Base de força máxima |
| Unilateral | Búlgaro, afundo, step-up, RDL unilateral | Espelha a corrida, corrige assimetria |
| Panturrilha | Elevação, ênfase excêntrica | Propulsão e economia |
| Posterior | **Nórdico** | Reduz lesão de isquiotibiais; 2 séries/semana de 4–6 reps já bastam |
| Quadril/core | Abdução com banda, prancha | Estabilidade de pelve e tronco |
| Pliometria | Saltos em caixa | Rigidez elástica, economia |

### 8.5 Periodização da força (acompanha a da corrida)

| Fase da corrida | Força |
|---|---|
| Base | Volume maior, carga moderada, aprender padrões |
| Build | **Pesado** (≥85% 1RM, 3–6 reps) — é aqui que a economia melhora |
| Peak | Manutenção: reduz volume, mantém carga |
| Taper | Só ativação leve, mobilidade e banda. Sem carga pesada |

### 8.6 Progressão

- **Autorregulação por RIR** (repetições em reserva): hipertrofia RPE 7–8 (2–3 RIR),
  força RPE 8–9 (1–2 RIR)
- **Dupla progressão**: sobe repetições dentro da faixa, depois sobe carga
- Ao longo de um bloco, reduzir o RIR (ex.: 3 → 1) gera sobrecarga progressiva

---

## Fontes

- Jack Daniels — *Daniels' Running Formula* (zonas E/M/T/I/R, tetos de volume)
- Joe Friel — protocolo de LTHR de 30 min e zonas por % do LTHR
- Literatura de periodização: fases base/build/peak/taper, semana de recuperação
  a cada 4ª semana, taper de 2–3 semanas com redução de 40–60% do volume

Links consultados:
- https://www.coachray.nz/2023/05/03/jack-daniels-running-intensity/
- https://joefrieltraining.com/a-quick-guide-to-setting-zones/
- https://www.trainingpeaks.com/learn/articles/joe-friel-s-quick-guide-to-setting-zones/
- https://runningwritings.com/2024/05/getting-interval-workout-recovery-right.html
- https://marathonhandbook.com/periodization-training/
- https://runnersconnect.net/marathon-periodization/

Musculação:
- Heavy Resistance vs Plyometric Training for Running Economy — meta-análise:
  https://link.springer.com/article/10.1186/s40798-022-00511-1
- Optimizing concurrent training programs (interferência, intervalo entre sessões):
  https://journals.lww.com/md-journal/fulltext/2024/12270/optimizing_concurrent_training_programs__a_review.22.aspx
- Intra-session exercise sequence e o efeito de interferência:
  https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5752732/
- Resistance training frequency e hipertrofia:
  https://pubmed.ncbi.nlm.nih.gov/25932981/
- Nordic hamstring para prevenção de lesão:
  https://theprehabguys.com/nordic-hamstring-curl-variations/
- Periodização de força para corredores:
  https://www.mcmillanrunning.com/guide-to-strength-training-periodization/
- Autorregulação por RPE/RIR:
  https://massresearchreview.com/2023/05/22/rpe-and-rir-the-complete-guide/
