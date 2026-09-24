# Treinador — o que queremos e como

Combinado com o Sérgio em 23–24/09, juntando a auditoria do código, a revisão de outra IA sobre a sessão real dele, e as decisões que ele tomou. Este documento é a especificação; a execução segue a ordem do fim.

> **A frase que o Treinador tem que responder ao abrir:** *"este é meu plano, este é o motivo, e é aqui que eu ajusto quando a vida muda."*

## 1. O problema, medido

- **Oito caminhos para mudar o mesmo plano**, em quatro profundidades de tela, e nenhum diz o escopo no nome.
- **Dezenove blocos** na aba que abre.
- **Duas camadas de abas** cujos nomes colidem: você toca em "Plano" e cai em "Zonas & Plano".
- **Seis vozes** chamando "treinador": Conselheiro, chat do plano, análise completa por IA, IA central, recado da semana, "Plano semanal IA".
- O botão mais visível do card — **Regenerar** — **falha de propósito** na semana atual (que é congelada) e te joga para a próxima.

## 2. As incoerências — confirmadas, com a raiz

Verificadas nos dados e no código, não aceitas de relatório.

| O que o atleta vê | Raiz | Estado |
|---|---|---|
| Recado da semana de 21/09: *"cerca de 20 km em corridas de 8 km ou mais"* — o plano é 6 + 3,5 + 11,5 | A IA escrevia números livremente | **Corrigido em 21/09** (`noteRespectsPlan`). O recado daquela semana é anterior à correção e continua errado na tela até a semana virar — **vamos reescrever só o recado**, sem tocar no plano congelado. |
| Descrição diz *"musculação: peito"*; a sessão tem agachamento, terra, búlgaro, nórdico | `workout-builder.ts`: quando o dia junta corrida e musculação sem sessão montada, o texto tira o grupo muscular de uma **lista rotativa** (`STRENGTH_FOCUS`), não da sessão | **Bug aberto.** Texto e exercícios saem de caminhos diferentes. |
| "Análise completa por IA" | O prompt pede *"plano detalhado para as próximas 8 semanas com sessões específicas"* — prescrição paralela ao plano oficial | **Bug aberto**, mesma falha da dívida A2. **Morre.** |
| Ciclos datados em **2028** (usado em 2026) | `training_cycles`, lido só pela aba Relatórios | **Some com a aba.** A tabela fica órfã — anotada como dívida. |
| 21 notas ativas no Perfil IA, com observações de junho/julho | A memória cresce e nada envelhece (prazo só existe desde 21/09, para notas novas) | **Aberto** — ver §6. |
| Dias da semana em inglês (`MO`, `TU`, `WE`) | `dayKey.slice(0, 2)` no grid | **Bug aberto.** |

**A regra que fecha esta seção:** *quando o plano muda, tudo que o descreve muda junto ou se identifica como histórico.*

## 3. A forma nova

**Uma camada de abas:** `Plano · Calibração · Provas · Metas`

```
Treinador
 └ Plano
    ├ no máximo UM aviso, por prioridade:
    │    sem teste > teste vencido > plano desatualizado > treino perdido > pergunta da semana
    ├ Sua semana                        ← título honesto (não "Plano semanal IA")
    │   ├ [Esta semana | Próxima]
    │   ├ uma frase: o objetivo da semana
    │   ├ os 7 dias — em português, com a data, nas cores do tipo de treino,
    │   │  e a faixa "Semana de recuperação" quando for o caso
    │   ├ dia aberto: resumo, ritmo, tênis  →  Mover · Trocar · (séries atrás de um toque)
    │   ├ Reorganizar a semana
    │   └ Conversar sobre esta semana
    ├ Conselheiro
    ├ Minha semana (meus dias de treino)
    └ Plano de longo prazo
 └ Calibração
    └ teste de 3 km (atual, próxima revisão, histórico, registrar) · VDOT · ritmos · zonas · previsões
```

De **19 blocos para 7**, de **7 abas para 4**.

