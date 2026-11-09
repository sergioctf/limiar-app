# Auditoria do redesign — Parte 1: inventário e diagnóstico (09/11/2026)

Li o Master Prompt (1.721 linhas), as sete imagens de referência em
`C:\Users\sctca\Documents\Limiar\Redesing`, os dois relatórios da outra IA e o
diff inteiro. Rodei a suíte, o `tsc` e abri o app.

---

## 1. A dimensão

| | |
|---|---|
| arquivos tocados | **161**, nenhum commitado |
| linhas | 1.626 adicionadas, 1.407 removidas em 127 arquivos |
| arquivos novos | 34 (5 migrations, 6 suítes de teste, Debrief, voz, vínculo) |
| **arquivos apagados** | **1** — `src/lib/invites.ts` |
| testes | 107 arquivos, **1.810 passando** |
| `tsc` | limpo |

Nada foi commitado. Tudo isto vive só na sua pasta — de novo.

## 2. Funcionalidade perdida: **não encontrei nenhuma**

Era a sua primeira pergunta, e a resposta é tranquilizadora.

- **Nenhum componente ou rota foi removido.** O único arquivo apagado,
  `invites.ts`, foi **substituído** pela RPC `signup_invite_status` no banco
  (migration 041) — a validação do convite saiu do código e foi para o
  Postgres com `security definer`. É uma melhoria.
- **A Home parece ter encolhido, mas não encolheu.** Perdeu 167 linhas e ganhou
  73, e eu fui atrás de cada bloco: `OnboardingGate`, `SetupChecklist`,
  `NotificationNudge`, `OvertrainingAlert`, `EntryPrompt` e `AutoStravaSync`
  continuam todos montados. Foi reorganização, não poda.
- **Tudo que fizemos nas últimas semanas sobreviveu:** enviar pro relógio,
  km/tempo, modo de execução, conselheiro agrupado, fluxo do teste de 3 km,
  mapas OSM, recibos dos crons.
- **As mudanças no meu código de observabilidade foram melhorias**, e vale
  registrar: status `partial` para cron que roda mas falha pela metade,
  `ok: false` passando a contar como erro, e o fim de um falso "skipped" que eu
  tinha deixado. Três coisas que eu errei e ela acertou.

**Uma mudança deliberada de comportamento**, que você deveria confirmar: o
resumo semanal da Home passou a mostrar **apenas atividades registradas**, de
todos os esportes. Antes mostrava previsto × realizado. É defensável, mas é uma
decisão de produto, não de estética.

## 3. O risco que impede publicar hoje

Conferi o banco de produção agora:

| o que o código novo exige | produção |
|---|---|
| `signup_invite_status` (RPC) | **AUSENTE** |
| `onboarding_completions` | **AUSENTE** |
| `activity_feedback` | **AUSENTE** |
| `session_activity_links` | **AUSENTE** |

**Se este código subir hoje, o cadastro por convite para de funcionar** — a rota
chama uma RPC que não existe. O Debrief, o onboarding e o vínculo
atividade–treino também quebram.

As migrations 041–045 existem no repositório e foram testadas em PostgreSQL
descartável, mas **não estão aplicadas**. Isso é um bloqueio absoluto, não um
detalhe de sequência.

## 4. O diagnóstico visual: você está certo

Abri o app a 390 px, nos dois temas, e comparei com `telas_ideia_inicial.jpeg`
e `treinador.jpeg`.

**O que a referência tem e o app não tem:**

1. **Liquid chrome como material.** Na referência, a fita cromada é o elemento
   de assinatura: reflexos especulares, áreas claras e escuras, curvatura,
   tridimensionalidade. No app é um `<svg>` com dois `linearGradient` — uma
   fita chapada. O Master Prompt antecipou exatamente este erro: *"Não basta
   preencher um elemento com cinza ou prata… os reflexos devem acompanhar o
   formato de cada superfície."*
2. **Profundidade.** A referência é em camadas: brilho atrás, vidro na frente,
   borda superior iluminada. O app tem retângulos levemente mais claros que o
   fundo, com borda de 1 px.
3. **Roxo com matéria.** O botão "Entrar" é um `#7c3aed` chapado. Na
   referência, todo roxo tem gradiente, brilho de borda e profundidade.
4. **Tipografia.** A referência usa display mais pesado e apertado nos números
   e nos títulos; micro-rótulos em caixa alta bem espaçada. O app manteve a
   escala tipográfica antiga.
5. **A esfera da Limi IA.** Na referência é um orbe metálico 3D com pétalas e
   luz interna. No app é um SVG plano com gradientes.

**O veredito honesto:** a arquitetura está certa — existe `aerospace.css` com
movimento, existe `ChromeRibbon`, existe `LimiOrb`, existem tokens novos e a
cor laranja saiu. O que falta não é estrutura, é **acabamento de material**. Na
prática, o roxo foi aplicado por cima — que é literalmente o que o Master
Prompt pediu para não fazer.

Também notei que o **modo claro** virou um formulário lavanda chapado, longe do
*"igualmente premium"* que o prompt exige.

## 5. O que eu proponho, por partes

**Parte 2 — Destravar e proteger** (antes de qualquer pixel)
Aplicar 041–045 no Supabase, conferir cada tabela e RPC, e **commitar os 161
arquivos**. Hoje quatro meses de redesign estão num único disco, sem commit. É
meia hora e tira o projeto do risco.

**Parte 3 — O material cromado**
Trocar o `ChromeRibbon` chapado por cromado de verdade: múltiplas paradas de
gradiente acompanhando a geometria, reflexo especular móvel, camada de brilho
violeta. Mesma coisa para a esfera da Limi IA. É aqui que mora 80% da distância
entre o app e a referência.

**Parte 4 — Profundidade e superfícies**
Vidro com borda superior iluminada, elevação real, roxo com gradiente, sombras
violetas. Reconstruir o `Card`/`Surface` como material, não como retângulo.

**Parte 5 — Tipografia e ritmo**
Escala de display, micro-rótulos espaçados, respiro entre blocos.

**Parte 6 — Tela a tela, com você**
Hoje, Treinador, Histórico, Saúde, Amigos e Limi IA, cada uma comparada lado a
lado com a referência.

**Parte 7 — Modo claro**
Interpretação própria da identidade, não o escuro invertido.

### Uma coisa que preciso de você

Para iterar no visual das telas internas eu preciso **vê-las rodando**, e elas
exigem login. Vou montar rotas `/dev` com dados de exemplo (a outra IA já
deixou a porta aberta no middleware, restrita a desenvolvimento) — assim
comparo cada tela com a referência sem precisar da sua sessão. Se preferir
outro caminho, me diga.
