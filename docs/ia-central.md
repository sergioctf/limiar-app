# A IA central

*Aplicada em 20/09/2026. Fase 2 do plano em [plano-proximos-passos.md](plano-proximos-passos.md).*

> Sérgio, 20/09: *"Não quero simplesmente um chatbot genérico. Quero que pareça realmente um especialista pessoal."* E, sobre a arquitetura: *"as páginas apresentam os dados; a IA interpreta os dados."*

## A ideia em uma frase

Toda análise do app passa a ter um lugar só. As telas mostram o que aconteceu; a IA cruza, interpreta e aconselha. Mas ela não calcula nada — continua valendo a ADR-02: **o motor prescreve, a IA narra.**

## Como isso não vira uma IA que inventa número

O caminho é sempre o mesmo, e a ordem importa:

```
leitores determinísticos  →  dossiê (frases prontas)  →  resposta
(week-movement, week-recap,    "4 de 6 sessões, 3h21"     sugestão: a própria seção
 progress-reading, recovery-    "VDOT 43,7"                pergunta aberta: o modelo,
 today, training-load,          "Forma −22"                 lendo só o dossiê
 performance, shoes,
 plan-adherence…)
```

`src/lib/ai-brief.ts` não faz conta nenhuma. Ele pega o que os leitores das telas já concluíram e **escreve** — uma seção por assunto, cada uma com título, uma frase de resposta, os fatos em lista e a **fonte** ("plano da semana e tudo que foi registrado nela", "teste de 30/08 (fórmulas de Daniels)").

Disso saem duas coisas com o mesmo material:

| | Como responde | Custo | Espera |
|---|---|---|---|
| **Leituras rápidas** (os botões) | A própria seção, escrita | nenhum | nenhuma |
| **Pergunta aberta** (o campo) | O modelo, lendo só o dossiê | chamada à Groq | alguns segundos |

**Uma seção sem dado não existe** — e uma seção que não existe não vira botão, não vira resposta e não entra no texto que vai para o modelo. Um atleta sem teste de calibração não tem "Meus ritmos"; sem tênis cadastrado não tem "Meus tênis"; sem dado nenhum, a IA não diz nem que "está tudo bem" (tranquilidade falsa é pior que silêncio). É isso que os testes em `tests/ai-brief.test.ts` protegem: se um número aparecer numa resposta sem estar no dossiê, ele foi inventado.

O prompt do modelo (`answerAthleteQuestion`, em `ai.ts`) fecha o resto:

- todo número dito tem que aparecer no dossiê, igual;
- o que não está lá recebe "não tenho esse dado" **e** o que faria o app ter (conectar o relógio, fazer o teste, registrar o treino);
- dor, lesão ou sintoma: reconhece, diz o que os dados mostram, manda procurar profissional;
- 2 a 5 frases, por "você", terminando pela fonte dos números.

## O que ela sabe

Treze seções, todas vindas de leitores que já existiam:

| Seção | Leitor |
|---|---|
| Meu treino de hoje | `today.ts` + `day-status.ts` |
| Minha recuperação hoje | `recovery-today.ts` / `readiness.ts` |
| Meu sono | `health-view.ts` (`buildSleepWeek`) |
| Minha semana | `week-movement.ts` |
| A semana que fechou | `week-recap.ts` |
| O que está melhorando | `progress-reading.ts` |
| Minha carga de treino | `training-load.ts` + `overtraining.ts` |
| Meus ritmos e zonas | `performance.ts` |
| Quanto do plano eu cumpro | `plan-adherence.ts` |
| Minhas provas · Minhas metas | `races`, `goals` + previsões do teste |
| Meus tênis | `shoes.ts` |
| Algum alerta? | só junta o que os outros já marcaram |

## Na tela

- **Botão redondo laranja**, canto inferior direito, acima da barra de baixo, em toda aba (`CoachFab`, dentro do `AppShell`). Some na própria `/ia`.
- **`/ia`**: saudação, as leituras rápidas como botões, o campo aberto, e a conversa inteira acima.
- A conversa é **uma linha do tempo só, agrupada por dia** ("Hoje", "18 de setembro").

## A conversa gravada

Decisão do Sérgio: **sem limite de uso, gravada com data.** Migration `035_ai_conversas.sql`, tabela `ai_messages` (RLS: ler, inserir e **apagar** só as próprias). Guardar existe por dois motivos — dar continuidade a uma pergunta curta ("e na semana passada?") e permitir reler depois o que a IA disse, já que ela fala de treino e de saúde de alguém. Por isso o botão de apagar a conversa está na tela: guardar sem poder apagar não é guardar, é reter.

`date` é o dia do atleta (America/São Paulo), não o do servidor — na Vercel o relógio é UTC e depois das 21h no Brasil já é amanhã.

## Duas decisões de implementação que valem explicação

**O dossiê é montado no servidor, sempre.** A tela recebe uma cópia para responder as leituras na hora, mas `/api/ia/perguntar` monta o dele do zero: quem pergunta não escolhe os números sobre os quais a IA responde.

**A leitura rápida é gravada recalculando, não copiando.** O cliente mostra a resposta instantaneamente e dispara um POST com o *id* da sugestão; o servidor refaz a leitura e grava o resultado dele. Custa umas dezenas de consultas por toque, que o atleta nunca espera — e o que fica gravado é o que o motor conclui, não um texto que passou pela rede.

## Arquivos

| Arquivo | O quê |
|---|---|
| `src/lib/ai-brief.ts` | o dossiê, as sugestões, as respostas determinísticas |
| `src/lib/ai-brief-load.ts` | busca tudo que o dossiê precisa, num lugar só |
| `src/lib/ai.ts` | `answerAthleteQuestion` — a pergunta aberta |
| `src/app/api/ia/perguntar/route.ts` | pergunta aberta + gravação |
| `src/app/api/ia/mensagens/route.ts` | gravação das leituras + apagar a conversa |
| `src/app/ia/page.tsx` | a tela |
| `src/components/ai/AiContent.tsx` | a conversa, os botões, o campo |
| `src/components/ai/CoachFab.tsx` | o botão flutuante |
| `supabase/migrations/035_ai_conversas.sql` | `ai_messages` |
| `tests/ai-brief.test.ts` | 16 testes da regra "só fala do que existe" |

## O que fica para a Fase 3

Limpar as telas agora que a IA cobre o que sai delas: tirar "Sua semana" e o resumo de IA do Treinador, "O que está melhorando" do Histórico, e levar a interpretação das Metas para a conversa. Enquanto as duas coisas convivem, a mesma leitura aparece em dois lugares — de propósito, para o Sérgio comparar antes de remover.
