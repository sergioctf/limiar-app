# Nova Home e mapa de navegação

Registro de 18/09/2026. Direção discutida por Sérgio com a outra IA e revisada aqui contra o código. **Estado: aprovada e aplicada em 18/09 — a nova Home é a Início, a navegação tem seis áreas e os blocos antigos foram para as áreas do mapa (ver "Aplicado", no fim).**

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

## Aplicado (18/09/2026, depois do "perfeito, prossiga")

### A Home
- `/` é a nova Home (`HomeContent.tsx`); `/hoje` redireciona para `/`.
- Mantém o que a antiga fazia sem aparecer: sincronização automática do Strava e do relógio, boas-vindas e checklist de quem está começando, puxar para atualizar, lembrete de notificações e "Strava sincronizado em…".
- **Calorias** ficam na Home e agora abrem o detalhe por treino (medido × estimado) ao tocar.
- O **alerta de sobrecarga** ocupa o espaço "Merece atenção" com prioridade sobre tudo.
- A Home deixou de carregar **todas** as corridas com o JSON bruto do Strava (dívida A6): carrega a semana e seis meses de corridas com as colunas necessárias.
- Removidos por ficarem sem uso: `DashboardContent.tsx`, `TodayCard.tsx`, `WeeklyPlanSummaryCard.tsx`.

### Para onde foi cada bloco
| Bloco da Home antiga | Agora |
|---|---|
| Carga de treino (condicionamento, fadiga e forma) | **Saúde** → "Forma e carga" (90 dias, corrida e academia; calculada no mesmo carregador da recuperação) |
| Ciclo de 4 semanas e teste de calibração | **Treinador**, logo abaixo do plano da semana (o aviso de calibração só aparece quando há teste e ele venceu) |
| Recordes, conquistas, meta de prova, "Seus números" | **Histórico → Gráficos**, no topo (`HistoryHighlights.tsx`) |
| Volume das últimas 12 semanas | Já existia em Gráficos — retirado da Home sem perda |
| Atividade recente | Substituída pela faixa da semana na Home e pela lista do Histórico |
| Resumo do plano da semana | Substituído pela faixa da semana (planejado apagado) e pelo Treinador |

### Navegação
- `nav-areas.ts`: **uma definição** das seis áreas, lida pela barra lateral, pela barra de baixo e pelas abas das áreas.
- **Computador:** Hoje · Treinador · Histórico · Saúde · Amigos · Configurações.
- **Celular:** barra de baixo com Hoje · Treinador · Histórico · Saúde · Amigos (acabou o "Mais", onde Saúde e Amigos ficavam escondidos) e **Configurações sempre no topo** (`MobileTopBar`).
- **Abas das áreas** (`AreaTabs`): Treinador = Plano · Provas · Metas; Histórico = Corridas · Calendário · Gráficos. Aparecem só nas páginas da área (não no detalhe de uma corrida). Cada área tem uma largura única, para as abas alinharem com o conteúdo (Provas passou de 4xl para 3xl, como Plano e Metas).

### Linguagem visual (primeira passada)
- **Laranja é ação.** As abas de navegação de página (Treinador, Gráficos, Metas, "Esta semana / Próxima") passaram a marcar a aba ativa em cinza neutro, como as abas de área; escolhas em formulários (dias, experiência…) continuam em laranja, porque ali a cor marca a opção escolhida.
- Menos caixas dentro de caixas na Home; uma ação principal ("Ver treino"); detalhes sob demanda (dia da semana, calorias, recuperação → Saúde).

### Verificação em produção (18/09)
- Home em `/`: "Boa tarde, Sérgio · Sexta, 18 de setembro", Descanso, Recuperação 60, semana 3h21 em 4 sessões, calorias 1.590 kcal nos treinos.
- Menu lateral com as seis áreas; a área certa acesa em cada página.
- Treinador: abas Plano · Provas · Metas, alinhadas ao conteúdo (768 px) nas três páginas. Histórico: Corridas · Calendário · Gráficos, alinhadas (896 px) nas três.
- Gráficos: "Seus números" (69 corridas, 552 km, 16 dias treinados em 30) e recordes pessoais.
- Saúde: "Forma e carga" (condicionamento 29, fadiga 27, forma +2).
- Celular (390 px, com a sessão do Sérgio): barra de baixo Hoje · Treinador · Histórico · Saúde · Amigos, engrenagem de Configurações no topo, sem rolagem lateral.
- Suíte: 76 arquivos, 1.407 testes, `tsc` limpo.

### O que fica para a próxima passada
- **Uma lista única de atividades no Histórico.** "Corridas" ainda lista só corridas; outros esportes aparecem no Calendário. O caminho único por esporte já existe na Home; falta no Histórico.
- **Revisão visual das telas internas** (Treinador, Saúde, Gráficos) com as mesmas regras: uma ação principal, menos cartões competindo, estados vazios e carregamentos.
- Os cabeçalhos de página ainda variam ("19 relatório(s) · 5 ciclo(s)…" no Treinador), e a distância total em Gráficos usa ponto em vez de vírgula.

## Ajustes pedidos por Sérgio depois de usar (18/09)

