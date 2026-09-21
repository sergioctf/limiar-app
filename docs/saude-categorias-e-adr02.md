# Saúde em categorias, e a IA fora do plano (21/09/2026)

Dois itens da fila: a reorganização da Saúde, que o Sérgio vinha adiando desde 20/09, e a dívida **A2** — o ajuste proativo por IA.

## Saúde: quatro categorias em vez de nove seções iguais

> Sérgio, 20/09: *"em saúde, reorganizar o topo em categorias — energia/alimentação, sono, forma e carga, recuperação."*

A tela respondia bem a **uma** pergunta ("estou recuperado?") e depois virava uma rolagem plana de nove seções do mesmo tamanho: vitais, carga × recuperação, forma, sono, o que compõe o score, energia, monitor, corpo, dispositivos. Quem abre a Saúde às 6h30 não quer nove respostas iguais — quer saber **qual das quatro** merece atenção hoje.

O topo agora é um índice de quatro números, um por categoria, cada um levando à sua seção:

| | O número | Cor |
|---|---|---|
| **Recuperação** | score /100 | veredito do dia |
| **Sono** | média da semana, em horas | ≥7 h verde · ≥6 h âmbar · abaixo, vermelho |
| **Forma** | TSB com sinal | `toneForTsb`, a mesma régua do resto do app |
| **Energia** | alvo calórico do dia | neutra — alvo não é nota |

**É um índice, não um resumo.** Nenhum número novo nasce ali: todos vêm da seção que o toque abre. E o resto da tela foi agrupado atrás deles — "Corpo" (composição e suplementos) passou para dentro de *Energia e alimentação*, que é do que ele fala. Monitor do relógio e Dispositivos continuam por último: são configurados uma vez e esquecidos, que é como uma conexão deve parecer.

## A2 — a IA não reescreve mais o plano

O botão "Ajustar semana" mandava a semana inteira para um modelo de linguagem, que devolvia os dias de hoje em diante **reescritos**, e o app salvava direto. Três problemas, em ordem de gravidade:

1. **Violava a ADR-02.** Quem prescreve treino é o motor.
2. **O plano voltava mais pobre do que saiu.** Os dias reescritos perdiam a `structure` — as séries, com intensidade e faixa de FC — e a musculação do dia. Sem ninguém perceber.
3. **Salvava sem confirmar.** A ADR-05 diz o contrário: propõe, o atleta confirma.

### O que entrou no lugar

`fitWeek`, o motor determinístico que já reorganiza a semana quando o atleta declara a agenda. Aqui a "agenda" são **os dias que sobraram** (`remainingDays`, novo) — ele não declarou nada, só perdeu um treino.

O que o motor garante, e o modelo não garantia:

- protege longão → treino forte → rodagem, nessa ordem;
- nunca empilha dois dias fortes seguidos — prefere descartar a sessão;
- move a sessão **inteira**: estrutura, ritmo, tag de qualidade e adaptação viajam junto, e a musculação do dia fica onde estava;
- **não tenta repor os quilômetros perdidos**, e diz isso na explicação;
- é reversível (`undoFit`), e nada é salvo antes do "Aplicar".

E quando não há o que mexer, ele diz isso — que costuma ser a resposta certa depois de um treino perdido, e a única que a versão por IA não sabia dar.

Um detalhe que importa: ao confirmar por este caminho, a agenda **não** é gravada (`remember: false`). "Os dias que sobraram" não é a agenda de ninguém; gravar aquilo seria colocar na boca do atleta uma frase que ele não disse, e ela voltaria na próxima geração da semana.

**Removidos:** `/api/coach/weekly-plan/adjust` e `adjustWeeklyPlanProactive` em `ai.ts`. Uma função de IA a menos prescrevendo treino.

## Arquivos

| Arquivo | O quê |
|---|---|
| `src/components/health/screen/HealthOverview.tsx` | o índice das quatro categorias |
| `src/components/health/screen/HealthScreen.tsx` | a tela agrupada por categoria |
| `src/lib/week-fit.ts` | `remainingDays` |
| `src/app/api/coach/week-fit/route.ts` | `remember: false` |
| `src/components/coach/ProactiveAdjustBanner.tsx` | prever → explicar → confirmar, sem IA |
| `tests/week-fit.test.ts` | 4 testes novos |
