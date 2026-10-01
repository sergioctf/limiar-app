# O primeiro acesso — 01/10/2026

> "Tive um usuário novo que foi entrar essa semana e está tudo muito confuso.
> O app tem muita coisa, está pouco intuitivo." — Sérgio, 29/09

## O que existia

Quinze telas entre o cadastro e o app: uma de boas-vindas, **nove cenas** de
demonstração e **seis perguntas**, alternando — cena, pergunta, cena, pergunta.

A ideia era defensável: cada pergunta chega logo depois da tela que a justifica,
então responder parece consequência e não papelada. O problema é o tamanho e a
ordem. Quinze telas antes do primeiro treino é um folheto, e a sequência era a
da vitrine (amigos → corrida → musculação → provas), não a do que o motor
precisa para montar a primeira semana.

E havia **três implementações de tutorial** no código ao mesmo tempo: o
`OnboardingTour` original (já sem uso), este fluxo, e a lista de configuração do
painel.

## O que passou a existir

**Seis telas, quatro perguntas, na ordem em que o plano depende delas:**

| | Pergunta | Por que aqui |
|---|---|---|
| 1 | Boas-vindas | Diz o tamanho do que vem: quatro perguntas, um minuto |
| 2 | **Como você se chama** | Nome e @ — e evita que o `IdentityGate` interrompa logo depois, uma segunda vez |
| 3 | **De onde vêm suas corridas** | Strava conectado, ou registro na mão: é daqui que sai o volume honesto |
| 4 | **Que dias você corre** | A pergunta que mais muda o plano — decide onde caem longão e treino forte |
| 5 | **Quando você faz o teste de 3 km** | Dá ritmo e faixa de FC ao plano. Agora dá para **marcar** o dia (29/09) em vez de só registrar depois |
| 6 | Pronto | A semana está montada, e o resto fica na lista do painel |

Saíram do primeiro acesso: **musculação**, **prova-alvo** e **notificações**.
Nenhuma das três é necessária para a primeira semana existir, e cada uma tem
lugar natural no app depois. Continuam na lista de configuração.

**A vitrine virou escolha.** As nove cenas continuam — montadas com os
componentes do próprio app, nunca capturas de tela — em `TOUR_STEPS`, e abrem
por "Conheça o app" (Configurações, ou o botão na última tela do primeiro
acesso). Não são mais pedágio.

O orçamento está no teste, não no comentário: `tests/onboarding-flow.test.ts`
reprova mais de quatro perguntas, mais de seis telas, qualquer cena no meio do
caminho, e qualquer uma das três perguntas adiadas voltando.

## Depois do primeiro acesso

**A lista do painel mostra um passo de cada vez.** Ela listava os seis
simultaneamente, com barra de progresso e um botão de assistente — para quem
está perdido, seis caminhos ao mesmo tempo é a mesma confusão da tela cheia, em
miniatura. Agora: o **próximo passo** em destaque, com o botão que leva a ele, e
um "ver os outros" para quem quiser.

**O teste marcado deixa de ser cobrança.** Quem já escolheu o dia vê "marcado
para sex, 3 de out" em vez do mesmo pedido de novo.

**A Home esconde o que ainda não existe.** Sem nenhuma corrida nem atividade,
"Minha semana" (um anel de zeros) e o bloco de histórico, recordes e conquistas
não aparecem. Um zero grande na tela não é informação: é o app ocupando espaço
para avisar que você ainda não fez nada. É o mesmo princípio da Saúde bloqueada
sem relógio (29/09).

## Faxina

`OnboardingTour.tsx` (193 linhas) foi apagado — não era renderizado em lugar
nenhum desde a chegada deste fluxo; só a chave de "já vi" era importada dele.
A chave mudou de casa para `lib/onboarding-flow.ts` **com o mesmo valor**
(`limiar_onboarded`): trocá-la faria o fluxo reaparecer para todo mundo que já
passou por ele.

## Conferido

`tsc` limpo, `next build` limpo, **1.599 testes**. As seis telas percorridas uma
a uma no celular (375 px): identidade salva, Strava, dias da semana, teste com
seis dias para escolher, e a tela final com a oferta do tour.

## O que não foi feito, e por quê

- **Esconder abas da navegação** para quem não tem dado: é a próxima camada
  natural do mesmo princípio, mas mexe no mapa do app inteiro e merece decisão
  explícita do Sérgio, não iniciativa minha.
- **Primeira semana sem teste:** o plano nasce sem ritmos se a pessoa pular o
  passo 5. Já era assim; o que mudou é que agora dá para marcar em vez de adiar
  indefinidamente.

---

# As abas sem dado também somem (01/10, parte 2)

Ficou de fora da primeira leva por ser decisão do Sérgio, não minha. Ele
respondeu: *"pode esconder as abas sem dado também."*

## A regra

`src/lib/nav-visibility.ts`, com três princípios guiando o que **nunca** some:

1. **O app é o treino.** Hoje, Treinador e Configurações aparecem sempre — e,
   dentro do Treinador, Plano e Calibração, que é por onde se começa.
2. **Nada vira beco sem saída.** Uma área só é escondida quando existe outro
   caminho para criar o dado que a destrava: corrida entra pelo Strava ou pelo
   "+" da Hoje, prova e meta vivem dentro do Treinador, relógio se conecta nas
   Configurações.
3. **Esconder é promessa, não sumiço.** Ver abaixo.

| Área / aba | Aparece quando |
|---|---|
| Hoje · Treinador · Configurações | sempre |
| Histórico | ≥1 corrida ou atividade |
| Gráficos (dentro do Histórico) | ≥3 corridas — com menos, a linha não diz nada |
| Saúde | Garmin, Whoop ou Saúde da Apple conectados |
| Amigos | ≥1 amizade ou ≥1 corrida |
| Provas · Metas (dentro do Treinador) | ≥1 prova/meta ou ≥1 corrida |

Uma barra de abas com uma aba só não é barra: `AreaTabs` se esconde inteira
nesse caso.

## A metade honesta

Uma porta que some sem explicação é pior do que uma porta vazia: a pessoa não
sabe se o recurso não existe, se ela não tem acesso ou se quebrou. Então o que
sai do menu entra nas Configurações, dito como promessa e continuando clicável:

> **Gráficos** — Aparecem a partir de 3 corridas: com menos, a linha não diz nada.
> **Saúde** — Precisa de um relógio conectado: Garmin, Whoop ou Saúde da Apple.

## Como é lido

`loadNavData` faz oito contagens `head: true` em paralelo (o Postgres devolve só
o total) no `AppShell`, uma vez por página. Falha em silêncio mostrando tudo:
esconder por engano é pior do que mostrar demais.

## O que isso dá, na prática

| | Menu |
|---|---|
| Conta nova | **Hoje · Treinador · Configurações** |
| Depois da primeira corrida | + Histórico, Amigos, Provas, Metas |
| Com relógio | + Saúde |

Conferido contra os oito atletas reais: ninguém perde nada que esteja usando.
Os cinco sem relógio perdem a aba Saúde — que para eles já era a tela bloqueada
de 29/09. O único sem corridas (3 amigos) mantém Amigos, por causa deles.

**1.614 testes** (15 novos em `tests/nav-visibility.test.ts`, incluindo os dois
que protegem as promessas: o essencial nunca some, e tudo que foi escondido
aparece explicado).
