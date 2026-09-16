# Check-in pós-corrida

## Escopo entregue

Card na Home, antes do treino de hoje, e no detalhe de cada corrida. Duas escolhas (esforço em cinco níveis e contexto), observação opcional de até 300 caracteres, pular e editar. A Home procura corridas dos últimos sete dias, com até 20 registros, e mantém o feedback recém-salvo visível antes de oferecer o próximo check-in.

O feedback é determinístico, sem chamada a LLM. Compara distância e, em sessões contínuas com alvo disponível, pace médio. Não julga tiros pelo pace médio, não interpreta chuva/agenda/trabalho como perda de condicionamento, não recomenda compensar volume e não altera planos. FC é exibida como dado, sem inferir condicionamento a partir de uma leitura isolada. Dor tem precedência no texto de atenção.

## Banco e publicação

Aplicar `supabase/migrations/028_run_feedback.sql` ao banco do ambiente **antes** de publicar o código: sem a tabela, a API responde 503. Em produção isso já foi feito (ver Registro de aplicação).

A tabela guarda uma resposta por corrida, usuário autenticado, percepção, contexto, observação e snapshot da referência do plano ao responder. RLS exige propriedade da corrida na inserção/atualização. A API usa o cliente autenticado, filtra usuário e exclusões, valida entradas e responde com `private, no-store`. Nenhum dado subjetivo novo é enviado a provedores de IA.

## Limites explícitos

- Não gera propostas de progressão nesta etapa; elas precisam de critérios longitudinais e um fluxo de aceite próprio.
- Não substitui os outros mecanismos de geração/adaptação já existentes. O check-in ainda não entra no motor semanal.
- O vínculo com plano é conservador e baseado na data: sem comparação quando há múltiplas corridas no dia, múltiplos relatórios ou plano posterior à data da corrida. O snapshot é do momento da resposta, não prova imutável da prescrição anterior ao treino.
- Só corrida neste recorte; musculação e outras modalidades continuam nos fluxos existentes.
- Observação livre fica disponível no histórico da resposta, mas não é interpretada automaticamente.
- Sem compensação de quilometragem, diagnóstico ou inferência causal.

## Validação

Testes de avaliação cobrem ausência de percepção, clima/agenda/trabalho, dor, excesso de ritmo em treino leve, intervalados, múltiplas corridas, preservação de snapshot e entradas inválidas. Testes da API cobrem autenticação, propriedade, exclusão lógica, falhas e persistência. TypeScript e suíte existentes passam.

A prévia visual foi feita localmente com dados fictícios. Persistência real e RLS precisam ser verificadas no ambiente com a migration aplicada e sessão autenticada, antes de disponibilizar o recurso aos usuários.

## Ajustes antes de publicar (16/09/2026)

Três correções sobre a primeira implementação:

1. **A Home devolve o lugar de destaque.** O card fica acima do treino de hoje, então precisa sair quando não tem mais nada a dizer. Antes, depois de responder, ele seguia exibindo a mesma avaliação por até sete dias, acima do herói da tela. Agora a escolha do que mostrar é uma função pura (`pickFeedbackItem`): na página da corrida, aquela corrida; na Home, o check-in pendente; se não houver, a avaliação só continua enquanto é notícia (corrida de hoje ou de ontem) ou enquanto é a que acabou de ser respondida. Check-in pulado não volta a perguntar.
2. **Falta de tabela não vira erro na cara do atleta.** Se a API responder 503 (migration ainda não aplicada no ambiente), o card simplesmente não aparece, em vez de exibir uma caixa de erro acima da sessão do dia.
3. **Comentário recolocado** em `RunDetailContent`: o bloco "PRESCRIBED vs EXECUTED" descrevia o `ExecutionCard` e tinha ficado sobre o card de check-in.

## Registro de aplicação (16/09/2026)

**Banco.** Migration 028 aplicada em produção pelo SQL Editor do Supabase (projeto Limiar). Rodou em versão idempotente: `create table if not exists`, `create index if not exists` e `drop policy if exists` antes de cada `create policy`, para poder ser reexecutada em outro ambiente sem quebrar. A tabela `run_feedback` existe, com RLS ligado e as três policies.

**Publicação.** `npx vercel deploy --prod --yes` a partir de `limiar-app` (a CLI estava autenticada; o obstáculo relatado antes não se confirmou). Deploy `dpl_8xzM7FSJCtmu1WhwZhE48fv3dKsC` em `https://limiar-app.vercel.app`.

