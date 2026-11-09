# Prévia local do Limiar

A prévia abre as próprias telas do app com uma conta de exemplo. É útil para que duas pessoas ou IAs que trabalham na mesma cópia vejam exatamente o que está sendo editado, sem usar a sessão de um atleta ou pedir credenciais.

## Como rodar

Na raiz de `limiar-app`, com Node.js 20 ou superior:

```bash
npm ci
npm run dev:preview
```

No PowerShell, use `npm.cmd` no lugar de `npm` se a política de execução bloquear `npm.ps1`. Se as dependências já estiverem instaladas, basta rodar o segundo comando. Abra [http://127.0.0.1:4310/dev](http://127.0.0.1:4310/dev). Se a porta estiver ocupada, rode `npm run dev:preview -- --port 4311` e abra a porta escolhida.

- **Atleta com histórico.** Entre uma vez e navegue pelo menu ou abra os caminhos abaixo. A Hoje pode convidar para o Debrief do pedal fictício. Feche o convite para seguir pela navegação ou use-o para revisar o pós-treino.
- **Primeiro acesso.** Abre o onboarding. Volte a `/dev` e escolha este cenário novamente para receber uma conta nova, com um rascunho separado.
- Altere `src/` e `public/` na cópia de trabalho, não na pasta temporária. Mudanças nesses diretórios entram na prévia sem reiniciar o servidor. Reinicie se mudar o script, os dados de exemplo ou um arquivo de configuração do projeto.
- Se outra IA estiver na mesma máquina, aponte-a para a mesma cópia e para o endereço acima. Se estiver em outra máquina ou checkout, ela precisa destes arquivos na própria cópia e deve iniciar o comando lá. `127.0.0.1` é sempre a máquina em que o navegador está rodando. Não é necessário compartilhar `.env.local`.
- Para revisar mobile, abra o modo responsivo do navegador a 390 px. Use `Ctrl+C` para encerrar o servidor e descartar as alterações feitas nos dados fictícios.

| Tela | Caminho | Exemplo disponível |
| --- | --- | --- |
| Hoje | `/` | Rodagem prevista, recuperação, pedal realizado e movimento da semana |
| Treinador | `/coach` | Plano atual e próximo, corrida estruturada e musculação |
| Histórico | `/runs` | Corridas, ciclismo, força e detalhes |
| Saúde | `/health` | Sono, HRV, repouso, carga e peso |
| Amigos | `/friends` | Amigo fictício e feed |
| Limi IA | `/ia` | Uma conversa de exemplo e sugestões calculadas dos registros locais |
| Configurações | `/settings` | Perfil fictício e integrações desabilitadas |

## Como funciona

`scripts/dev-preview.mjs` roda o Next.js numa pasta temporária, sem arquivos `.env` nem credenciais herdadas. Ele espelha `src/` e `public/` e reutiliza as dependências já instaladas. O serviço local em `scripts/dev-preview-backend.mjs` fornece sessão e o subconjunto de consultas que as telas usam; os registros ficam em memória e vêm de `scripts/dev-preview-data.mjs`. Algumas ações de formulário e de treino gravam somente nessa memória. O app mantém sua navegação, seus componentes e suas rotas de leitura usuais.

Os dois serviços escutam apenas em `127.0.0.1`. A entrada `/dev` exige modo de desenvolvimento e a configuração da prévia. Rotas externas de Strava, Whoop, sincronização, push, jobs e transcrição ficam bloqueadas nesse processo. A prévia não exercita provedores externos, e o simulador não cobre todas as operações, restrições ou políticas do Supabase. Use homologação para validar persistência, RLS, OAuth, transcrição e respostas livres da IA. A prévia não exige migration nem muda o Supabase remoto.

## Verificação

A entrada abriu sem login manual; a rota principal continuou redirecionando sem sessão. Com sessão fictícia, Hoje, Treinador, Histórico, Saúde, Amigos, Limi IA e Configurações retornaram 200, e o feed retornou o amigo fictício. A rota de conexão do Strava retornou 403. No navegador, a Hoje mostrou a rodagem e o pedal; a navegação abriu a agenda real; o onboarding avançou para a identificação, salvou um nome fictício e recomeçou da abertura quando o cenário foi escolhido de novo. Uma edição na entrada apareceu no navegador sem reiniciar o servidor.

Os 1.810 testes da suíte e o build otimizado passaram. Ao executar o build em modo de produção, `/dev` e `/dev/entrar` retornaram 404, sem emitir sessão, mesmo com a flag da prévia configurada.