> *"na sua semana seria bom mostrar o que não foi feito mas estava previsto também, trocar esses emojis por algo mais clean (mas manter a parte visual), deixar mais visual e grande os big numbers, dias treinados / de tantos previstos, status de recuperação com a bolinha de 0-100, volte corrida, musculação e calorias para o visual maior; arrumar calendário que ficou ruim no celular; em saúde colocar o que compõe o score em algo que fecha e abre"*

### Home
- **Números grandes:** anel com **dias treinados / dias previstos** (ex.: 3/6), **tempo em atividades** em destaque e "3 dias treinados de 6 previstos · 4 sessões".
- **Faixa da semana com três estados**, um círculo por sessão: **preenchido = feito**, **contorno = previsto**, **tracejado âmbar = não feito** (o que estava previsto e não aconteceu agora aparece — no dia e na lista do dia selecionado, como "não feito"). Legenda discreta abaixo.
- **Ícones de linha** (`SportGlyph`: corrida, musculação, pedal, natação, caminhada, trilha, yoga…) no lugar dos emojis, na Home, no calendário, no detalhe do dia e no Histórico.
- **Blocos grandes** de novo: Corrida (sessões + km), Musculação (sessões + tempo), cada outro esporte feito, e **Calorias** (toque = detalhe por treino). Corrida e musculação aparecem sempre que fazem parte do plano, mesmo com zero.
- **Recuperação com o anel de 0 a 100**, colorido pelo veredito, levando a Saúde. Voltaram também o convite ao check-in da manhã quando não há relógio, o aviso de teste de calibração e a nota "Trocado hoje · era …", que o protótipo tinha deixado de fora.
- **Alerta de sobrecarga só com sinal de carga.** Em produção ele aparecia em vermelho ("sinais de sobrecarga") com forma +1 e ACWR 0,97, porque o único sinal era sono de 5,5 h — assunto que o anel e a pergunta antes do treino já tratam. Agora só ocupa "Merece atenção" com um sinal de carga (TSB, ACWR, sequência sem descanso, salto de volume).
- **Contagem animada corrigida:** o primeiro quadro podia ter tempo negativo e mostrava "-0" / "-87" (bug antigo do `CountUp`, também do dashboard anterior). Agora o número começa já no valor real e só anima quando o navegador anima; sem quadros de animação (aba em segundo plano, economia de bateria), o número certo fica na tela.

### Calendário no celular
- Cabeçalho que cabe: título encolhe, setas com área de toque de 44 px, "Registrar treino" vira só o ícone.
- **Semana começando na segunda**, como o resto do app (antes começava no domingo).
- Ícones de esporte no lugar de bolinhas de sete cores; a legenda de cores saiu.
- Células mais baixas no celular; datas "18/09" em vez de "2026-09-18"; km com vírgula.

### Saúde
- **"O que compõe o score"** virou uma seção que abre e fecha, **fechada por padrão**.
- "Forma e carga" sem o subtítulo repetido.

## Próximos pontos aplicados (18/09)

### Histórico: uma lista para todos os esportes
- A aba **"Corridas" virou "Atividades"**: corridas e todas as outras atividades na mesma lista, com filtro por esporte (**Tudo · Corrida · Musculação · …**, só os esportes que existem no histórico).
- Em **Corrida**, continuam os filtros de tipo, fonte, mês e ordenação, e os números de corrida (pace médio, FC média). Em outro esporte: sessões e tempo.
- **Cada atividade tem sua própria página** (`/activities/[id]`), como uma corrida: duração, distância, calorias (medidas ou estimadas), FC, origem, "Ver no calendário" e excluir (com confirmação; exclusão reversível no banco, como no calendário).
- Os **blocos da Home abrem o Histórico no esporte**: tocar em "Musculação" abre `/runs?sport=musculacao`.

### Revisão visual das telas internas
- Treinador: saiu o subtítulo "19 relatório(s) · 5 ciclo(s) · 1 teste(s)".
- Distâncias com **vírgula** no app inteiro (`formatDistanceKm`), inclusive "Seus números" em Gráficos.

### O que ainda fica
- Revisão visual mais profunda do Treinador (duas camadas de abas: área e "Zonas & Plano · Testes · Perfil IA · Relatórios").
- O alerta de sobrecarga ainda considera só corridas na carga (`detectOvertraining`), enquanto Saúde e a recuperação já somam academia.

### Verificação em produção (18/09, noite)
- Home: anel de recuperação 60 · "Treine com margem"; semana 3/6 dias · 3h21 · 4 sessões; quarta com a corrida feita e a musculação do dia não feita (tracejado), quinta com a musculação não feita, sábado e domingo previstos; blocos Corrida 2 (14 km), Musculação 2 (1h51), Calorias 1.590 kcal · treinos; o alerta de sobrecarga (só sono) não aparece mais.
- Histórico → Atividades: "133 atividades · 552,3 km de corrida", filtros Tudo · Corrida · Musculação · Ciclismo;  abre em Musculação (63 atividades); a página de uma musculação mostra 59 min, 322 kcal, FC 116, "Ver no calendário" e "Excluir"; o menu acende Histórico também nela.
- Calendário em 390 px: sem rolagem lateral, semana começando na segunda, ícones nos dias, "+" compacto, "29,9 km".
- Saúde: "O que compõe o score" fechado, com o resumo "5 sinais".
- Deploy: a fila da Vercel travou duas vezes num deploy "Queued"; os presos foram **cancelados** pela API (o mesmo botão do painel, nada apagado) e o seguinte subiu normalmente.
