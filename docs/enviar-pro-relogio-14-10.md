# Enviar pro relógio, de verdade (14/10/2026)

## Por que nunca funcionou

O botão "Enviar pro relógio (.FIT)" gerava um arquivo e **baixava**.

No celular isso é um beco sem saída: **o Garmin Connect do telefone não importa
treino de arquivo.** Só o Connect do computador importa, em Treinos → importar.
E o momento em que alguém toca "enviar pro relógio" é justamente quando está no
celular, olhando o treino do dia.

Ou seja: o arquivo era gerado corretamente, baixado corretamente, e não chegava
a relógio nenhum.

## Como os outros fazem

TrainingPeaks, Runna e Final Surge empurram o treino estruturado para o
**calendário do Garmin Connect**, e o relógio sincroniza sozinho. Eles têm
acesso à Training API da Garmin.

Nós não temos: o programa de desenvolvedores da Garmin está fechado para apps
novos desde 2026, sem data para reabrir e sem fila de espera (ADR-12).

**Mas o intervals.icu é parceiro antigo e tem essa porta aberta** — e o atleta
já está conectado lá, pela saúde. Conferido na conta de produção antes de
escrever uma linha:

```
icu_garmin_training:        true
icu_garmin_upload_workouts: true     ← ele já empurra treino planejado
icu_garmin_last_upload:     2026-09-19T02:10
```

A estrada existia e já estava ligada. Faltava o Limiar botar o treino nela.

## A armadilha da sintaxe

O intervals.icu lê os passos do **texto da descrição** do evento, uma linha por
passo começando com `-`. E tem uma regra que é uma mina terrestre:

> **`m` significa MINUTOS. Metros se escrevem `mtr`.**

Um tiro de 800 metros escrito `800m` é um tiro de **800 minutos**. Um treino de
6×800 m viraria oitenta horas de corrida no relógio do atleta.

Por isso a formatação de distância não é feita à mão em lugar nenhum:
`tempoOuDistancia` tem teste para cada caso, e um teste existe só para garantir
que o texto gerado **nunca** contém `800m`.

As outras regras do formato:

- Repetição é uma linha `6x` sozinha, com linha em branco antes e depois.
  Repetição dentro de repetição não existe.
- **Não se mistura alvo de FC com alvo de ritmo** no mesmo treino. Nossos passos
  têm os dois; aqui vale só o ritmo — é o que o corredor persegue e o que o
  motor calcula pelo VDOT.
- O motor escreve ritmo com **travessão** (`6:12–5:48/km`); o intervals.icu quer
  hífen e a unidade dos dois lados (`6:12/km-5:48/km Pace`). Travessão não
  quebra nada: devolve um treino sem alvo nenhum no relógio, calado.

## Verificado contra a conta real

Criei um evento de verdade no intervals.icu do Sérgio, numa data distante
(30/12) para não pôr treino falso no relógio dele hoje, li de volta o que o
intervals.icu entendeu, e apaguei. Calendário conferido vazio depois.

Enviado:

```
- Aquecimento 2km 6:12/km-5:48/km Pace

6x
- Forte 800mtr 4:10/km-4:00/km Pace
- Trote 2m 7:00/km-6:30/km Pace

- Volta à calma 1km 6:12/km-5:48/km Pace
```

Interpretado por ele:

| passo | o que ele entendeu |
|---|---|
| Aquecimento | `distance: 2000` m · ritmo 372→348 s/km |
| **6x** | `reps: 6` |
| ↳ Forte | **`distance: 800`** m · ritmo 250→240 s/km |
| ↳ Trote | `duration: 120` s · ritmo 420→390 s/km |
| Volta à calma | `distance: 1000` m · ritmo 372→348 s/km |

Total: 9,58 km em ~50 min. **800 metros, não 800 minutos.**

## O que mudou na tela

"Enviar pro relógio" virou a ação principal do treino. O arquivo continua
existindo, um nível abaixo e em letra miúda — "Baixar .FIT para importar à mão"
— para quem está no computador ou tem relógio que não fala com o intervals.icu.

Quem não tem intervals.icu conectado recebe o convite para conectar, com link
para as Configurações, em vez de um erro.

## Reenviar não duplica

O evento carrega um `external_id` nosso (`limiar-<semana>-<dia>`). Antes de
criar, a rota apaga o que o Limiar já tinha posto naquele dia. Sem isso, quem
tocasse duas vezes — ou tocasse de novo depois de adaptar o treino — acabaria
com dois treinos no mesmo dia no relógio.

## O que ficou no código

| Arquivo | O quê |
|---|---|
| `src/lib/icu-workout.ts` | A tradução para a sintaxe do intervals.icu. Pura. |
| `src/app/api/workouts/push/route.ts` | Apaga o anterior do dia, cria o novo |
| `src/components/coach/WorkoutStepsView.tsx` | "Enviar pro relógio" + o `.FIT` como saída secundária |
| `src/components/coach/week/RunCard.tsx` | Passa data, semana e dia |

## Verificação

- `npx tsc --noEmit` — limpo
- `npx vitest run` — **97 arquivos, 1.708 testes** (27 novos em `icu-workout`)
- `npx next build` — compila
- **Evento real criado, lido e apagado** na conta de produção, com a tabela acima
- Tela conferida no navegador a 375 px, tema escuro

## O que falta conferir, e só o Sérgio pode

Que o treino **chega no relógio**. Eu verifiquei a perna que o Limiar controla
(o intervals.icu aceita e interpreta certo) e a capacidade da outra
(`icu_garmin_upload_workouts: true`, com upload já feito em 19/09). A ponta
final é tocar o botão num treino de verdade e abrir o Garmin Connect.
