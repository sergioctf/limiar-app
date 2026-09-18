# Nova Home e mapa de navegação

Registro de 18/09/2026. Direção discutida por Sérgio com a outra IA e revisada aqui contra o código. **Estado: protótipo no ar em `/hoje`, ao lado da Home atual; nada no menu mudou ainda.**

## O que foi decidido

- **Home = "Hoje".** O treino do dia é o protagonista; abaixo, a semana com **todas as atividades registradas** (só atividades registradas — sem passos nem caminhadas do cotidiano); por último, no máximo **uma** coisa que merece atenção.
- **Calorias ficam na Home** (Sérgio, 18/09): o gasto ativo do **relógio (Garmin)** no dia em que ele chegar; senão, as calorias dos **treinos (Strava)**. A linha diz a origem.
- **Distância por modalidade**, nunca somada entre esportes; **tempo** é a medida comum.
- **Sem percentual de cumprimento na Home.** O planejado aparece como marca discreta; dia passado não vira dívida. A adesão em % continua no Treinador.
- **Recuperação dentro do bloco do treino**, em uma linha (o detalhe fica em Saúde). A pergunta do Treinador (ponto 4) aparece ali quando os sinais justificam.

## Mapa de navegação (decisão do Sérgio)

| Área | Função | O que passa a morar ali |
|---|---|---|
| **Hoje** | orientação do dia e da semana | treino de hoje (todas as sessões), faixa da semana com todos os esportes, calorias, um item de atenção |
| **Treinador** | planejar, adaptar, conversar | plano semanal, agenda da semana, adaptações, devolutiva semanal, conselheiro, testes de 3 km, plano de longo prazo, **Provas** e **Metas** (hoje separados), configuração do treino |
| **Histórico** | o que foi feito e a evolução | **Corridas + Calendário** (todas as atividades, com o mesmo caminho para qualquer esporte), **Gráficos**, "O que está melhorando", volume, recordes, conquistas e totais (hoje na Home) |
| **Saúde** | aprofundar sono, recuperação e tendências | recuperação, sono, vitais, check-in da manhã, **carga e forma** (hoje na Home), energia detalhada |
| **Amigos** | social | área própria, **com mais destaque** que hoje |
| **Configurações** | conta, integrações, preferências | área própria, **com mais destaque** que hoje |

Proposta de navegação (para aprovar junto com o protótipo): no celular, barra inferior com **Hoje · Treinador · Histórico · Saúde · Amigos**, e **Configurações** fixa no topo (em vez de escondida em "Mais"). No computador, a mesma ordem na barra lateral.

## O que foi corrigido antes do visual

A outra IA apontou três problemas; os três foram conferidos no código, e havia um quarto:

1. **A semana privilegiava corrida.** O anel era km corridos ÷ planejados, e as outras modalidades passavam por `slice(0, 1)` — só uma aparecia (o comentário no código dizia o contrário). → No protótipo, todas as modalidades, com tempo e distância próprios.
2. **"Treino feito" dependia de corrida.** Dia só de musculação nunca terminava; dia de corrida + musculação terminava depois da corrida. → **Corrigido no app inteiro.**
3. **Caminhos diferentes por esporte** (corrida → detalhe; outros → calendário). → No protótipo, todo dia abre as atividades logo abaixo da faixa, qualquer esporte.
4. **Três definições de "feito"** (card Hoje, recuperação do dia, adesão). → **Uma só**: `src/lib/day-status.ts`, sessão por sessão (corrida, musculação, pedal…), usada pelo card Hoje atual, pela recuperação do dia, pela adesão e pela nova Home. As regras de musculação da adesão e do resto eram equivalentes, então nenhum número antigo muda.

## O protótipo (`/hoje`)

- **Hoje:** as sessões do dia com estado (*feito* / *previsto*); descanso ocupa o espaço naturalmente; uma linha de recuperação que leva a Saúde; a pergunta do Treinador quando houver; **uma ação principal** ("Ver treino") e "Adaptar" como secundária; depois do treino, o realizado com números e "Ver corrida e feedback"; "Amanhã: …".
- **Sua semana:** faixa segunda→domingo com ícone por atividade (o previsto aparece apagado); tocar num dia mostra as atividades logo abaixo; resumo "3h21 em atividades · 4 sessões", uma linha por esporte, e calorias com a origem.
- **Merece atenção:** no máximo um item, nunca repetindo o que já é pop-up: um check-in deixado para depois, ou — segunda e terça — o fechamento da semana passada. Se não houver nada, o espaço não aparece.
- Implementação: `src/app/hoje/page.tsx`, `src/components/home/HomePreview.tsx`, `src/lib/week-movement.ts`, `src/lib/day-status.ts`.

### Verificação (18/09, produção, dados reais)

- **Hoje:** "sexta, 18 de setembro · Descanso · Recuperação 60 · Treine com margem · Amanhã: Musculação".
- **Sua semana:** "3h21 em atividades · 4 sessões"; Corrida 2 sessões · 14 km · 1h30; Musculação 2 sessões · 1h51; Calorias 1.590 kcal nos treinos (Strava) — confere com o banco (412 + 347 + 322 + 509). A musculação de quinta, não feita, **não** aparece como falta; sábado e domingo mostram o previsto apagado.
- Tocar em segunda: "Corrida matinal · 6 km · 36 min" e "Musculação · 52 min"; em sábado: "Musculação · 20 min · previsto".
- Em 390 px de largura (quadro com a sessão do Sérgio): sem rolagem horizontal.
- **Testes:** `tests/day-status.test.ts` (9) e `tests/week-movement.test.ts` (7). Suíte: 76 arquivos, 1.407 testes, `tsc` limpo.

## Próximos passos (depois da aprovação do protótipo)

1. `/hoje` substitui a Home atual; os blocos que saem (carga, volume de 12 semanas, recordes, conquistas, totais, ciclo, teste de calibração) vão para Histórico, Saúde e Treinador conforme o mapa.
2. Nova navegação (barra inferior e lateral) com as seis áreas.
3. Linguagem visual: uma ação principal por tela, menos caixas dentro de caixas, cores com significado, detalhes sob demanda, estados vazios e carregamentos.
