# Quem vai ao relógio (15/10/2026, segunda rodada)

Eu tinha escrito que "a musculação fica de fora, e o resto vai". Estava
impreciso nos dois lados.

## O que estava errado

O filtro era **negativo**: "tudo que não é descanso nem musculação". Com isso,
uma sessão de pilates ou de vôlei — que o atleta marca em `otherDays` e o motor
não dimensiona — cairia no caminho de envio, e `icuSportType` devolvia `"Run"`
para o que não reconhecia. O vôlei de quinta chegaria no relógio **como um
treino de corrida**.

## O filtro agora é positivo

`AUTO_SPORTS = ["corrida", "natacao", "ciclismo"]` — as três coisas que o motor
dimensiona em distância, tempo e ritmo, e que o relógio sabe conduzir.

- **Pilates, vôlei e companhia não vão.** Não são sessões do motor: são fatos
  da semana do atleta, sem duração nem alvo prescritos por ninguém.
  `icuSportType` devolve `null` em vez de cair em "Run".
- **Bike não cobra ritmo.** `target: AUTO` em vez de `PACE` — ritmo de
  bicicleta não é como ninguém pedala, e o que o motor prescreve ali é tempo e
  zona de FC.

## A musculação tem botão próprio

Logo abaixo de "Começar treino", discreto: **"Mandar pro relógio"**. Não é
automática, mas ter a sessão no pulso tem valor — o relógio sabe que hoje tem
academia e quanto tempo dura.

Ela vai como **texto legível, não como passos**. A sintaxe do intervals.icu
sabe falar de duração, distância e alvo; não sabe dizer "4 séries de 8 a 10 com
duas repetições em reserva". Fingir que sabe exigiria inventar um tempo para
cada exercício, e o relógio conduziria o atleta por números que ninguém
prescreveu. Então vai o que é honesto:

```
Agachamento livre — 4×6-8 (RIR 2)
Búlgaro — 3×10-12 (RIR 2) · cada lado

As séries e o descanso você acompanha no Limiar.
```

com `moving_time` igual à duração estimada da sessão.

**Mover de dia leva junto o que já tinha sido mandado.** A musculação não é
reenviada automaticamente quando o atleta move o dia — a não ser que já
houvesse um evento nosso no dia de origem. Ou seja: mover não cria no relógio
algo que ninguém mandou, mas move o que foi mandado.

## Verificado na conta real

Criados, lidos e apagados no intervals.icu de produção:

| esporte | tipo lá | alvo | o que ele entendeu |
|---|---|---|---|
| natação 2 km | `Swim` | PACE | 1 passo, 2.000 m, 130→120 s/km |
| bike 75 min | `Ride` | AUTO | 1 passo, 4.500 s |
| musculação | `WeightTraining` | — | `moving_time` 3.060 s, lista no texto, **sem passos** (é o esperado) |
| pilates | — | — | **recusado**, `unsupported_sport`, nenhum evento criado |

## O que ainda não sei

Se o relógio **mostra** a sessão de musculação. Ela chega ao calendário do
intervals.icu com duração e descrição, mas sem passos — e a Garmin pode ignorar
treino sem passo na hora de sincronizar. A corrida já foi confirmada pelo
Sérgio em 15/10; esta é a próxima a conferir no pulso.

## Verificação

- `npx tsc --noEmit` — limpo
- `npx vitest run` — **98 arquivos, 1.747 testes** (13 novos em `icu-workout`)
- `npx next build` — compila
