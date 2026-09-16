# Excluir tipos de treino ("Não faço treino em ladeira")

## Origem

Check-in pós-treino de Sérgio em 16/09/2026, na observação: *"Não faço treino em ladeira. Fiz OUTRO treino, 2 km de aquecimento, 8 tiros de 400 m e 1,25 km de desaquecimento."* O cardápio do mesociclo tinha prescrito "Subidas 6×45 s" e não havia como o atleta dizer que não faz esse tipo de sessão. Pedido em seguida: *"cria a opção de excluir ladeira"*.

## Como funciona

- **Onde:** Treinador → Sua configuração → Minha semana → **Tipos de treino** → chave *"Não faço treino em ladeira"*.
- **Guardado em:** `profiles.training_prefs.excludedQuality` (ex.: `["hills"]`), validado por `normalizePrefs`.
- **Motor:** `qualityForWeek(semana, bloco, excluídos)` em `mesocycle.ts` roda o rodízio **sobre o cardápio filtrado**, em vez de pular a sessão excluída para a próxima da lista. Assim semanas seguidas continuam diferentes (pular para o item seguinte daria fartlek duas semanas seguidas sempre que o bloco caísse nele).
- **Quando vale:** a partir da **próxima semana**. A semana em andamento nunca é reescrita; ao ligar ou desligar a chave, o plano da semana seguinte é refeito na hora.
- **O que pode ser excluído (no motor):** subidas, fartlek, repetições curtas, intervalados densos e progressivo. **Intervalados e limiar nunca saem** — são os dois que Daniels considera indispensáveis e garantem que o rodízio nunca fique vazio. A tela, por enquanto, só oferece a ladeira.
- **Frescor do plano:** a exclusão entra na impressão digital do plano **só quando existe**. Incluí-la sempre mudaria a impressão de todos os planos já gravados e acenderia o aviso "plano desatualizado" para todos os atletas de uma vez — o início do incidente de 31/08.

## Com os dados do Sérgio

A semana de 21/09 é a semana 3 do bloco 9: o padrão seria **fartlek**; com ladeira excluída, passa a ser **repetições curtas** (o rodízio muda porque roda sobre o cardápio sem subidas).

A chave foi criada e está **desligada**: ligar é uma decisão do atleta, um toque.

## Testes

`tests/mesocycle.test.ts` (nunca prescreve subida para quem excluiu, em 12 blocos; semanas seguidas diferentes; rodízio de quem não excluiu nada fica idêntico; intervalados e limiar não são excluíveis) e `tests/plan-freshness.test.ts` (não marca planos antigos como desatualizados; marca quando a pessoa exclui; só aceita tipos conhecidos).
