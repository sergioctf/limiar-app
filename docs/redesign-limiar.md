# Redesign do Limiar

O [Master Prompt](./redesign-master-prompt.md) é a especificação de produto. Este documento liga a especificação à implementação e às verificações do repositório. A revisão usa o checkout mais recente da área de trabalho, que contém a estabilização anterior e as migrations 041 a 043.

## Diagnóstico

Next.js App Router e Tailwind 3 compartilham os componentes de superfície. Supabase cuida da sessão, dados, políticas e rotinas. O Treinador já separa semana, sessões, estado do dia e explicação. A Hoje usa as mesmas regras de registro. A IA central já oferece respostas estruturadas e perguntas livres com o dossiê montado no servidor. O feedback de corrida já tem comparação planejado × realizado, esforço de cinco níveis, contexto, adiamento, memória por atividade e confirmação de redução. A intenção é estender essas peças. O risco de duplicação está sobretudo em criar outro motor de treino ou outro histórico de respostas.

As imagens `capa.jpeg`, `treinador.jpeg`, `telas_ideia_inicial.jpeg` e `IA.jpeg` orientam composição. `novos_logos.jpeg` orienta marca. `icons.jpeg` e `icons2.jpeg` são estudos de materiais e movimento. Os valores ilustrativos e os detalhes de navegador nos conceitos servem à composição. A prioridade da Hoje é o treino do dia, com recuperação contextual e movimento registrado abaixo.

## Arquitetura visual

- Paleta de superfícies semânticas nos dois temas. Preto aeroespacial #08070D, superfície #14111C, roxo principal #6D28D9, ação #8B5CF6, lavanda #B18AFF e prata #C9D0E6. Estados de alerta, disponibilidade e modalidade continuam legíveis por texto e cor.
- Tipografia do sistema com números tabulares nas métricas. Espaçamento base de 4 px. Superfícies regulares discretas e destaque cromado reservado para o treino prioritário, foco da semana, abertura e momentos de IA.
- Controles comuns continuam nos componentes de UI existentes. SVGs reutilizáveis para anéis, placas, fita e marca. A esfera e a fita são objetos distintos. Movimento local por transformação e opacidade, com redução de movimento e sem renderizador 3D global.
- O onboarding usa uma imagem editorial gerada para a abertura. As demais etapas usam escolhas reais, rascunho local por conta e a resposta do motor já persistida ao final.

## Fases e componentes

| Fase | Implementação | Verificação |
| --- | --- | --- |
| Auditoria e fundação | Tokens, temas, marca, navegação e componentes de material | Contraste, zoom, mobile e identidade em claro e escuro |
| Entrada e telas principais | Cadastro, onboarding, Hoje, Treinador, Histórico, Saúde e Amigos | Estados vazios, tela estreita e preservação de rotas e ações |
| Limi IA | Esfera por estado, lançador global, sugestões estruturadas e conversa existentes | Respostas reais, retomada de conversa e alternativa de texto |
| Debrief | Convite contextual, fluxo em etapas, fita, PSE, observações e resultado | Salvar, adiar, dispensar, reabrir, editar e confirmar impacto |
| Refinamento | Acessibilidade, redução de movimento, migrations e documentação | Suíte, build, banco descartável e jornadas isoladas |

O Debrief reutiliza a avaliação existente de corrida. A PSE de 0 a 10 é separada do esforço qualitativo antigo para preservar histórico e limiares do motor. Voz, onde suportada, exige ação explícita e revisão antes de enviar. A análise indica o que veio de dados, a avaliação do motor e o impacto confirmado. O plano só muda após confirmação pelo fluxo existente.

A validação de Supabase Auth, Strava e relógio reais continua dependente de homologação. Quando há duas atividades elegíveis no dia, a agenda pede que o atleta escolha qual corresponde ao treino. Veja as regras e a verificação do [vínculo entre atividade e treino](./vinculo-atividade-treino.md).

## Implementação entregue

