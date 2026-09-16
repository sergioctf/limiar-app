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