## 4. Três ações, e uma porta

Oito caminhos viram três verbos, cada um com o escopo no nome:

| Ação | Escopo | Onde |
|---|---|---|
| **Mover** este treino de dia | uma sessão | dentro do dia |
| **Trocar** o treino deste dia | uma sessão | dentro do dia |
| **Reorganizar a semana** | a semana | um lugar só |

**"Reorganizar a semana" absorve três caminhos de hoje** — a agenda ("só consigo terça, quinta e sábado"), o ajuste depois de treino perdido e o banner enterrado em "Progresso". É sempre o mesmo motor (`fitWeek`) com três nomes.

**O chat propõe e você confirma** (decisão do Sérgio). Ele deixa de editar o plano por IA e passa a traduzir o pedido em uma das três ações, mostrando o que muda antes de aplicar — a mesma correção que fizemos no ajuste proativo (A2). É também o fim da última prescrição por modelo de linguagem no app.

**Uma identidade, várias portas** (ideia boa da outra revisão): o mesmo treinador atende em lugares diferentes, e cada porta diz o que vai acontecer.

| Onde | Botão | O que é |
|---|---|---|
| no treino | Perguntar sobre este treino | explicação |
| na semana | Conversar sobre esta semana | proposta → confirmação |
| na sugestão | Entender este ajuste | explicação |

**"Regenerar" vira "Refazer a semana do zero"**, com aviso do que se perde (adaptações, trocas, agenda) e visível só onde funciona: próxima semana, ou quando não há plano.

## 5. Rótulos: antes → depois

| Hoje | Vira | Por quê |
|---|---|---|
| Plano semanal IA | **Sua semana** | o plano é do motor; a IA só comenta |
| Regenerar | **Refazer a semana do zero** | é a ação mais destrutiva e a menos explicada |
| Mudar meus dias de treino | **Meus dias de sempre** | é permanente e não parece |
| Minha agenda desta semana | **Reorganizar a semana** | é uma semana só |
| Já cabe — nada a mudar | **Fechar** | botão com nome de conclusão |
| Avaliar / Usar esta | **Ver o que muda / Aplicar** | verbos vagos num fluxo de 3 passos |
| MO · TU · WE | **seg 22 · ter 23 · qua 24** | em português, com a data |

## 6. Meu contexto (a memória)

Hoje são 21 notas em lista, misturando junho com esta semana. A ideia da outra revisão é boa: **trocar a lista por frases legíveis**, com validade e ação.

```
Dias de sempre: segunda, quarta e sábado
Exceção desta semana: quinta no lugar de sábado        [só nesta semana]
Preferência: gosta de longões                          confirmado em 12/08
```

Ações por item: **Corrigir · Só nesta semana · Não vale mais**.

Vai para **Configurações**, junto das outras preferências — memória é configuração, não treino.

## 7. O que sai, e para onde

| Sai | Vai para |
|---|---|
| Análise completa por IA | morre (prescreve 8 semanas por modelo) |
| Adesão ao plano | leitura da IA ("Quanto do plano cumpri") |
| Eficiência aeróbica | Gráficos |
| Perfil IA → Meu contexto | Configurações |
| Relatórios + Recordes + Ciclos | morre (recordes já estão na Hoje) |
| Musculação · Tênis | Configurações |
| Onde a semana está no bloco | funde na faixa de recuperação |
| Ritmos · zonas · previsões · VDOT | aba Calibração |

## 8. Ordem de execução

**Fase 1 — Coerência.** O treinador concorda consigo mesmo antes de ficar bonito.
1. Descrição do dia usa os músculos da sessão montada, nunca a lista rotativa.
2. Reescrever o recado da semana de 21/09 (o plano fica intocado — está em andamento).
3. Dias em português com a data.
4. Apagar a análise completa por IA.

**Fase 2 — Forma.** Uma camada de abas, um aviso por vez, sete blocos, séries atrás de um toque, faixa de recuperação absorvendo o card do bloco, rótulos novos.

