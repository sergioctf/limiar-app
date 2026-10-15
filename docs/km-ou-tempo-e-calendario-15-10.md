# Km ou minutos, e o calendário que acompanha o plano (15/10/2026)

Duas coisas de uma vez, porque se tocam: a unidade escolhida é a unidade que
vai para o relógio.

---

# 1. O calendário acompanha o plano

O envio manual — um botão, um treino — resolveu o dia de hoje e deixou duas
coisas erradas:

1. **Mover um treino de dia deixava o antigo lá.** O atleta passava a quarta
   para a sexta no app e o relógio continuava apitando na quarta, com o treino
   que já não existe — e a semana passava a ter dois onde só há um.
2. **Toda semana começava vazia.** O plano nasce na segunda de madrugada;
   esperar o atleta lembrar de tocar o botão sete vezes é esperar que ele não
   use.

## O que mudou

`src/lib/icu-push.ts` virou o lugar de onde todo mundo fala com o calendário:
o botão, a mudança de dia e o cron.

**Mover um treino move o evento.** A rota de mover, depois de salvar, limpa o
dia de origem e põe o treino no destino. Só o que leva o nosso `external_id` é
apagado: o calendário é do atleta, e uma prova que ele marcou à mão no
intervals.icu não é nossa para apagar.

**A semana vai junto com o plano.** O cron que gera o plano na segunda manda a
semana inteira para quem tem o intervals.icu conectado. Só a semana que
começou — a seguinte ainda vai mudar, e um calendário com quinze dias de treino
provisório é pior do que um com sete definitivos.

**A rodagem simples vai também.** Treinos de qualidade e longões já tinham
`structure`; uma rodagem não tem — e ela é a maioria da semana. `sessionAsStructure`
monta um passo único ("8 km entre 6:12 e 5:48"), que é um treino perfeitamente
executável. Sem isso, o envio automático entregaria só os dias de tiro.

**Musculação fica de fora**, de propósito: o que o motor prescreve ali são
exercícios, séries e RIR, que o relógio não mostra e que o modo de execução do
app conduz melhor.

**Tudo em melhor esforço.** Mover um treino e gerar um plano são ações que já
deram certo quando essas funções rodam. O intervals.icu fora do ar não pode
desfazer nenhuma delas.

## A chave

Em Configurações, junto da conexão: **"Mandar os treinos da semana para o
relógio"**, ligada por padrão para quem conectou — conectar já é dizer "quero
meus treinos no pulso". Desligada, o envio treino a treino continua no botão.

## Verificado contra a conta real

Eventos criados, conferidos e apagados no intervals.icu de produção, numa
semana distante (28/12) para não cruzar com treino nenhum:

| o que | resultado |
|---|---|
| treino criado na quarta | 1 evento, com o nosso id |
| tocar de novo | continua **1** — substitui, não duplica |
| mover quarta → sexta | quarta **vazia**, sexta com o treino |
| semana inteira | **2 enviados** (rodagem + tiro), **2 pulados** (descanso + musculação), 0 falhas |

Calendário conferido vazio no fim.

---

# 2. Km ou minutos

> "Acho que temos que adicionar a opção dos treinos serem por tempo ou km. Eu
> prefiro km, mas muita gente prefere por tempo." (Sérgio, 13/10)

As duas escolas são legítimas e a diferença é real: num dia ruim, 8 km custam
uma hora; 45 minutos custam 45 minutos.

## O que NÃO mudou

**O motor continua prescrevendo em quilômetros.** É neles que estão a rampa de
volume, o teto do longão, a periodização e a adesão — reescrever isso para
produzir minutos seria trocar o motor por uma preferência de leitura.

O que muda é **em que unidade o plano é lido**: o mesmo treino de 8 km aparece
como "50 min" para quem escolheu tempo, convertido pelo ritmo que o próprio
motor já prescreveu para aquela sessão. Pelo **meio da faixa**, não pela ponta
rápida — senão "corra leve" vira "corra leve, no limite do leve".

`distance_km` segue sendo a verdade guardada; `duration_min` anda junto. Por
isso **trocar a preferência não regenera nada**: a tela muda na hora.

E quando não dá para converter — atleta sem teste não tem ritmo — volta para
km. Um "45 min" inventado é pior que um "8 km" honesto.

## Onde a escolha aparece

**No onboarding**, logo depois de "que dias você corre", com duas opções e uma
frase cada:

> **Quilômetros** — "Corra 8 km hoje". Recomendado para quem está começando.
> **Minutos** — "Corra 45 minutos hoje". O esforço fica igual nos dias ruins.

**No app**, em Treinador → Minha semana, junto das outras preferências.

## O orçamento do onboarding subiu, uma vez, com motivo

Eram quinze telas; viraram seis em 01/10 porque um usuário novo se perdeu.
Esse limite tem teste, e afrouxá-lo sem dizer por quê é exatamente como ele
cresceu da primeira vez.

Esta passa porque não é configuração: é a unidade em que a pessoa vai ler o
próprio treino todos os dias depois disso, e perguntar depois significa mostrar
a primeira semana inteira na unidade errada. O teste agora diz cinco perguntas
e sete telas, **com o argumento escrito dentro dele** — a próxima que quiser
entrar precisa de um argumento do mesmo tamanho, ou tira uma de lá.

## Um bug encontrado no caminho

A rota de preferências recusava qualquer PUT que resultasse em zero dias de
corrida. A regra existia para o card de preferências, onde desmarcar os sete
dias é pedir um plano impossível — mas aplicada a **qualquer** PUT, ela barrava
quem salva outra coisa sem ter dias ainda. No primeiro acesso, pular "que dias
você corre" e responder "km ou minutos" devolvia 400, e a tela simplesmente não
avançava, sem dizer por quê. Agora a regra vale só para quem está mexendo nos
dias.

---

## Verificação

- `npx tsc --noEmit` — limpo
- `npx vitest run` — **98 arquivos, 1.734 testes** (26 novos em `measure`)
- `npx next build` — compila, 94 páginas
- **intervals.icu de produção**: mover, não duplicar e semana inteira, com a
  tabela acima
