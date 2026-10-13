# A IA não estava quebrada — estava estourando o minuto (13/10/2026)

## O sintoma

"Gerar análise" numa corrida devolvia erro.

## O que eu achei que era, e não era

A chave da Groq está válida. O modelo `openai/gpt-oss-120b` continua na conta e
responde 200. Nada de retirada de modelo, nada de chave expirada.

## O que era

Medido na conta de produção, com as **170 corridas** do Sérgio — o atleta com o
maior histórico, e por isso o primeiro a notar:

```
POST /chat/completions → 200
usage: prompt_tokens 6912 · completion 600 · total 7512
finish_reason: "length"            ← a resposta vinha cortada no meio da frase
x-ratelimit-limit-tokens: 8000     ← teto por minuto, plano gratuito
```

**Uma análise consumia 94% do minuto inteiro.** A segunda coisa que o app
pedisse na mesma janela — outra análise, o conselheiro, o recado do dia, o
resumo semanal — levava `429`. E `callGroq` transformava qualquer falha em
`null`, que a rota anunciava como *"AI analysis failed or API key not set"*.

Confirmado disparando duas chamadas seguidas:

```
chamada 1 → 200   (restavam 1.259 tokens no minuto)
chamada 2 → 429   Limit 8000, Used 6936, Requested 3773. Try again in 20.3s
```

E piorava sozinho: o prompt cresce a cada corrida registrada. Por volta de 190
corridas **uma única análise** passaria de 8.000 e a IA morreria de vez — para
quem mais usa o app.

## A causa, que estava escrita no código

O cabeçalho de `ai.ts` dizia:

> mandamos TODAS as corridas do histórico — o modelo tem janela de 128k tokens,
> o que comporta centenas de corridas confortavelmente

A janela comporta. **O limite por minuto não.** Era a restrição errada.

## O que entrou no lugar

`src/lib/ai-history.ts`. Despejar 170 linhas cruas também nunca foi um bom
contexto: o que responde *"esta corrida foi boa?"* são as corridas **parecidas**
com ela e a **tendência**, não a lista inteira em ordem cronológica.

Três blocos curtos:

1. **Comparáveis** — mesmo tipo, distância dentro de ±25%. É contra elas que a
   corrida de hoje é julgada. (Sem companhia suficiente do mesmo tipo, a
   distância sozinha decide: melhor comparar com algo parecido de outro rótulo
   do que não comparar.)
2. **Recentes** — as últimas 10, para a forma do momento.
3. **Mês a mês** — volume, quantidade e ritmo médio, uma linha por mês. O ritmo
   é ponderado pela distância: senão um tiro de 400 m pesa igual a um longão de
   20 km e o mês inteiro parece mais rápido do que foi.

O bloco também diz quantas corridas existem no total, para a IA não concluir que
o atleta correu vinte vezes na vida.

Aplicado em `analyzeRun` e em `generateWeeklySummary`, que tinham o mesmo
problema.

## Medido depois, com os mesmos dados

| | antes | depois |
|---|---|---|
| prompt | 6.912 tokens | **850** |
| total | 7.512 | **1.408** |
| do minuto | 94% | **18%** |
| `finish_reason` | `length` (cortado) | `stop` (inteiro) |

Cabem cinco análises por minuto em vez de uma, e o resto do app funciona junto.
A resposta veio completa, em português, citando a FC e o ritmo habitual dele —
o resumo não custou qualidade.

## E o erro parou de mentir

`AiUnavailable` carrega o motivo até a rota:

- **429** → *"A IA atingiu o limite de uso do minuto. Tente de novo em 20
  segundos."* (com os segundos que a própria Groq informa)
- sem chave → *"A IA não está configurada neste ambiente."*
- resto → *"A IA não respondeu agora. Tente de novo em instantes."*

Antes tudo isso era um `500` dizendo "API key not set", que é como "espere vinte
segundos" virou "a IA parou de funcionar".

## O orçamento da resposta

De 600 para 900 tokens. Com o prompt antigo a resposta vinha com
`finish_reason: "length"` — o pedido é de "3 a 5 parágrafos" e o orçamento não
dava para três. Agora dá, e ainda sobra minuto.

## Verificação

- `npx tsc --noEmit` — limpo
- `npx vitest run` — **96 arquivos, 1.681 testes** (19 novos em `ai-history`)
- `npx next build` — compila, 94 páginas
- **Chamada real à Groq com as 170 corridas de produção**, antes e depois, com
  os números acima