**Fase 3 — Conversa.** O chat propõe e confirma; as três portas com o mesmo treinador atrás.

**Depois:** Meu contexto legível em Configurações.

## 9. Decidido não fazer

- **Não reconstruir o que funciona:** adaptação, mover sessão, agenda, estrutura do treino, exportação para o relógio, registro da musculação e troca de exercícios ficam como estão. O problema nunca foi a função, foi a apresentação.
- **Não criar uma aba "Evolução"** (sugerida na outra revisão): depois que adesão vai para a IA e ciclos/relatórios morrem, sobra só calibração — e uma aba com um assunto é uma aba a menos.
- **Não mexer em Provas e Metas** nesta rodada.

---

## Fase 1 — Coerência ✅ (24/09)

### 1. O texto do dia deixou de ser gravado

A frase sobre a musculação do dia era **escrita dentro da descrição da corrida** quando o plano nascia. Quando a corrida mudava de dia — e há quatro caminhos para isso — a frase viajava junto: a quinta-feira do Sérgio dizia *"musculação: peito"* com agachamento, terra e búlgaro na sessão. "Peito" era a segunda-feira.

Três dos quatro caminhos removiam a cauda ao mover; o quarto não. Corrigir o quarto só adiaria o problema.

**A correção tira a frase do texto guardado.** A sessão passou a carregar os músculos que treina (`StrengthSession.muscles`), e a frase é derivada dela na hora de mostrar (`day-description.ts`). Uma origem só: se a sessão mudou de lugar, a frase muda junto, porque ela **é** a sessão lida em voz alta. Planos antigos têm a cauda removida na leitura.

De quebra: num dia de musculação sem split configurado, o app dizia "musculação: peito" escolhido de uma **lista rotativa**. Agora diz "sugestão de foco: peito" — é o que de fato é.

### 2. A análise completa por IA foi apagada

O prompt pedia *"plano detalhado para as próximas 8 semanas com sessões específicas"*: uma prescrição escrita por modelo de linguagem, paralela ao plano oficial. É a mesma falha da dívida A2, e some pelo mesmo motivo. Rota `/api/coach/full-analysis` removida.

### 3. Dias em português, com a data

`MO · TU · WE` eram as duas primeiras letras da chave interna, que é inglesa. Agora **seg 22 · ter 23 · qua 24** (`DAY_SHORT_PT`, `dateOfWeekDay`).

### 4. O recado da semana de 21/09 foi reescrito

Dizia *"cerca de 20 km em corridas de 8 km ou mais"* num plano de 6 + 3,5 + 11,5. O plano está em andamento e **não foi tocado** — só o texto, que agora diz 21 km, 6×200 m e o longão de domingo. Backup em `tmp/backups/2026-09-24_recado-2109.json`.

**Testes:** 1.522 passando (12 novos).

## Fase 2 — Forma ✅ (24/09)

**Uma camada de abas.** `Plano · Calibração · Provas · Metas`. A camada de dentro ("Zonas & Plano · Testes 3km · Perfil IA · Relatórios") acabou — era ela que colidia com a de fora.

**A aba Plano tem cinco blocos**, nesta ordem: um aviso, a semana, o conselheiro, meus dias de treino, o plano de longo prazo. Eram dezenove.

**Um aviso por vez.** Os seis avisos ficam numa pilha em ordem de urgência — sem teste › teste vencido › plano desatualizado › treino perdido › pergunta da semana › semana padrão — e só o primeiro que tiver o que dizer aparece. Cada um já devolvia `null` quando calado, então quem escolhe é o CSS: `[&>*:not(:first-child)]:hidden`. Sem estado, sem contexto, sem componente novo.

**Calibração virou aba.** O teste de 3 km e tudo que ele calcula — VDOT, ritmos, zonas, previsões, evolução, histórico — estavam em duas telas diferentes, e metade atrás de dois níveis de "abrir".