- **Fundação e marca.** A paleta violeta e prata passou para Tailwind, CSS e interface instalada. O ícone novo tem SVG e PNG de 192 e 512 px. A arte gerada para o onboarding pesa cerca de 52 KB. Botões, navegação, campos, abas e superfícies compartilham contraste e espaçamento. As séries dos gráficos continuam distinguíveis. O zoom do navegador foi liberado.
- **Onboarding.** A abertura promete o primeiro treino e mostra uma imagem editorial. O formulário usa diálogo nativo, foco por etapa, rolagem interna e ações de pular. A conclusão abre a sessão salva. Falhas na unidade e na marcação do teste aparecem com mensagem na própria etapa. Corrida e musculação já têm rotina inicial guiada. As demais modalidades continuam nas preferências existentes.
- **Hoje.** Saudação, treino do dia com uma ação, recuperação e recomendações contextuais, movimento registrado e detalhes sob demanda. O seletor semanal mostra os dias e duração de atividades registradas de todos os esportes. Atividade sem plano ainda aparece na Hoje. Contas que não correm não recebem convite de calibração de corrida.
- **Treinador, Histórico, Saúde e Amigos.** O cartão Foco da semana vem da fase real, com o recado completo sob expansão. A agenda abre no dia certo e o botão da musculação alterna entre começar, retomar e ver atividade. É possível encerrar e salvar as séries feitas. O Histórico preserva busca, filtros, mapa e detalhes. Saúde mantém procedência, dados e gráficos com o anel de recuperação em material próprio. Amigos prioriza o feed e coloca ranking sob expansão.
- **Limi IA.** A esfera usa placas SVG que se afastam nos estados ativos, núcleo e reflexos. O lançador tem espaço na barra mobile para deixar as ações da página livres. As respostas rápidas continuam determinísticas. A Memória de treino inclui percepção e PSE recentes sem enviar as observações livres no dossiê.
- **Debrief.** Convite por atividade, esforço, PSE opcional, contexto, observação, análise e resultado. A fita animada continua montada entre as etapas. Corrida preserva a decisão explícita para redução de carga. Outras modalidades usam comparação quando há um único registro compatível ou quando o atleta confirmou o vínculo, e não alteram a prescrição. O Histórico abre o feedback salvo e permite editar. A migration 044 guarda as últimas cinco revisões relevantes por atividade com acesso do próprio atleta.
- **Voz.** Captura pelo navegador por até 45 s. O áudio fica em memória até o toque em Transcrever, quando é enviado à Groq com consentimento. O texto volta editável. Não há persistência de áudio no app. O servidor exige sessão, limita tamanho e frequência e trata indisponibilidade. [Documentação de transcrição](https://console.groq.com/docs/speech-to-text).

## Verificação e publicação

- No navegador a 390 px, cadastro fictício → onboarding sem Strava → rotina de musculação → semana gravada → primeira sessão aberta → uma série registrada. O Debrief apareceu na Hoje, salvou PSE 6 e uma observação e reapareceu no detalhe da mesma atividade no Histórico. Uma leitura rápida da Limi IA retornou os 20 minutos registrados no ambiente de teste. Em 360 px, a Hoje escura ficou sem rolagem horizontal, sem aviso de calibração indevido e com acesso livre ao plano. A Memória de treino recuperou o PSE do Debrief salvo.
- Vitest passou com 1.806 testes em 106 arquivos. A transcrição foi verificada com provedor simulado, incluindo sessão, consentimento e texto editável.
- O PostgreSQL descartável executou 041 a 044. Foram conferidos intervalo da PSE, isolamento por usuário, registro da revisão, proteção contra adiamento atrasado e as regras de convite e musculação da estabilização.
- A homologação real precisa verificar o convite com e-mail, Strava, o relógio e a voz em iOS/Android. O ambiente usado na implementação tem autenticação e integração simuladas. A produção e os dados reais não foram alterados.
- Aplicar as migrations pendentes em homologação antes do deploy equivalente. A migration 044 é pré-requisito para a nova persistência do Debrief. A 041 e a publicação do cadastro novo devem ocorrer na mesma janela em produção, conforme o [relatório de estabilização](./estabilizacao-pre-redesign-09-11.md).

## Limites e próximos ajustes

- A confirmação de vínculo está disponível na agenda da semana atual. O próximo ajuste é levar a resolução de pendências da semana anterior ao Histórico ou a uma revisão semanal curta.
- A análise imediata usa regras e fatos do treino. As tendências de feedback estão disponíveis como fatos no dossiê. Cruzamentos específicos como sono × PSE ainda exigem janela, cobertura e regras de comparação próprias.
- O movimento usa SVG e CSS, com preferência por redução de movimento. Fluidez e consumo em aparelhos reais ainda precisam ser medidos. O ditado exige navegador com gravação compatível e credencial da Groq no servidor.
