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