**Séries e exercícios atrás de um toque.** Abertos, empurravam a semana para fora da tela.

**A faixa do bloco absorveu o card do ciclo.** Ela diz "Semana 2 de 4 do bloco" sempre, e "Semana de recuperação" quando for — um lugar só para a mesma informação.

**Rótulos:** "Plano semanal IA" → **Sua semana** · "Regenerar" → **Refazer do zero**, com aviso do que se perde e visível só onde funciona (próxima semana ou sem plano) · "Mudar meus dias de treino" → **Meus dias de sempre**.

**Mudaram de casa:** eficiência aeróbica → Gráficos · musculação, tênis e "o que o treinador sabe sobre você" → Configurações.

**Morreram:** a aba Relatórios (com a lista de relatórios, os recordes duplicados e os ciclos datados em 2028), `PlanAdherenceCard` (a adesão é leitura da IA), `CycleSummaryCard` e `PersonalRecords`.

**Fica anotado:** a tabela `training_cycles` não é mais lida por ninguém.

## Fase 3 — Conversa ✅ (24/09)

### O que eu tinha entendido errado

Eu descrevi o chat como "edita o plano por IA". **Não era isso.** O modelo nunca escreveu o plano: ele traduz o pedido para um vocabulário fixo de edições (`plan-edit.ts` — mudar distância, virar descanso, trocar dois dias, mover uma sessão, escalar a semana), o motor aplica, e a confirmação é escrita a partir do que de fato mudou. Isso já estava certo.

O que estava errado era outra coisa, e menor: **ele aplicava sem perguntar.** O atleta lia sobre a mudança depois de ela já estar salva.

### Propor e confirmar

A rota do chat passou a ter duas chamadas:

- `{ message, currentPlan }` → **propõe**. Calcula o que mudaria e devolve as edições. **Nada é gravado.**
- `{ apply: true, week, edits }` → **aplica**. Carrega o plano **guardado**, refaz as mesmas edições ali e salva.

O servidor não confia no plano que o navegador mostrou — o mesmo padrão da agenda da semana. Se o plano mudou entre a proposta e o "Aplicar", ele diz isso em vez de gravar em cima.

Na tela, a resposta vira uma lista do que mudaria, com **Aplicar** e **Agora não**.

### Uma identidade, várias portas

| Onde | Botão | O que faz |
|---|---|---|
| no treino | **Perguntar sobre este treino** | abre a conversa com o assunto já posto |
| na semana | **Conversar sobre esta semana** | propõe → você confirma |
| na sugestão | **Aplicar / Manter como está** | já existia no conselheiro |

O campo de texto também mudou de exemplo: era *"remove o treino de quinta, adiciona musculação"* — um comando — e virou *"na quinta não vou conseguir correr 8 km"*, que é como alguém fala com um treinador.

**Testes:** 1.527 passando. Cinco novos garantem a promessa da fase: propor não grava, pergunta não vira proposta, aplicar sem edições é recusado, e o que é salvo sai do plano do banco — não do que passou pela rede.

## Fase 4 — A semana vira agenda ✅ (24/09)

### O veredito que iniciou esta fase

> "Além de corrigir problemas e deixar UM POUCO menos crowded, não melhoramos NADA
> no treinador, que apesar de ter muito conteúdo, e bom, ainda está muito confuso,
> não dinâmico, cheio e pouco user friendly." — Sérgio, 24/09

Ele estava certo, e o diagnóstico é preciso: as três primeiras fases tiraram
coisas da tela (relatórios, cards duplicados, adesão) e consertaram defeitos
(o "peito" viajando de dia, o chat gravando sem perguntar). Nenhuma delas mexeu
no **desenho**. A tela continuava sendo uma pilha vertical onde tudo tem o mesmo
peso, e a semana continuava sendo sete caixinhas de 40 px com o rótulo cortado
em seis letras.

A regra desta fase foi a dele: *"não podemos perder features, só expor elas
melhor e adicionar se necessário ou interessante"*. Nada saiu.

