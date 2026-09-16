# Como a semana passada entra na seguinte

## O problema que isto resolve

O motor recalcula o volume a partir do que foi **executado**. Isso está certo enquanto a pessoa treina e erra no momento em que a vida atrapalha: uma semana quebrada por trabalho ou chuva voltava como um plano menor, em silêncio, como se o corpo tivesse perdido alguma coisa.

A regra que o Sérgio pediu, nas palavras dele: *"avalie o treino, dê feedback claro ao entrar no app… se fui pior ou não cumpri tudo, questionar ao usuário antes de diminuir"*, com a ressalva seguinte: *"progressões semana a semana também, nem TUDO deve ser perguntado, só é bom receber feedback, dar feedback e perguntar caso algo não esteja certo"*.

## A regra

`src/lib/week-reading.ts#readWeek` — função pura, sem IA, 13 testes.

| Situação da semana fechada | O que o motor usa como "executado" | O que o atleta vê | Pergunta? |
|---|---|---|---|
| Cumpriu ≥ 90% do previsto | o que correu | "Semana cumprida" + a progressão segue normal | não |
| Ficou abaixo e os check-ins disseram **agenda, trabalho ou clima** | **o previsto** (segura o volume) | "Semana atrapalhada pela rotina", sem compensar o que faltou | não |
| Ficou abaixo e os check-ins disseram **cansaço ou dor** | o que correu (deixa cair) | "Semana mais leve, e tudo bem" | não |
| O atleta respondeu **o plano estava grande demais** | o que correu | "Plano ajustado ao que cabe" | não |
| Ficou abaixo e **ninguém sabe por quê** | **o previsto**, uma vez | "Faltou saber o que houve" | sim, uma vez |
| Segunda semana curta seguida, ainda sem explicação | o que correu | "Plano ajustado na falta de resposta" | sim |
| Duas semanas seguradas seguidas pela rotina | o previsto | "Semana atrapalhada pela rotina" | sim: "o plano precisa mudar?" |
| Nenhum treino nesta semana nem nas 4 anteriores | o que correu (zero) | "Sem treinos registrados" | não — quem parou há um mês não precisa ser interrogado toda semana |

Dor e cansaço têm precedência sobre a rotina: se o corpo falou em alguma sessão, essa é a leitura, mesmo que outro dia tenha sido perdido por trabalho. A resposta do atleta tem precedência sobre os check-ins.

## Onde aparece

- **Home:** o card "SEU TREINADOR · SEMANA PASSADA" só aparece quando existe pergunta. Uma toque em uma de três opções responde, e a confirmação diz o que mudou (inclusive quantos km ficou a próxima semana).
- **Treinador:** dentro do card do plano, uma linha explica como a semana anterior entrou nesta — só quando a semana ficou abaixo do previsto. É o "dar feedback" sem virar mais uma notificação.

## Motor

`ensureWeeklyPlan` lê a semana fechada (`readPreviousWeek`) e passa `creditedKm` no lugar do executado para `volumeWithRatchet`. Nada mais mudou: a progressão de 5% (10% com prova marcada), o teto de +8 km, a semana de recuperação do mesociclo e a trava de semana em andamento continuam iguais.

Consequência prática: segurar o volume significa **manter** o que estava planejado, nunca aumentar por causa de uma semana perdida, e nunca pedir compensação dos km que faltaram.

## Banco

`supabase/migrations/029_week_feedback.sql`: uma linha por atleta por semana (`user_id`, `week_start`, `reason` em `life|body|too_much`, `note`, `created_at`), RLS com leitura, inserção e atualização apenas do dono. A rota aceita responder **somente** a semana que o treinador perguntou.

## O que isto não faz

- Não reescreve a semana em andamento. A resposta vale para a próxima — e a confirmação na tela diz isso.
- Não gera proposta de aumento: a progressão semana a semana continua automática, como já era.
- Não usa IA em nenhum ponto.
- Não interpreta a observação livre do check-in.
- Só corrida. Musculação e outros esportes ainda não entram na carga (dívida A8 do handoff).

## Registro de aplicação (16/09/2026)

**Banco.** Migration 029 aplicada em produção pelo SQL Editor do Supabase ("Success. No rows returned"). Escrita idempotente, como a 028.

**Publicação.** `npx vercel deploy --prod --yes` (a primeira tentativa caiu com `ECONNRESET` de rede; a segunda publicou). Deploy `limiar-cktigvt4u`.

**Ensaio com dados reais antes de publicar.** Rodei a regra contra os sete atletas do banco por um script sonda (apagado em seguida). Resultado: cinco receberiam a pergunta, um foi silenciado pela guarda de inatividade e um estava com a semana cumprida. Foi esse ensaio que revelou a necessidade da guarda — sem ela, quem parou de treinar há meses seria interrogado toda semana.

**Verificação em produção, com a sessão real do atleta:**

| O que foi testado | Resultado |
|---|---|
| `GET /api/coach/week-answer` | 200, leitura da semana de 07/09: "Plano ajustado na falta de resposta", `creditedKm` 0, pergunta "Sua semana ficou abaixo do previsto. O que houve?" |
| Card na Home | Aparece abaixo do check-in, com as três opções |
| `POST` com semana diferente da perguntada | 400, nada gravado |
| `POST` com motivo fora da lista | 400, nada gravado |
| `POST` sem corpo | 400, nada gravado |

A resposta em si não foi dada por mim: a leitura da semana é do atleta. O card está esperando um toque.

**Suíte.** 1.200 testes, todos passando, e `tsc --noEmit` limpo.
