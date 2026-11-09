# Estabilização antes do redesign · 09/11/2026

## 1. Acesso e dados no dispositivo

- O cadastro valida o convite no servidor e a migration 041 o consome dentro da criação da conta. Cadastro direto pela API de Auth também precisa de um convite válido. Uma falha no cadastro reverte o consumo. O convite legado compartilhado é desativado pela migration. Quem cria contas pelo painel de administração também passa pela regra do banco.
- O retorno do Strava confere o identificador aleatório da tentativa e a conta logada. A confirmação só aparece se a conexão for gravada. O cancelamento ou a falha mostram um caminho para tentar de novo.
- O plano offline e o rascunho de execução têm chave por conta. O logout limpa essas cópias e as versões antigas do cache. O service worker armazena somente recursos públicos. Um treino já aberto pode continuar offline. Abrir o app do zero sem rede mostra a página offline genérica.

## 2. Primeiro acesso

- O onboarding mantém a etapa por conta neste aparelho, retoma depois do Strava e permite pular a conexão. A migration 042 marca a conclusão em uma coluna própria e preserva quem já tem plano semanal.
- É possível escolher corrida, musculação ou as duas. Para musculação, os dias e o local alimentam a rotina inicial e o motor inclui exercícios utilizáveis na primeira sessão. Quem treina só musculação pula as etapas de unidade de corrida e teste de 3 km. A identificação pública é exigida ao entrar na área social.
- O botão final espera o plano gravado. A abertura usa a semana e o dia da primeira sessão, inclusive se ela estiver na próxima semana. A tela final retira os números demonstrativos que pareciam dados do atleta.

## 3. Treinador, Hoje e Histórico

- O registro pelo modo de execução salva as séries e o evento de musculação em uma transação na migration 043. Se houver uma única atividade compatível do Strava com sobreposição de horário, o registro aparece uma vez. Sem horário suficiente ou com mais de um candidato, os registros permanecem separados. O histórico detalhado de séries ainda usa uma sessão por atleta e data.
- O Treinador atualiza o realizado ao voltar à página, retomar a aba ou recuperar a conexão. O dia aberto acompanha o plano atualizado. Uma semana só de musculação já tem um recado compatível com a agenda, inclusive quando o texto salvo antigo falava de corrida.
- Para um atleta ativo, uma semana curta sem explicação segura o volume sem aumentar. Se voltar a ocorrer, o app pergunta se o plano ainda cabe na rotina. Trabalho, clima e agenda mantêm o volume sem compensação. Quando o atleta pede redução, a decisão entra no planejamento. Semanas de recuperação planejada e a lógica de retorno após inatividade continuam com suas regras próprias.
- A análise complementar de corrida fica separada do feedback principal. A instrução da IA restringe a leitura ao treino realizado. A avaliação do plano continua no fluxo estruturado.

## 4. Operação

- Recibos de tarefas distinguem execução completa, parcial e erro. Falhas por atleta ficam visíveis no diagnóstico. A rotina semanal considera também quem tem atividade recente e nenhuma corrida.
- A geração verifica a gravação da semana. A importação manual do Strava informa quando apenas parte dos registros foi salva, preserva o que entrou e registra o resultado. Configurações distingue a data da última importação manual da atualização da conexão.

## Evidências

| Checagem | Resultado |
| --- | --- |
| Cadastro e primeiro treino no navegador local | Convite inválido rejeitado. Conta fictícia criada. Etapa retomada ao recarregar. Strava pulado. Rotina de força configurada. Exercícios disponíveis. Uma série salva e atividade visível em Agenda, Hoje e Histórico. |
| Abertura da sessão no build final | A conclusão encaminhou para quarta, primeiro dia da rotina escolhida. O build otimizado mostrou quarta aberta, cinco exercícios e os controles da sessão. |
| PostgreSQL descartável | Executadas as migrations 041 a 043 com `scripts/verify-audit-db.mjs`. Verificados convite inválido e expirado, rollback do consumo, preenchimento de onboarding, retentativa de musculação, os dois sentidos de chegada do Strava, sessões distintas e isolamento entre contas. |
| Suíte e compilação | 1.798 testes em 104 arquivos. TypeScript e build otimizado verificados em ambiente isolado. |

## Liberação e pendências

O ambiente local usou Auth e PostgREST simulados para a jornada de tela e PostgreSQL descartável para as regras do banco. O checkout aponta para o Supabase de produção e não há projeto de homologação identificado. A produção segue com a versão anterior e as migrations 041 a 043 aguardam publicação.

1. Preparar uma instância Supabase de homologação a partir do schema completo. O schema versionado tem lacunas históricas e o banco descartável monta somente o subconjunto necessário aos testes das migrations.
2. Aplicar 041 a 043 e publicar o mesmo código em homologação. Confirmar e-mail, login e recuperação, convites válidos e vencidos, duas contas no mesmo dispositivo, Strava real com consentimento e retorno, primeira semana com e sem Strava e relógio compatível. Usar contas e atividades de teste.
3. Após essa validação, aplicar as migrations e publicar o app na mesma janela. O novo cadastro depende da 041. O cadastro antigo também fica incompatível depois que a 041 exige os metadados do convite. Criar um convite novo para testar e conferir os recibos depois da primeira execução agendada.

A agenda escolhia a primeira atividade quando havia mais de uma do mesmo esporte no dia. Esse ajuste foi concluído na etapa seguinte: [vínculo entre atividade e treino](./vinculo-atividade-treino.md). Permanece a limitação de exclusão: o webhook existente trata a exclusão de corrida, mas não propaga a exclusão de outras atividades do Strava. O caso de força vinculado exige preservar as séries locais.

## Interface para a próxima etapa

- **Hoje.** O treino do dia ocupa a primeira posição útil, com uma ação principal. Abaixo, movimento da semana com atividades registradas de todos os esportes. Carga, gráficos e detalhes entram por toque.
- **Treinador.** A ação acompanha o estado. Antes, começar. Durante, retomar. Depois, ver o registro. A agenda atual ainda oferece começar e mandar ao relógio depois de o treino estar registrado. O modo de execução também pode tornar mais fácil salvar um treino interrompido sem passar por todos os exercícios.
- **Onboarding.** Mostrar cedo o primeiro treino que será entregue. Pedir apenas o que muda essa entrega. Explicar o ganho de conectar o Strava e deixar a opção de seguir visível. Para corrida sem histórico, experimentar uma pergunta curta sobre o que já consegue correr antes de pedir um teste máximo.
- **Identidade visual.** Começar por um protótipo em 390 px de Hoje e do onboarding. Usar imagem para dar identidade ao começo da jornada e contraste para destacar a ação. Conferir legibilidade de textos pequenos, etiquetas de estado e contraste nos dois temas. Testar primeiro acesso, treino previsto, treino registrado e tela vazia com a mesma estrutura.