### A semana como agenda

`WeekAgenda.tsx` (novo) troca as sete caixinhas por sete linhas:

```
▌ SEG 21     Rodagem leve              6 km
             + musculação
▌ TER 22     Descanso
▌ QUA 23     Tiros de 1 km             9 km
▌ QUI 24 hoje  Musculação             50 min
```

O que mudou de verdade: **o dia diz o que é sem ser tocado.** Antes, para saber
o que era quinta-feira, tocava-se em quinta-feira — uma semana que só se entende
dia a dia não é uma semana, é um menu. E a segunda sessão do dia, que ficava
escondida atrás de um segundo emoji de 11 px, virou uma linha em texto:
*"+ musculação"*.

A cor voltou a ser marcador (uma barra de 4 px) em vez de caixa. Sete caixas
coloridas lado a lado competiam entre si; nenhuma ganhava.

A frase de cada dia mora em `src/lib/week-agenda.ts` (`agendaLine`), que lê as
sessões de `plannedSessionsOf` — a mesma origem que a Hoje e a adesão usam. Um
dia com corrida e musculação é dois treinos em toda tela, ou em nenhuma.

### O dia ao lado da semana

No computador (`lg:`), a semana fica à esquerda e o dia aberto à direita, colado
na rolagem: **a semana nunca sai da vista enquanto se explora um treino**. No
celular a lista fica em cima e o dia embaixo — e tocar num dia rola o painel
para a tela, porque sem isso o treino nasce abaixo da dobra e parece que nada
aconteceu.

### Cada sessão é um card

O dia deixou de ser um bloco de texto com controles pendurados embaixo:

- **card do treino** — tipo e nome, distância/ritmo à direita, a descrição já sem
  a cauda de musculação, o tênis, **Ver as séries** atrás de um toque, e embaixo
  de uma linha divisória as três ações: *Mover para outro dia · Adaptar este
  treino · Perguntar sobre este treino*.
- **card da musculação** — sempre separado, com o resumo em uma linha
  (`strengthSummary`: "peito, costas · 4 exercícios · ~51 min"), **Ver os
  exercícios** e *Mover para outro dia*.
- **card de descanso** — o dia sem treino também diz por que é assim.

Antes, as mesmas ações apareciam em alturas diferentes conforme o dia tivesse
ou não séries, musculação ou adaptação disponível. Agora a posição é fixa: o que
se pode fazer com um treino está sempre no pé do card dele.

### Rótulos que dizem a ação

"Minha agenda desta semana" → **Reorganizar esta semana**. O primeiro nomeia uma
tela; o segundo diz o que acontece ao tocar.

### O que foi conferido

`tsc` limpo, `next build` limpo, **1.532 testes passando** (5 novos, em
`tests/week-agenda.test.ts`: o nome inteiro do treino em vez de seis letras, a
segunda sessão do dia, a medida certa num dia só de musculação, descanso sem
medida, e tempo quando não há distância).

O desenho foi conferido na tela, com um plano de mentira numa página temporária
(corrida + musculação na segunda, tiros na quarta, musculação sozinha na quinta,
longão no sábado), no computador e no celular. A página foi apagada depois.

## Fase 5 — Proporção, hierarquia e legibilidade ✅ (24/09)

A agenda funcionou ("agora consigo entender a semana sem abrir cada dia"), mas
a apresentação ainda não. O diagnóstico central de uma segunda revisão estava
certo e era simples de verificar: **a tela ganhou duas colunas e continuou com
768 px**.

### A largura

`CoachContent` era `max-w-3xl` — a largura de uma coluna só. Agenda e detalhe
dividiam entre si o espaço que antes servia para um. Daí o nome de treino
cortado ("Tiros curtos 6×20…"), a explicação em cinco linhas e as ações
espremidas.

