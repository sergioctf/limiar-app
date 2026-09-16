# Adaptar o treino — antes e depois da sessão

Registro de 16/09/2026. Conceito fechado por Sérgio com a outra IA; implementado aqui.

## Por que existe

Na corrida de 16/09 o plano dizia **Subidas 6×45 s** e Sérgio fez **8 × 400 m** — não fazia ladeira. O check-in comparou 8 km com uma sessão de 3,5 km e chamou de "treino registrado". Uma substituição válida parecia execução ruim.

Decisões do Sérgio que moldaram a feature:

- *"normalmente tento preservar"* o objetivo quando troca um treino;
- decide a troca **antes** de sair;
- quer **2 ou 3 alternativas**, uma recomendada;
- quer poder **escrever a própria proposta** ("prefiro fazer 8 × 400 m") e que o treinador avalie;
- o treinador **pode discordar**, explicando — mas quem decide é o atleta.

Tudo é determinístico (`src/lib/session-adapt.ts`): as alternativas saem dos mesmos construtores que escrevem o plano, e a proposta é lida por um analisador de texto, não por IA.

## Antes do treino: "Adaptar este treino"

**Onde:** botão no card **Hoje** (enquanto o treino do dia não foi feito) e no detalhe de cada corrida da semana no **Treinador** (hoje ou dias seguintes). Só corridas; teste de 3 km e prova não são adaptáveis.

**Fluxo:**

1. **O que precisa mudar?** Menos tempo · Local inadequado (sem ladeira, pista ou percurso) · Sem relógio ou GPS · Prefiro outro formato · Outro motivo — ou *"Já sei o que quero fazer"*.
2. **Alternativas (até 3, a primeira recomendada)**, cada uma com treino, tempo estimado, **Preserva**, **Muda** e **Por quê**. Nunca completa a lista com opções falsas; quando nada preserva o objetivo, diz isso.
3. **Proposta própria:** o atleta escreve; o treinador mostra como entendeu, o que assumiu (ex.: "2 min de trote entre as repetições"), um veredito — **Mantém o objetivo / Mantém parte / Muda o objetivo** — e, se a ideia for boa mas grande demais para a semana, uma **sugestão ajustada** dentro dos tetos do próprio plano.
4. **Aceite:** a versão escolhida substitui o dia; o original fica guardado em `adaptation.original`. "Desfazer" devolve o original. Adaptar de novo mantém o original verdadeiro.
5. O **check-in pós-treino compara com a versão combinada** e mostra "Adaptado antes do treino: X → Y".

### Regras das alternativas

| Motivo | Sessão de qualidade | Rodagem / longão |
|---|---|---|
| Menos tempo | A própria sessão encurtada (menos repetições, aquecimento menor — ex.: Subidas 6×45 s → 4×45 s); e outro formato do mesmo estímulo, se houver | Versão mais curta |
| Local inadequado | Subidas → tiros curtos no plano (recomendado) ou fartlek; sessões por distância → a mesma sessão **por tempo**; fartlek já funciona em qualquer lugar | Por tempo |
| Sem GPS | A mesma sessão por tempo e esforço | Por tempo |
| Outro formato / outro motivo | Outros tipos do mesmo estímulo; depois os vizinhos (ex.: VO₂máx ↔ limiar) | Diz que não há formato alternativo que preserve o objetivo; oferece por tempo |

Tipos que o atleta excluiu (ex.: ladeira) nunca aparecem como alternativa. Uma musculação no mesmo dia é preservada.

### Estímulos (para o veredito)

| Família | Sessões |
|---|---|
| Força e potência | subidas |
| Velocidade | tiros curtos |
| VO₂máx | tiros, tiros densos |
| Limiar | tempo, fartlek, progressivo |
| Base aeróbica | rodagem, regenerativo, strides |
| Resistência | longão |

Mesma família → mantém o objetivo. Famílias vizinhas (força ↔ velocidade, VO₂máx ↔ limiar) → mantém parte. O resto → muda o objetivo. Trocar um dia leve por um treino forte recebe o aviso de que a carga da semana muda.

### O que a leitura de texto entende

`8x400m`, `8 × 400 m com 2 min de trote`, `6x1km`, `5x1000`, `10x200`, `6x3min`, `8x45s em subida`, `20 min em limiar`, `10 km leve`, e aquecimento/desaquecimento em km (`2 km de aquecimento`, `1,25 km de desaquecimento`). Quando falta algo essencial, pergunta só isso: a unidade das repetições, a intensidade de um bloco contínuo, ou o formato.

## Depois do treino: "Como foi?"

Quando a corrida ficou **claramente diferente do previsto** (distância abaixo de 75% ou acima de 130% do planejado, ou uma rodagem feita em ritmo de treino) e **não houve adaptação antes**, o check-in abre com:

> Estava previsto: Subidas 6×45 s. Como foi?
> **Fiz como previsto · Adaptei mantendo o objetivo · Fiz outro treino**

Com "adaptei" ou "outro treino", um campo opcional *"O que você fez?"*, com leitura ao vivo ("Entendi: 8×400 m · muda o objetivo do treino previsto").

**Consequências:**

- **Adaptei:** título "Treino adaptado"; a diferença de distância **não conta como treino incompleto**; se o texto foi entendido, a avaliação diz o que preservou e o que mudou.
- **Outro treino:** título "Outro treino registrado"; não compara com o previsto.
- Nos dois casos o **dia do plano passa a registrar o que foi feito** (`adaptation.when = "after"`, distância real, prescrição original guardada), para a adesão da semana não contar a substituição como falta. Responder depois "Fiz como previsto" desfaz esse registro.

## Registro de aplicação

- **Migration 032** aplicada: `run_feedback.status` aceita `deferred`; colunas `execution` e `executed_text`.
- **Prévia visual** com dados fictícios e API simulada (página `/dev` temporária, removida antes do deploy): o motivo "local inadequado" nas subidas gerou "Tiros curtos 6×200 m" (recomendada) e "Fartlek 5×2 min"; a proposta "2 km de aquecimento, 8x400m, 1 km de desaquecimento" foi entendida, avaliada como "muda o objetivo" e recebeu a sugestão "3×400 m" dentro do teto de 1,5 km da semana.
- **Produção, sessão real, sem gravar nada:** alternativas para a sessão de hoje com "menos tempo" → "Subidas 4×45 s ≈ 20 min"; avaliação de "8x400m" → "muda o objetivo", sugestão 3×400 m; tentativa de adaptar um dia passado → recusada com mensagem. O botão não apareceu no card Hoje porque a corrida do dia já estava feita — como deveria.
- **Testes:** `tests/session-adapt.test.ts` (34 casos) e casos novos em `tests/run-feedback.test.ts`.

## Limites

- Só a semana atual e só corridas.
- A leitura de texto cobre os formatos comuns; frases livres ("trilha com os amigos") viram "outro treino" sem estrutura.
- A estimativa de distância de uma proposta usa os ritmos do último teste; sem teste, usa ritmos genéricos só para estimar tempo.
- A carga (TSS) continua calculada a partir da corrida registrada, não da sessão adaptada.
