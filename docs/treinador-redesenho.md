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