**Verificação em produção, com a sessão real do atleta:**

| O que foi testado | Resultado |
|---|---|
| `GET /api/run-feedback` na Home | 200, com a corrida de 14/09 (6,01 km) pendente e vinculada à prescrição "Rodagem leve" |
| Card na Home | Aparece acima do treino de hoje, com esforço, contexto, observação opcional e pular |
| Card no detalhe da corrida | Aparece em `/runs/89ff1d3d…` |
| `PUT` gravando (status `skipped`) | 200, linha criada com o `user_id` do atleta e o snapshot do plano |
| `PUT` em corrida de outra pessoa (UUID inexistente) | 404, nada gravado |
| `PUT` com esforço fora da faixa (9) | 400, nada gravado |
| Leitura anônima da linha (chave anon, sem sessão) | `[]` — RLS isola |
| Limpeza | A linha de teste foi apagada; o check-in de 14/09 voltou a ficar pendente para o atleta responder |

**Suíte.** 1.187 testes em 64 arquivos, todos passando, e `tsc --noEmit` limpo. Cinco testes novos cobrem a regra de qual check-in aparece.

**O que este recorte ainda não faz** (continua valendo a lista de limites acima): o check-in **não** entra no motor semanal. Hoje o volume da semana seguinte já é recalculado a partir do que foi executado (`planWeeklyVolume` + `volumeWithRatchet`), sem perguntar nada — então uma semana atrapalhada por trabalho ou chuva ainda pode reduzir o plano seguinte em silêncio. Fechar esse laço é o próximo passo.

## Segunda versão, após o primeiro uso real (16/09/2026)

Sérgio usou o check-in pela primeira vez depois de uma corrida e pediu duas mudanças.

### 1. "Difícil" não é alerta; "muito difícil" pergunta o porquê

> "Às vezes o treino foi difícil simplesmente porque ele deveria ser difícil. [...] Deixaria algum alerta ou investigação maior apenas quando a pessoa marcar como 'muito difícil'. [...] Se a pessoa indicar que o problema foi realmente o treino estar excessivamente pesado, aí sim [...] perguntar: 'Você gostaria de reduzir um pouco a carga dos próximos treinos?'. Não tomar nenhuma decisão automaticamente."

Antes, esforço "Difícil" (ou contexto "Cansaço") gerava *"Você relatou cansaço ou esforço alto…"*. Agora:

| Resposta | O que acontece |
|---|---|
| Muito leve a Difícil | Nenhum alerta. Em sessão dura (tiros, limiar, longão, teste, prova), "Difícil" recebe *"Difícil é o esperado para este tipo de sessão."* Cansaço vira apenas *"Cansaço registrado."* |
| **Muito difícil** | A segunda pergunta muda para **"O que deixou o treino muito difícil?"**: Dormi pouco · Estresse · Cansaço acumulado · Questão pessoal · Dor/incômodo · Clima · O treino estava pesado demais · Outro |
| Muito difícil + motivo externo | Registra e não muda nada: *"um dia difícil por fatores de fora do treino não significa que o treino esteja pesado demais."* |
| Muito difícil + **o treino estava pesado demais** | Terceira pergunta: **"Quer reduzir um pouco a carga dos próximos treinos?"** — *Sim, reduzir um pouco* · *Não, manter como está*. "Ver feedback" só libera depois da resposta. |
| … + **Sim** | As corridas leves, regenerativas e o longão **restantes da semana, contados a partir de hoje**, ficam ~15% mais curtos (nunca abaixo de 3 km), com estrutura e descrição recalculadas juntas (`lightenUpcomingRuns` em `plan-edit.ts`). Treinos de qualidade mantêm o formato (escalar 800 m por 0,85 daria tiros de 680 m), teste e prova nunca são tocados. A semana seguinte **não aumenta** o volume (`weekly-plan.ts` limita ao planejado da semana anterior). O card lista o que mudou. |
| … + **Não** | *"Treino pesado, plano mantido."* Nada muda. |
| Dor/incômodo (qualquer esforço) | Continua com precedência, com a orientação de avaliar antes do próximo treino. |

Pedir redução uma segunda vez (editando a resposta) não reduz de novo; e mudar a resposta depois não desfaz a redução já aplicada.

Na leitura da semana (`week-reading.ts`), dormir pouco, estresse e questão pessoal contam como **rotina** — uma semana curta por esses motivos segura o volume. O pedido de redução conta como "plano grande demais".