Agora: `max-w-3xl` → `lg:max-w-5xl` → `xl:max-w-[1120px]`. A agenda tem largura
fixa (`minmax(0,330px)`), porque é uma lista de linhas curtas e esticá-la só
afasta o nome do treino da sua distância; o resto fica com o dia. Abaixo de
`lg`, uma coluna — comprimir os dois lados é pior do que empilhar.

### A caixa que envolvia tudo

O `card p-5` do `WeeklyPlanCard` saiu. Ele continha cabeçalho, abas, avisos,
agenda, cards e conversa — e dentro dele quase tudo era outra caixa. O espaço
entre os blocos hierarquiza melhor do que uma borda por agrupamento. Sobraram
bordas onde elas significam alguma coisa: cards de sessão, propostas e avisos.

### O cabeçalho passou a dizer o tamanho da semana

```
Sua semana
21 a 27 de set · Semana 1 de 4
3 corridas · 27 km · 2 sessões de musculação
```

O resumo (`weekSummaryLine`) sai das mesmas sessões que a agenda mostra, então
lista e cabeçalho não podem discordar. As abas de semana viraram um controle
compacto no canto — eram uma barra da largura inteira, do mesmo peso visual do
plano que servem para escolher.

### A introdução virou uma frase

O bloco com borda, título e dois parágrafos — a aula sobre o ciclo de quatro
semanas repetida toda segunda — virou uma linha com o recado do treinador e um
**"Entender o planejamento"**, que abre a explicação do bloco, a leitura da
semana anterior e de onde vêm os ritmos.

### Os cards do dia

Ordem nova, na ordem em que as perguntas aparecem: **o que é → quanto e em que
ritmo → por quê → ver a estrutura → tênis → ações**. Antes a descrição vinha
antes dos números e ocupava mais espaço que eles.

O fundo colorido saiu (verde de rodagem, roxo de musculação): superfície
neutra, cor só no marcador e na etiqueta do tipo. Se amanhã o verde também
quiser dizer "concluído", nenhuma das duas coisas ficaria clara — e nada
essencial deve depender só de cor.

O tênis virou uma linha (`<ShoeHint compact>`) em vez de um quadro com dois
parágrafos permanentes; o motivo continua no `title`, e o aviso de desgaste,
que é o que muda uma decisão, continua visível.

**E o nome do botão passou a depender do treino:** "Ver as séries" para tiro,
limiar e HIIT; "Ver a estrutura" para corrida contínua; "Ver os exercícios"
para musculação. O resumo não diz mais "1 blocos".

### A agenda

Nome do treino a 15 px (era 13), segunda sessão e data a 12 px (eram 11),
métrica a 13 px com peso médio, linhas de 56 px. **Hoje e selecionado deixaram
de se parecer:** hoje é uma etiqueta laranja junto da data, selecionado é fundo
e borda. Abrir domingo não apaga mais a informação de que quinta é hoje. E o
nome do treino não é mais truncado — quebra em duas linhas.

### Comportamento

- Tocar no dia que já está aberto **não fecha mais** o painel. Fechava, e um
  clique no lugar certo parecia um erro.
- **Carregando ≠ sem plano.** Trocar de semana passava pelo estado vazio
  ("sem plano gerado ainda", "antes de gerar o plano") antes de a resposta
  chegar, oferecendo gerar uma semana que talvez já tivesse plano. Agora o
  espaço da agenda fica reservado com sete linhas cinzas.

### O que ficou de fora, e por quê

- **"rodízio leve"** não existe no código: o rótulo do motor é "Rodagem leve"
  (`plan-suggestion.ts`, `session-swap.ts`). Não havia o que corrigir.
- **FC alvo no card** depende de derivar zona por sessão; fica para quando o
  realizado entrar, que é quando a comparação faz sentido.
- **Conselheiro contextual** — a inconsistência observada (sugestão falando de
  quinta com os tiros na sexta) precisa ser reproduzida antes de redesenhar a
  apresentação. Anotado.
