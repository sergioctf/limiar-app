# Devolutiva semanal — fechando a semana em três perguntas

Aplicado em 17/09/2026 ("ponto 2"). Pedido do Sérgio: *"Fechar a semana com uma explicação curta e útil"* — como foi, o que o treinador entendeu, o que muda.

## O que existia antes (e não funcionava)

O cron de segunda (`/api/cron/weekly-report`) pedia a uma IA um resumo da semana passada e salvava em `coach_reports` com `period_type = "week"` — **a mesma linha onde mora o plano daquela semana**. Duas consequências:

1. A verificação "já existe resumo?" procurava uma linha de semana com `summary` preenchido. **A linha do plano sempre tem `summary`**, então o resumo era sempre pulado: quem tinha plano nunca recebeu resumo nenhum.
2. Se algum dia tivesse sido gerado, teria **sobrescrito o plano** da semana passada com texto.

Era a dívida **A1** do handoff: código morto que, se acordasse, apagava dado. E era uma IA escrevendo sobre números que ela não conferia.

## O que existe agora

`src/lib/week-recap.ts` — determinístico, sem IA (ADR-02). Aparece no **Treinador**, logo acima do plano da semana, e some sozinho quando não há nada a fechar.

### 1. Como foi sua semana?

Fatos, do jeito que estão:

- quilometragem e dias de corrida;
- sessões: *"2 de 3 como previstas · 1 adaptada · 1 não feita"* — uma sessão adaptada é contada **como adaptada**, nunca como falta nem como plano cumprido (ver `docs/adaptar-treino.md`);
- o que aconteceu com o treino forte da semana;
- maior corrida e dia;
- musculação, contada à parte;
- comparação com a semana anterior.

Semana sem corrida nenhuma recebe *"Nenhuma corrida registrada"* e o que estava previsto — sem maquiagem.

### 2. O que o treinador entendeu?

A **mesma leitura que alimentou o plano desta semana** (`WeekReading`, em `docs/week-reading.md`), não uma opinião nova: o texto vem de `plan.week_reading` e, em planos antigos que não guardaram a leitura, é recalculado com `weekReadingFor()` a partir dos mesmos dados.

Somam-se a ela só fatos:

- motivos citados nos check-ins ("trabalho", "dormi pouco");
- quantos treinos foram marcados como muito difíceis;
- sessões combinadas antes ou declaradas depois, com o veredito de cada uma;
- uma pergunta ainda **pendente** — e só quando ela está mesmo pendente: se a resposta já foi dada (`week_feedback`), a linha não aparece. É a mesma regra do pop-up.

Sem leitura e sem check-ins, o card diz que não há leitura — em vez de inventar uma.

### 3. O que muda na próxima?

- volume previsto e a diferença para a semana anterior;
- se a semana está **segurada** (o que faltou não puxou o plano para baixo) ou **sem aumento** (você pediu para aliviar, ou o corpo está em observação);
- o treino forte e o longão da semana que começa.

## O que mudou no cron de segunda

`/api/cron/weekly-report` não gera mais texto por IA:

- **Resumo:** removido. O push de segunda continua ("Sua semana fechou 📊") e leva para `/coach`, onde a devolutiva é calculada na hora.
- **Plano:** passou a chamar `ensureWeeklyPlan()` em vez de `generateStructuredWeeklyPlan()` (IA). Antes, um atleta sem corridas nos últimos 60 dias recebia uma semana inventada por modelo que o `ensureWeeklyPlan` considerava "usável" e **nunca substituía** — congelada por sete dias. Agora o cron, o banner de plano desatualizado e o botão "Gerar plano" produzem o mesmo plano e respeitam o mesmo congelamento da semana em andamento.

Com isso a dívida **A1** está fechada.

## Verificação (17/09/2026)

- **Testes:** `tests/week-recap.test.ts` (23 casos). Suíte: 70 arquivos, 1.332 testes, `tsc` limpo.
- **Produção, dados reais:** a semana de 7 a 13/09 (em que Sérgio não treinou) fechou assim:
  - *Como foi:* "Nenhuma corrida registrada · Estavam previstos 19 km."
  - *O que o treinador entendeu:* "Semana atrapalhada pela rotina — Você fez 0 km dos 19 km previstos. Trabalho, agenda ou clima entraram no caminho, e isso não é perda de condicionamento: mantivemos o mesmo volume, sem tentar compensar os 19 km que faltaram."
  - *O que muda:* "Volume previsto: 19 km — o mesmo da semana passada · O que faltou não puxou o plano para baixo · Treino forte: Subidas 6×45 s na quarta · Longão de 9,5 km no sábado."
- A primeira versão mostrava "Falta a sua resposta sobre esta semana" mesmo com a resposta já dada em 16/09; corrigido para usar a mesma regra do pop-up antes do deploy final.

## Limites

- A devolutiva é calculada na hora, não fica gravada: se um plano antigo for regenerado, o texto acompanha os dados atuais.
- Ela fala de **uma** semana — a que fechou. Comparações mais longas (consistência, evolução por tipo de treino) são o ponto 3.
- Musculação entra só como contagem de sessões; carga e progressão de força não aparecem aqui.
