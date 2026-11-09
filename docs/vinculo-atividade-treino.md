# Vínculo entre atividade e treino

## Comportamento

- A agenda usa a data local do atleta e a modalidade do plano. Com um registro elegível, mantém a associação automática. Com mais de um, mostra **Vínculo a confirmar** e deixa o atleta escolher. O seletor mostra o nome e, quando disponíveis, a distância e a duração, com acesso ao detalhe de cada registro.
- É possível confirmar, trocar e remover a escolha. O registro escolhido aparece ao lado do previsto e abre o detalhe correto. Os demais aparecem como **Também registrado neste dia**. Uma atividade registrada continua sendo parte do histórico e do volume, mesmo quando não é a que corresponde ao plano.
- Hoje, agenda e adesão usam a mesma identificação. Uma pendência não vira falta nem conclusão. A recuperação preserva os sinais e o volume, mas suspende propostas de troca para a sessão principal até o vínculo ser resolvido.
- Debrief e análise de execução só criam uma nova comparação quando a atividade está confirmada ou há um candidato único. A escolha não apaga PSE, contexto ou observações já salvas. Quando há um vínculo explícito, ele determina qual atividade aparece com referência. Sem vínculo explícito, o Debrief pode preservar a prescrição já guardada em feedback anterior.
- Confirmar o vínculo não altera o treino prescrito nem autoriza progressão ou redução de carga. A classificação de cumprimento continua a cargo do motor. Uma anotação pós-treino não passa automaticamente para outra corrida.

## Persistência e segurança

A migration `045_session_activity_links.sql` cria um vínculo por conta, data e modalidade. A linha guarda o identificador da corrida ou atividade, o tipo da sessão e a prescrição no momento da confirmação. O servidor valida a sessão atual, data e modalidade. A política do banco limita a leitura à conta proprietária. A gravação passa pela rota autenticada e o banco revalida dono, data e exclusão. Nenhum vínculo histórico foi criado retroativamente.

A agenda deixa de usar um vínculo se a sessão mudou de tipo. Se um registro selecionado ficar indisponível e restarem candidatos, o Treinador pede nova confirmação em vez de promover outro registro silenciosamente enquanto a escolha anterior ainda existir no banco. A exclusão física é tratada pelas chaves estrangeiras; uma exclusão lógica deixa a atividade inelegível. A exclusão de atividades não corridas no Strava continua sendo uma dívida de sincronização separada.

## Verificação

- Navegador a 390 px com autenticação e dados simulados. No Treinador, duas sessões de força no mesmo dia ficaram pendentes. Foi possível vincular a de 15 min a uma prescrição de 27 min, abrir o Debrief correto e desfazer. A outra ficou fora da comparação e preservou sua PSE 6 já salva.
- PostgreSQL descartável: migrations 041–045, escolha e substituição, remoção, leitura isolada e rejeição de atividade de outra conta, outra data, excluída ou gravada diretamente por conta autenticada.
- Vitest: 1.810 testes em 107 arquivos. A suíte cobre a ambiguidade na agenda, o efeito na adesão e na recuperação, o volume total, a atividade removida e a mudança de tipo da sessão. Build otimizado do Next.js e `git diff --check` passaram.

## Homologação e próximos passos

A versão foi preparada no checkout local. A consulta à Vercel não retornou um ambiente personalizado e não foi possível inspecionar o destino de dados do Preview. O Supabase de homologação não foi confirmado. Não houve aplicação remota de migration, deploy nem alteração de dados reais.

1. Confirmar um Supabase separado com o schema completo, aplicar 041–045 e publicar um Preview apontado a ele. A migration 041 e a versão que usa convites precisam entrar na mesma janela na produção. Consulte o [registro da estabilização](./estabilizacao-pre-redesign-09-11.md).
2. Exercitar cadastro, consentimento e importação reais do Strava, incluindo corrida dupla no mesmo dia, alteração do vínculo, integração com relógio, sincronização tardia e virada de semana. Validar em iOS e Android.
3. Permitir resolver vínculos pendentes de semanas anteriores pelo Histórico ou pela revisão semanal. Hoje o seletor fica na agenda da semana corrente. O modelo atual representa uma sessão de cada modalidade por dia; dois treinos planejados do mesmo esporte, em um mesmo dia, exigirão um identificador estável por sessão.
