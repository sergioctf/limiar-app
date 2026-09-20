# Plano — do que arrumar agora à IA central

Registro de 20/09/2026, a partir da revisão do Sérgio. Ordem pensada para entregar valor cedo e deixar a mudança grande (a IA central) com fundação sólida.

> A lógica que guia tudo, nas palavras dele: **"dados e funcionalidades específicas ficam nas respectivas abas; inteligência, interpretação, cruzamento de dados e aconselhamento ficam centralizados na IA."**

## Fase 1 — Urgente e rápido ✅ *feita em 20/09*

### 1.1 Notificação de amigos para qualquer esporte 🐞 ✅
**O que estava errado:** no webhook do Strava, `notifyFriendsOfWorkout` só era chamado no ramo das atividades que **não** são corrida. Corrida entrava por outro caminho e não avisava ninguém — e a sincronização manual (`/api/strava/sync`) e a automática (`/api/cron/strava-sync`) não avisavam para nenhum esporte. O esporte em torno do qual o app é construído era o único que nunca chegava a um amigo.

**O que foi feito:** o aviso passou a sair de **todos os caminhos de entrada** — webhook (corrida e demais esportes), sincronização manual, rede de segurança noturna e corrida registrada à mão (pelo `/api/runs/[id]/analyze`, o único momento no servidor que sabe que ela existe; o aviso vai **antes** da chamada de IA, para uma falha da Groq não decidir se o amigo fica sabendo).

Uma função só (`workoutOf`) monta o texto **pelo esporte**, não pelo título da linha: "Corrida · 8,2 km", "Musculação · 52 min", "Ciclismo · 32,0 km". O Strava escreve "Afternoon Run", que chega em inglês na tela de bloqueio de um amigo brasileiro, e "Peito e tríceps" não diz nada para ninguém além do atleta. Nome cru só como último recurso, para esporte que a taxonomia não classifica.

As três regras antigas continuam de pé: só amizade aceita, respeita o silenciado, **no máximo um aviso por amigo por dia** — é isso que impede o treino que chega por dois caminhos de tocar duas vezes. Só o dia de hoje vira notificação: a primeira conexão com o Strava importa meses de histórico, e ninguém quer ser aplaudido em setembro por uma corrida de março.

*Testes:* 11 novos, incluindo corrida/musculação/pedal chegando ao amigo, o mesmo treino por dois caminhos avisando uma vez só, e a corrida de ontem importada hoje que não vira notificação.

### 1.2 Tela Hoje: hierarquia e alertas no lugar certo ✅
Ordem nova:

```
Bom dia, Sérgio · domingo, 20 de setembro
[alertas: notificações bloqueadas, sobrecarga]   ← subiram para o topo
Como você está hoje   → anel 0–100, veredito, pergunta antes do treino
Treino de hoje        → sessões, adaptar, ação principal, realizado
Minha semana          → sessões, dias, modalidades, calorias
```

- Os alertas saíram do fim da página e vieram para o topo, acima de tudo: um aviso no pé de uma página que rola é um aviso que ninguém lê.
- **"Como você está hoje" virou bloco próprio** — anel 0–100, veredito, base do número, a pergunta antes da sessão exigente e a troca que ela pode gerar, e o convite ao check-in quando falta dado. O bloco só aparece quando tem o que dizer; um card vazio custa uma tela e não informa nada.

### 1.3 Minha semana: sessões no círculo, dias ao lado ✅
- **Círculo: "X de Y sessões"** — a métrica principal.
- **Onde estavam as horas: "X/Y dias treinados"**. Dia e sessão não são a mesma coisa: a segunda-feira do plano pede corrida *e* academia — cinco dias previstos, seis sessões previstas.
- As horas viraram detalhe, na mesma linha de "N sessões de M previstas".
- **Feito · previsto · não feito** continua exatamente como estava.

### 1.4 Modalidades dinâmicas ✅
As caixinhas passaram a ser **todo esporte com sessão registrada na semana, mais todo esporte que o plano pediu** (mesmo com zero ainda), mais calorias. Antes eram corrida e musculação fixas: um nadador via "Corrida 0" toda segunda, e quem só faz academia via um esporte que não pratica.

### 1.5 "Treine com margem" — dizer melhor ✅
Cada frase agora nomeia a sessão de que está falando, em vez de usar jargão de treinador:

| Antes | Agora |
|---|---|
| Treine com margem | **Dá para treinar, sem forçar** (dia leve) / **Dá para fazer o treino forte, sem exagerar** (dia forte) |
| Recuperação baixa — dá para aliviar | Recuperação baixa: hoje pede um treino mais leve |
| Recuperação baixa — vá bem leve | Recuperação baixa: vá bem leve hoje |
| Pronto para o treino forte · Corpo recuperado | iguais — já diziam o que fazer |

## Fase 2 — A IA central (a mudança grande)

A regra do app continua valendo (ADR-02): **o motor calcula, a IA narra.** A IA central não inventa número: ela recebe um dossiê já calculado e responde com ele. Quando não houver dado, ela diz que não há.

### 2.1 Fundação: o dossiê do atleta
Um leitor determinístico que junta, sob demanda, o que já existe espalhado:

| Área | De onde vem (já pronto) |
|---|---|
| Hoje e a semana | `today.ts`, `day-status.ts`, `week-movement.ts`, plano da semana |
| Fechamento da semana | `week-recap.ts` ("Sua semana") |
| Evolução | `progress-reading.ts` ("O que está melhorando") |
| Recuperação e saúde | `recovery-today.ts`, `readiness.ts`, `health-view.ts` (sono, HRV, FC repouso) |
| Carga e forma | `training-load.ts` (CTL/ATL/TSB, com academia) |
| Ritmos e zonas | `performance.ts` (VDOT, zonas de FC) |
| Adaptações e agenda | `session-adapt.ts`, `week-fit.ts`, `day-patterns.ts` |
| Tênis | `shoes.ts` |
| Provas e metas | `races`, `goals`, `target-comparison.ts`, `smart-goals.ts` |
| Adesão | `plan-adherence.ts` |

Sai daqui um **JSON de contexto** (números, datas e frases já escritas pelo motor), que serve tanto para responder sem IA quanto para alimentar o modelo.

### 2.2 O botão e a tela
- **Botão flutuante circular laranja**, canto inferior direito, acima da barra de baixo (alinhado a "Amigos"), presente em todas as abas. Cuidado para não cobrir ações existentes (o "+" da Home, listas longas).
- A tela abre com **sugestões clicáveis** e um **campo aberto**.

### 2.3 Sugestões = respostas instantâneas
Cada sugestão devolve uma análise **determinística**, sem chamar o modelo: sem custo, sem espera e sem risco de número errado.

Sua semana · O que está melhorando · Minha recuperação · Minha saúde hoje · Últimos 7 dias · Meus ritmos e zonas · Minha carga de treino · Meu sono · Status dos meus tênis · Previsão de provas · Objetivo dos próximos treinos · Algum alerta?

### 2.4 Campo aberto
O modelo recebe o dossiê e a pergunta, e responde **só com aquilo**. Toda resposta mostra de onde vieram os números ("semana de 14/09, plano do Treinador, check-in de 16/09"). Perguntas fora do que o app sabe recebem "não tenho esse dado", não um chute.

### 2.5 O que decidir na entrega
- **Conversa gravada ou não:** proposta é gravar (com data) para dar continuidade e permitir auditar o que a IA disse, com opção de apagar. Exige migration.
- **Limite de uso:** as sugestões não consomem API; o campo aberto sim. Vale um limite por dia para não estourar custo.
- **Latência:** resposta instantânea para sugestões; o campo aberto mostra estado de carregamento honesto.

## Fase 3 — Limpar as telas com a IA no lugar

- **Treinador:** saem "Sua semana" (devolutiva) e o resumo de IA — viram sugestões da IA. Ficam plano, adaptações, agenda, conselheiro e previsão de provas.
- **Histórico:** sai "O que está melhorando para você" — vira sugestão da IA. O Histórico fica só o histórico.
- **Metas:** a interpretação inteligente passa a conversar com a IA central.

## Fase 4 — Depois (registrado, fora desta rodada)

- **Saúde:** reorganizar o topo em categorias (energia/alimentação · sono · forma e carga · recuperação). O próprio Sérgio pediu para deixar para depois.
- **Treinador:** revisão visual (hoje tem duas camadas de abas).
- **Sobrecarga:** a carga do alerta ainda só conta corrida, enquanto Saúde já soma academia.
- **Card de adesão:** dívidas A11 (mostra a semana seguinte como atual) e A12 (musculação do dia conta como perdida antes de o dia acabar).
- **Push do repositório e falhas de segurança** (policy de `profiles`, webhook do Strava forjado, auto-aceite de amizade, cache offline sem isolamento) — seguem na fila, esperando o "vamos".

## Ordem de execução

1. ~~**Fase 1 inteira** numa entrega (bug das notificações primeiro, depois a Home).~~ ✅ 20/09
2. **Fase 2.1 + 2.2 + 2.3** — a IA já útil no primeiro dia, sem depender do modelo.
3. **Fase 2.4** — campo aberto.
4. **Fase 3** — limpeza das telas, só depois de a IA cobrir o que sai delas.
5. **Fase 4** — conforme a prioridade do Sérgio.

## O que mudou no código na Fase 1

| Arquivo | O quê |
|---|---|
| `src/lib/friend-notify.ts` | `workoutOf()` — o texto do aviso pelo esporte |
| `src/app/api/strava/webhook/route.ts` | corrida passa a avisar os amigos |
| `src/app/api/strava/sync/route.ts` | sincronização manual avisa, corrida e demais |
| `src/app/api/cron/strava-sync/route.ts` | rede de segurança noturna avisa |
| `src/app/api/runs/[id]/analyze/route.ts` | corrida registrada à mão avisa |
| `src/lib/week-movement.ts` | `plannedSessions` por dia e na semana |
| `src/lib/recovery-today.ts` | frases de disposição reescritas |
| `src/components/home/HomeContent.tsx` | hierarquia, alertas no topo, anel de sessões, caixinhas dinâmicas |

Testes: 1.421 passando (11 novos em `tests/friend-notify.test.ts`, 1 em `tests/week-movement.test.ts`).
