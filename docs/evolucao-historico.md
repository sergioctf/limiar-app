# Evolução no histórico — "O que está melhorando para você?"

Aplicado em 17/09/2026 ("ponto 3"). A lista de corridas registrava o que aconteceu, mas não dizia se alguma coisa estava melhorando. A análise que Sérgio aprovou pedia poucas leituras, sustentadas pelos dados disponíveis, com um cuidado central:

> *Evitar declarar melhora só porque uma corrida foi mais rápida. Quando os treinos não forem comparáveis ou faltarem dados, o aplicativo precisa reconhecer isso.*

## Onde aparece

No topo de **Corridas**, acima da busca. Cada leitura mostra um sinal (melhorando · estável · em queda · sem dados suficientes · registro) e uma frase. **"Ver como medimos"** abre o critério e os números por trás de cada frase — uma afirmação de melhora só vale o que vale a comparação que a sustenta.

Implementação: `src/lib/progress-reading.ts` (determinístico, sem IA), `src/components/runs/ProgressCard.tsx`, dados carregados em `src/app/runs/page.tsx`.

## As cinco leituras

### Consistência
Corridas por semana nas últimas 4 semanas fechadas contra as 4 anteriores. Diferença menor que **0,5 corrida por semana** é "estável". Semanas antes da primeira corrida do atleta não contam como ausência; com menos de 3 semanas no bloco anterior, a leitura diz que o histórico é curto.

### Rotina × plano
Quantas corridas por semana a rotina **realmente comporta**, nas semanas que tinham plano (a partir de 4). O número é o maior *k* feito em pelo menos **70%** das semanas. É a leitura que a análise descrevia como "o plano prevê quatro sessões, mas sua rotina comporta três com muito mais consistência". **Não muda o plano** — aponta onde mudar ("Minha semana") e deixa a decisão com o atleta.

### Ritmo em corridas comparáveis
Só entram pares de corridas **parecidas**:

| Critério | Limite |
|---|---|
| Distância | até 20% diferente |
| FC média | até 6 bpm diferente |
| Subida | até 8 m/km diferente (quando as duas têm o dado) |
| Temperatura | até 6 °C diferente (quando as duas têm o dado) |

Ficam de fora: provas, dias adaptados, sessões de qualidade do plano (o ritmo médio delas mistura aquecimento, tiros e trote), corridas que o importador classificou como treino forte e corridas cujo nome ou nota fala em tiros, intervalado, fartlek, limiar ou prova. Isso é necessário porque o importador chama quase tudo de "Leve" — inclusive os 8 × 400 m de 16/09.

Cada corrida das **últimas 6 semanas** é pareada com no máximo uma dos **~5 meses anteriores**. São necessários **3 pares**; diferença média menor que **5 s/km** é "mesmo ritmo".

### Esforço nos mesmos treinos
Nota de esforço dos check-ins, para o **mesmo tipo** de sessão (rodagem leve, longão, treino forte), feita **como prescrita** — um dia adaptado foi outra sessão. Com pelo menos 4 avaliações do tipo, compara a primeira metade com a segunda; mudança média de **0,75 ponto** ou mais vira frase ("o longão passou de difícil para moderado").

### Adaptações
Quantas vezes a semana dobrou nas últimas 8 semanas e por quê: treinos adaptados antes de sair, trocados e registrados depois, motivos dos check-ins e respostas sobre a semana, agrupados em rotina/agenda, clima e cansaço/dificuldade. É registro, não julgamento.

## Verificação em produção (17/09/2026, dados reais do Sérgio)

- **Resumo:** "Melhorando: ritmo em corridas comparáveis. Estável: consistência. Ainda sem dados para afirmar: esforço nos mesmos treinos."
- **Consistência:** 7 das últimas 8 semanas; 1,8 corrida por semana (12,1 km) contra 2 (11,3 km) → estável. Confere com a contagem manual (7 corridas nas 4 semanas recentes, 8 nas 4 anteriores).
- **Rotina × plano:** "O plano prevê 3 corridas por semana; sua rotina tem comportado 2 com mais regularidade." Corridas por semana nas 8 semanas com plano: 1, 2, 3, 2, 2, 3, 2, 0.
- **Ritmo comparável:** 14 s/km mais rápido em média, em 6 pares. Exemplo mostrado: 6 km a 6:02/km com FC 159 em 14/09 contra 6,4 km a 6:17/km com FC 165 em 02/06.
- **Esforço:** 1 treino avaliado desde 14/09 — o de 16/09 fica de fora porque foi adaptado. Sem dados para comparar ainda.
- **Adaptações:** 1 treino trocado e registrado depois · rotina ou agenda 1× (resposta sobre a semana de 07/09) · cansaço ou dificuldade 1× (check-in de 16/09).

**Testes:** `tests/progress-reading.test.ts` (17 casos, incluindo as semanas reais do Sérgio como caso de estabilidade). Suíte: 71 arquivos, 1.349 testes, `tsc` limpo.

## Limites conhecidos

- **Temperatura** quase nunca vem do Strava para esta conta, então o critério de calor raramente se aplica; um par junho × setembro pode ter clima bem diferente. O mesmo vale para subida em corridas antigas sem o dado.
- **Pares com lesão por perto:** a base de junho inclui semanas em torno da meia maratona e do incômodo no joelho, que podem deixar o "antes" artificialmente lento. Os critérios não sabem disso.
- **Treinos fortes não são comparados** porque não temos as voltas (laps); comparar ritmo médio de sessões intervaladas seria enganoso.
- **O esforço depende dos check-ins**, que começaram em 16/09; a leitura fica "sem dados" por algumas semanas.
- As leituras são recalculadas a cada visita; não há histórico de como a leitura mudou.