### 2. Pop-up na entrada, não card fixo no dashboard

> "Faria muito mais sentido como um pop-up. [...] A pessoa pode responder naquele momento ou clicar em 'Responder depois'. [...] O que eu não quero é esse feedback ficando permanentemente preso no topo do dashboard."

- **`EntryPrompt`** (Home): ao abrir o app, se existe corrida de hoje, ontem ou anteontem **sem nenhuma resposta**, abre o pop-up (folha de baixo no celular, centralizado no desktop). No máximo **um pop-up por visita**: primeiro o check-in do treino; se não houver, a pergunta sobre a semana passada.
- **"Responder depois"** grava `status = skipped` e o pop-up **nunca mais volta** para aquela corrida. Fechar tocando fora ou com Esc equivale a "Responder depois".
- **Na página da corrida** (histórico) o card continua sempre disponível: formulário se não respondeu, avaliação com "Editar respostas" se respondeu.
- A pergunta da semana, se adiada, espera no **Treinador**, ao lado do plano que ela muda (o adiamento fica no aparelho).
- Os cards fixos do topo do dashboard foram **removidos**.

### Registro de aplicação

- **Migration 030** aplicada em produção: novos valores de `context` (`sleep`, `stress`, `personal`, `session_too_hard`) e coluna `reduce_requested`.
- **Prévia visual** com dados fictícios numa página `/dev` temporária (removida antes do deploy): "Muito difícil" troca a segunda pergunta; "O treino estava pesado demais" abre a pergunta de redução; "Ver feedback" fica desabilitado até respondê-la; voltar para "Difícil" restaura a pergunta normal e limpa as respostas incompatíveis.
- **Deploys** em produção (um deles perdeu a conexão da CLI com `ENOTFOUND`, mas `vercel inspect` confirmou `Ready`).
- **Verificado em produção, sessão real:** nenhum card fixo no topo; a corrida de 16/09 (Difícil + Cansaço) mostra só *"Cansaço registrado. Os próximos treinos seguem como planejados."*; nenhum pop-up aberto porque as duas corridas da semana já estavam respondidas — ele aparece na próxima corrida.
- **Suíte:** 1.218 testes em 65 arquivos, `tsc` limpo.

### Achado no primeiro uso

A observação de Sérgio na corrida de 16/09: *"Não faço treino em ladeira. Fiz OUTRO treino, 2 km de aquecimento, 8 tiros de 400 m e 1,25 km de desaquecimento."* O plano prescreveu "Subidas 6×45 s" (o cardápio do mesociclo inclui subidas) e não há hoje como o atleta excluir um tipo de sessão. Registrado como próximo ajuste; não implementado nesta entrega.

## Terceira versão: coerência das consequências (16/09/2026)

Quatro pontos levantados na revisão com a outra IA, todos corrigidos:

1. **"Responder depois" não é "não perguntar mais".** Antes, os dois viravam `skipped` e o pop-up nunca voltava. Agora:
   - **Responder depois** → `deferred`: volta a aparecer na entrada depois de 6 horas, enquanto a corrida ainda é recente (até dois dias). Fechar o pop-up tocando fora ou com Esc também é "depois".
   - **Não quero responder** → `skipped`: não volta.
   - Nos dois casos, a página da corrida continua oferecendo o formulário.
2. **Cansaço: o que o feedback promete bate com o que a semana faz.** O check-in dizia que nada mudava, mas a leitura semanal reduzia o volume em silêncio quando a semana ficava curta por cansaço ou dor. Agora a semana **segura o volume sem aumentar e pergunta** ("Você relatou cansaço ou incômodo nesta semana. Como seguimos?" → *Foi pontual, pode manter* · *Quero uma semana mais leve*), e o feedback individual avisa isso com antecedência. Só reduz depois do "quero mais leve".
3. **Pedido de redução só é registrado se o plano mudou.** A ordem agora é: aliviar o plano → salvar a resposta → se salvar falhar, devolver o plano ao que era. Se o plano não puder ser alterado, nada é salvo e a pessoa vê o erro. Coberto por `tests/run-feedback-reduction.test.ts`.
4. **Disposição comparável com o Garmin.** Quando o número do Garmin é informado, a tela mostra também a leitura do Limiar **sem** esse número — comparar o score que já contém o Garmin com o próprio Garmin não validaria nada.

E um item novo: o check-in pergunta **o que foi feito** quando a corrida foi claramente diferente do previsto (ver `docs/adaptar-treino.md`).