- **Aviso dev de hidratação:** existe e **é anterior a estas mudanças**
  (confirmado com o código da fase 4 via `git stash`). Vem de selecionar o dia
  de hoje num efeito, dentro do boundary de Suspense do modo dev. Não aparece
  no build de produção.

**Conferido:** `tsc` limpo, `next build` limpo, **1.536 testes** (4 novos para
`weekSummaryLine`). Desenho conferido a 1.240 px e a 375 px, com um plano de
mentira numa página temporária, depois apagada.

## Fase 6 — O realizado, e a separação dos componentes ✅ (24/09)

Duas coisas na mesma passada, porque são a mesma: é o card de sessão que ganha
o estado, e era ele que precisava sair do arquivo de mil linhas.

### A agenda passou a saber o que você fez

Até aqui a semana mostrava o plano e nunca mudava depois do treino: sábado
dizia "Longão · 12 km" igual antes e depois de você correr. Uma agenda que não
sabe o que aconteceu está descrevendo um documento, não a sua semana.

`src/lib/day-progress.ts` lê as sessões de `dayStatus` — **a mesma origem da
Hoje e da adesão**, de propósito: já houve um tempo em que "treino feito" queria
dizer três coisas diferentes em três telas, e a mesma terça aparecia concluída
num card e pendente no outro. O que esta função acrescenta é a leitura do tempo:

| Situação | Como aparece |
|---|---|
| Sessão futura, ou hoje ainda sem registro | (nada) |
| Tudo que o plano pediu tem registro | ✓ **Registrado** |
| Duas sessões, uma registrada | ◌ **1 de 2 registradas** |
| Dia que já passou, nada registrado | ⊖ **Sem registro** |
| Nada marcado, mas treinou | + **1 atividade registrada** |

**Hoje sem registro não é "sem registro".** Dizer isso no sábado de manhã é
acusar alguém de faltar a um treino que ainda vai acontecer. Só dias que já
terminaram viram "sem registro" — é a regra que justifica a função existir em
vez de a tela olhar `allDone`.

**Adaptado é característica, não estado:** um treino pode estar adaptado e ainda
previsto, ou adaptado e já realizado. Aparece como etiqueta no card.

No card do dia, o realizado fica ao lado do previsto:

```
Rodagem leve
6 km · 6:30–6:45/km
Registrado  Corrida matinal  6,2 km  40 min
Ver a atividade →
```

Sem julgamento: 11,7 km num longão de 12 não é falha, e a tela não diz que é.
Quem avalia cumprimento é o motor, que olha objetivo e contexto — a existência
de uma corrida não prova que os tiros foram feitos.

E o que o plano não pediu aparece como **"Também registrado neste dia"**: a
pelada de domingo, a caminhada, o pedal que entrou no lugar de nada. Registro,
não erro — a semana é do atleta, o plano é uma proposta dentro dela.

**Os dados** vêm do servidor (`/coach/page.tsx` já carregava 13 semanas para a
adesão; agora as atividades trazem também duração, distância e nome) e descem
como propriedade até a agenda. A janela é da segunda passada em diante.

### A separação

`WeeklyPlanCard.tsx` tinha ~980 linhas e seis responsabilidades. Agora tem 634
e uma: **é o dono do plano** — busca, guarda, troca de semana, grava. Não
desenha sessão nenhuma.

```
components/coach/week/
  tone.tsx         cor, ícone e nome de cada tipo de treino
  WeekHeader.tsx   título, período, ciclo, resumo, abas, refazer
  WeekFocus.tsx    a frase da semana + "Entender o planejamento"
  WeekAgenda.tsx   as sete linhas, com o estado de cada dia
  DayPanel.tsx     o dia aberto: cards + o que foi registrado fora do plano
  RunCard.tsx      a sessão principal e suas três ações
  StrengthCard.tsx a musculação
  DayState.tsx     o estado, sempre com texto e símbolo
  WeekChat.tsx     a conversa que propõe e espera confirmação
  WeekSkeleton.tsx carregando
```

