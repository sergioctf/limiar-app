# A semana de 28/09 e a segunda de 9,5 km (21/09/2026)

Três perguntas do Sérgio, na virada de domingo para segunda.

## 1. "Minha rodagem de segunda tem a mesma distância do longão da semana passada — está certo?"

**A conta está certa pelas regras do motor. O resultado é discutível.**

- **O total (24,5 km) vem da trava de volume.** Na semana de 14/09 o plano pediu 19 km e ele correu 24,5 — a quarta de subidas virou 8 km e o longão de domingo, 10,5. A regra é "o que você correu vira o piso da próxima semana" (`volumeWithRatchet`): sem prova marcada, o motor adota o que foi executado. Daí 24,5 km — **+29% sobre o que tinha sido planejado**, puxado em boa parte por uma sessão que foi uma *troca*, não o treino prescrito.
- **A divisão é o que faz a rodagem ficar do tamanho do longão.** Com três corridas, o tiro tem tamanho próprio (3,5 km), o longão é limitado a 45% da semana, e **toda a sobra cai na única rodagem** (`distributeWeeklyVolume`). Rodagem de 9,5 km ≈ 85% do longão, logo depois de um longão de 10,5 no domingo.

Não é absurdo, mas não é o que um treinador faria: a rodagem virou a válvula de escape do volume. **Fica para decidir junto** (ver "Decisões em aberto").

## 2. "Gerei a semana de 28/09 e saiu 3 km, 3 km e 8 km — o que aconteceu?"

Reproduzido com os dados reais: o motor chega em **exatamente 14,0 km**. Quatro coisas, e só a primeira é intencional.

**a) É a semana de recuperação do bloco.** Semana 4 do bloco 9 (âncora: primeira corrida, 28/01). O desenho 3:1 corta ~30%: base de 20,2 km × 0,7 = 14. Isso é por projeto — mas **a tela não dizia**, e 3/3/8 sem explicação parece defeito.

**b) As corridas de 3 km ficam abaixo do seu mínimo (5 km).** O longão tem piso de 8 km (o seu `minLongRunKm`), o tiro leve tem 3; sobram 3 km para a rodagem. O código escolhe de propósito "rodagem curta" em vez de passar do total da semana. **Fica para decidir junto.**

**c) O recado da IA inventou números — bug, corrigido.** Disse *"mantenha a corrida curta (6 km)"* e *"antes de aumentar o volume para 20 km"*: nenhum dos dois está no plano, e não disse que a semana era de recuperação. O prompt já proibia distâncias; o modelo escreveu assim mesmo.

**d) "Essa segunda" virou "toda segunda" — bug, corrigido.** O extrator de memória do chat gravou "[availability] segunda-feira tem pouco tempo, reduzindo corrida para 6 km" como nota **permanente**. A semana de 28/09 foi gerada às 00:02 de 21/09 e herdou o pedido.

## 3. "O aviso 'Merece atenção' leva ao Treinador, que não responde a pergunta"

Regressão da Fase 3: a devolutiva saiu do Treinador e foi para a IA, mas o aviso continuou apontando para `/coach`. **Corrigido:** o aviso abre `/ia?leitura=semana_passada`, e a IA já abre com essa leitura respondida.

## O que foi corrigido

| | Onde |
|---|---|
| **Trava no recado da semana:** todo número em km que ele citar tem que estar no plano (`noteRespectsPlan`). Reprovado, entra o recado do motor (`fallbackWeekNote`). A IA agora recebe as corridas montadas e se a semana é de recuperação. | `src/lib/week-note.ts`, `weekly-plan.ts`, `ai.ts` |
| **"Volume recente" do recado** era a soma das últimas 10 corridas — não era semana nenhuma. Virou o planejado da semana anterior. | `weekly-plan.ts` |
| **Notas com prazo:** agenda e preferência ditas no chat de uma semana vencem na virada dela. Lesão, objetivo e observação continuam sem prazo. Migração **036** (`expires_at`). | `src/lib/athlete-notes.ts`, chat, memória |
| **Quem monta a semana lê as notas válidas no começo dela**, não agora — senão uma semana gerada à meia-noite de segunda herda o pedido da anterior. | `weekStartsAt` |
| **O extrator** ganhou a regra "um pedido sobre um dia ou uma semana não é fato sobre o atleta". | `extractAthleteNotes` |
| **Semana de recuperação diz o que é:** o plano grava `cycle: { week, isRecovery }` e o Treinador mostra a faixa "Semana de recuperação". | `types`, `WeeklyPlanCard` |
| **Aviso da Hoje → IA**, já com a leitura aberta. | `page.tsx`, `/ia` |

## O que foi feito nos dados (com backup)

Backup em `Limiar/tmp/backups/2026-09-21_semana-2809_e_notas.json` (as duas notas e o plano de 28/09 como estavam).

- As duas notas do chat de 20/09 ganharam o prazo que a regra nova daria: **valem até 28/09 00:00** — a semana de que falavam.
- A semana de 28/09 foi **regenerada**. Mesmos números (o motor não mudou), recado novo: *"A semana é de RECUPERAÇÃO, por isso o volume está reduzido para 14 km… corridas de 3 km e no longão de 8 km"*, e a faixa de recuperação na tela.

## Decisões em aberto — para o Sérgio

1. **Semana de recuperação sem corrida abaixo do mínimo.** Hoje: 3 + 3 + 8. Proposta: quando o volume da recuperação não paga o seu mínimo em todas as corridas, **tirar uma corrida** — 6 km de rodagem + 8 km de longão (14 km), sem tiro. Recuperação de verdade costuma cortar intensidade antes de cortar distância.
2. **A rodagem não pode ser a válvula de escape.** Proposta: limitar a rodagem a ~70% do longão e mandar o excedente para aquecimento e desaquecimento do dia de tiro — o que dá ao tiro um formato mais completo (hoje ele tem 3,5 km no total).
3. **Uma troca não deveria subir o piso da semana seguinte em 29%.** Proposta: a trava adota o que foi executado, mas **até +10%** sobre o planejado quando não há prova marcada — coerente com a política "com calma sem prova marcada".
