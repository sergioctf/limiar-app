# Os crons passaram a deixar recibo (09/11/2026)

## O diagnóstico

Todo bug sério deste app falhou **calado**:

| o quê | quanto tempo | como foi descoberto |
|---|---|---|
| resumo semanal por IA | **meses** | lendo o código por outro motivo |
| análise por IA | **semanas** | Sérgio reclamou |
| mapa das corridas | **um mês** | Sérgio reclamou |
| enviar pro relógio | **desde sempre** | Sérgio reclamou |

Nenhum deles teria sido pego por um capturador de exceções. **Não houve exceção
em lugar nenhum**: a condição que procurava o resumo nunca batia; o 429 da Groq
virava `null`; o CDN do mapa respondia *200* com uma imagem escrita "API KEY
REQUIRED"; o `.FIT` era gerado corretamente e não chegava a relógio nenhum.

O que falta neste codebase não é captura de erro. É **saber se o trabalho
aconteceu**.

## O que entrou

### `job_runs` (migration 040)

Uma linha por execução de tarefa de fundo: quando começou, quando terminou,
status, quantos atletas tocou, um resumo legível e o erro quando houve. RLS
ligado e **nenhuma policy** — só o `service_role` enxerga.

A linha é inserida **no começo**, não no fim. Uma tarefa que trava ou estoura o
tempo limite da Vercel nunca chega à linha que escreve o fim — e é exatamente a
que mais interessa. Recibo aberto e nunca fechado é informação: "começou e não
voltou".

### O invólucro (`src/lib/job-run.ts`)

Cada cron virou uma linha:

```ts
export const GET = withJobReceipt("weekly-plan", handler);
```

- **401 não gera recibo.** Bater na porta não é entrar — e contar a batida
  faria "rodou hoje" ficar verde por engano.
- **O resumo sai do próprio corpo da resposta.** Os crons já devolvem o que
  fizeram (`users`, `athletes`, `results`); não houve por que reescrever nove
  rotas para dizerem de novo o que já dizem.
- **Nunca derruba o cron.** Toda escrita engole o próprio erro: um recibo que
  mata o trabalho que deveria vigiar é pior que recibo nenhum.

### A pergunta (`src/lib/job-health.ts`)

Guardar recibo só serve se alguém perguntar. Cada tarefa tem um intervalo
esperado e **uma frase dizendo o que o atleta perde** quando ela não roda —
porque "strava-sync atrasado" é um enigma e "corridas do Strava param de entrar
sozinhas" é acionável.

Estados: `ok`, `atrasado`, `falhou`, `travado` (começou e não voltou), `nunca` e
`aguardando`. A margem é de **2×** o intervalo: a Vercel atrasa, o fuso
embaralha, e um alarme que toca por uma hora de atraso é um alarme que ninguém
lê no terceiro dia.

### O aviso que sai sozinho

O `wellness-sync` (o último cron diário, 08:00 BRT) olha para trás uma vez por
dia e, **se algo está em silêncio**, manda um push. Devolve `null` quando está
tudo bem — por isso pode rodar todo dia sem virar ruído.

Uma tela que alguém precisa lembrar de abrir resolve metade do problema: o
resumo semanal ficou morto meses porque ninguém tinha motivo para procurar.

### A tela

`GET /api/admin/health` (e `?format=txt`, porque a forma provável de olhar isso
é do celular, às pressas). Autenticada pela **sessão do dono** — `ADMIN_USER_ID`
— e não por segredo na URL.

A primeira versão pedia `?secret=`. Nasceu morta: **`ADMIN_SECRET` está vazio em
produção**. Consertar isso significaria passar um segredo de mão em mão para ler
uma tela, enquanto o Sérgio já está logado. O segredo continua valendo para
script, se um dia for configurado de verdade.

Recusa com **404**, não 401: uma tela que lista o que está quebrado é um mapa
para quem quiser aproveitar.

## Dois bugs achados pelo próprio recibo, em minutos

**1. A build gravava execuções falsas.** Faltava `export const dynamic =
"force-dynamic"` nos crons, então o `next build` tentava prerenderizá-los,
executava o handler e ele estourava em `request.headers`. O Next engolia esse
erro havia meses — até o recibo começar a registrá-lo, e a build passar a
escrever no banco a partir da máquina de quem compila. Corrigido nos dez crons.

**2. Meu próprio invólucro deixava recibo órfão.** A chamada sem segredo abria a
linha e voltava sem fechá-la — e `job-health` classificaria isso como "travado"
para sempre. Agora o 401 apaga o recibo.

O instrumento achou dois problemas antes de completar uma hora de vida. É o
argumento inteiro para ele existir.

## E o primeiro dia não grita

Na estreia, nenhum cron semanal tem recibo. Chamar isso de "nunca rodou" seria
mentira e dispararia oito alarmes falsos — e um vigia que grita na primeira
manhã é um vigia que o dono silencia na segunda. Enquanto a vigilância for mais
nova que o intervalo da tarefa, o estado é `aguardando`, que não conta como
problema.

Verificado em produção logo depois do deploy:

```
Todas as tarefas rodaram quando deviam.

agua weekly-plan     —        Ainda não deu tempo — vigiando há 0 h, esperado a cada 168 h.
ok   strava-sync     há 0.1 h 7 atletas
...
```

## O que isto NÃO é

Não é Sentry, e não substitui. Erro de JavaScript no navegador do atleta
continua invisível. Mas **nenhum dos quatro bugs da tabela lá em cima era isso**
— e esta era a classe que vinha mordendo.

## Verificação

- `npx tsc --noEmit` — limpo
- `npx vitest run` — **100 arquivos, 1.789 testes** (21 novos em `job-health`)
- `npx next build` — compila, sem `Dynamic server usage`
- **Em produção:** cron sem segredo → 401 e nenhum recibo; com segredo → 200 e
  recibo de 2,0 s com 7 atletas; tela de saúde respondendo pela sessão do dono