A regra que a divisão não podia quebrar: **o plano continua tendo uma fonte
só**. Todo o estado ficou no container; o que desce são dados e funções de
retorno. Dividir arquivos não pode produzir duas cópias do mesmo treino, uma
delas desatualizada.

**Conferido:** `tsc` limpo, `next build` limpo, **1.546 testes** (10 novos em
`tests/day-progress.test.ts`, incluindo o caso que importa: hoje sem registro
é previsto, ontem sem registro é sem registro). Desenho conferido a 1.240 px e
375 px com uma semana de mentira onde segunda tem corrida feita e musculação
não, terça é descanso com um pedal extra, e quarta passou em branco.

## Fase 7 — Dez correções do Sérgio ✅ (26/09)

Lista direta, depois de usar a agenda com a semana real.

**Na agenda**

- **Cada sessão é uma linha, no mesmo estilo.** A musculação aparecia como um
  rabicho cinza ("+ musculação") embaixo da corrida, sem duração — enquanto num
  dia só dela virava treino de verdade, com "50 min" ao lado. A mesma sessão não
  pode valer menos por dividir o dia. O dia agora cresce com o que tem dentro, e
  cada sessão tem a sua barra de cor, o seu nome e a sua medida.
- **O tiro tem nome curto.** "Tiros curtos 6×200 m" não cabe em 330 px, e o que
  a lista responde é "que tipo de dia é esse?". Tiro, limiar e HIIT aparecem
  pelo nome do tipo; o nome inteiro está no card, a um toque.

**Cores**

- **Musculação é azul** (`session-colors.ts`). Era cinza no mapa e roxa no card
  do Treinador — pintada à mão, na mesma cor do longão. Duas coisas diferentes
  com a mesma cor, na mesma tela.

**Botões**

- **"Mover de dia" virou botão**, com borda, em vez de um link cinza de 11 px.
  É a coisa que mais se faz nesta tela: a vida muda de dia o tempo todo.
- **"Adaptar" ficou do mesmo tamanho.** Era uma caixa da largura inteira entre
  dois links pequenos — o `AdaptSessionControl` ganhou `compact`, e na Hoje
  continua largo, que é onde ele é a ação da tela.

**Musculação**

- **Os textinhos saíram.** O bloco abria repetindo "Sessão de força · ~51 min",
  fechava com as notas do gerador e um parágrafo explicando RIR, e cada
  exercício carregava uma linha de dica. Ficou o que se usa de pé na academia:
  exercício, séries, RIR, descanso, registrar. O que é RIR está no `title` da
  etiqueta.
- **Voltou o adaptar** — e agora existe de verdade, o que nunca houve para a
  musculação. `AdaptStrengthControl` + `/api/strength/adapt` + `strength-adapt.ts`:
  - **menos tempo** (20/30/40/50 min): saem os acessórios do fim, nunca o
    composto principal, e só então caem séries. Meia hora de agachamento e
    terra é um treino; meia hora de rosca e abdominal é uma visita à academia.
  - **mais leve hoje**: uma série a menos, uma repetição a mais em reserva.
  - **"Deixar assim para sempre"** grava a duração em `strength_prefs`, e só
    vale para o tempo: "mais leve" é sobre hoje, e um dia ruim não deve mudar
    como o atleta treina.

**Comportamento**

- **Tocar no dia aberto fecha o dia.** Tinha deixado de fechar para o painel
  nunca aparecer vazio; quem quer ver a semana inteira precisa de uma saída.
- **No celular a página desce menos.** `scrollIntoView` com `block: "start"`
  levava o topo do painel ao topo da tela e passava do começo do treino; agora
  é `"nearest"` com `scroll-mt-20`, que rola o mínimo necessário.

**Conferido:** `tsc` limpo, `next build` limpo, **1.560 testes** (13 novos em
`tests/strength-adapt.test.ts`, os da agenda reescritos para as linhas por
sessão). Desenho conferido a 1.240 px e 375 px.
