# Item 1 — segurança e push (15/10/2026)

## Uma correção no que eu te disse antes

Eu recomendei "corrigir e depois publicar, porque publicar o código é o que
torna essas duas falhas descobríveis". **Isso estava errado.** Conferi o que já
está no GitHub:

- `supabase/migrations/002_social.sql`, com a policy permissiva, está público
  desde **junho**.
- `src/app/api/strava/webhook/route.ts`, com o delete sem dono, também.

As duas estão expostas há quatro meses. O push não muda nada na exposição —
o que muda é que **as falhas são urgentes por si**, não por causa dele.

O push, por outro lado, é puro ganho: são 47 commits que existem só no OneDrive.

---

## 1. O webhook do Strava ✅ corrigido e no ar

### O que era

A rota é pública — tem que ser, é um webhook. Mas não conferia nada, e o
caminho de `delete` apagava uma corrida **só pelo id da atividade**:

```
POST /api/strava/webhook
{ "object_type":"activity", "aspect_type":"delete", "object_id": 123 }
```

marcava `deleted_at` na corrida 123 **de quem quer que fosse o dono**. Ids de
atividade do Strava são sequenciais e públicos para atividades públicas:
apagar o histórico de um atleta era um laço de `for`.

### O que entrou

Duas travas, nesta ordem de importância:

1. **O dono.** O evento diz de quem é a atividade (`owner_id`); a corrida só é
   tocada se pertencer a esse atleta. Não depende de configuração nenhuma, e é
   a que fecha o buraco. Atleta que nunca conectou o Strava devolve `null` — e
   `null` significa "não há nada a fazer", nunca "pode fazer em todo mundo".
2. **A assinatura.** `subscription_id` tem que ser a nossa (364100, lida da
   própria API do Strava e posta em `STRAVA_SUBSCRIPTION_ID` na Vercel). Barra
   o ruído e o forjador preguiçoso; sozinha não bastaria, porque o id da
   assinatura não é segredo.

### Verificado em produção

```
assinatura forjada  → 403
sem assinatura      → 403
assinatura correta  → 200
```

(com um `object_id` que não existe, de propósito: nenhuma linha foi tocada em
nenhum dos três casos)

E nove testes em `tests/strava-webhook-auth.test.ts` para que não volte.

---

## 2. A policy de `profiles` ⏸ escrita, esperando acesso

### O que é

```sql
create policy "Authenticated can search profiles"
  on profiles for select
  using (auth.role() = 'authenticated');
```

O comentário ao lado dela, em `002_social.sql`, diz *"Only id/name/username are
exposed via the API layer"*. Só que **RLS filtra linhas, não colunas**. A
policy libera a tabela inteira: qualquer usuário logado, com a anon key que vai
no navegador, pode fazer `select * from profiles` e ler e-mail, data de
nascimento, altura, sexo e o **`wellness_token`** de todo mundo. O token
autentica o endpoint público `/api/ingest/wellness` — com ele dá para gravar
dados de saúde no nome de outra pessoa.

### O que vai entrar — `039_profiles_leak.sql`

1. **`public_profiles`**, uma view com as três colunas que um atleta pode saber
   de outro. Ela atravessa o RLS de `profiles`, mas **não pode devolver uma
   coluna que não está escrita nela**. É a diferença entre confiar na
   disciplina de cada rota e não ter o que vazar.
2. A policy larga sai; cada um passa a ler o seu próprio perfil.

A migration começa e termina listando as policies de `profiles`, porque a
tabela foi criada fora das migrations (dívida C4) e não há como saber daqui
quais existem. A policy de leitura própria só é criada se faltar.

### O código já acompanha

- `/api/friends` (busca por username e nomes dos amigos) → lê `public_profiles`.
- `/api/friends/suggestions` → passou para o cliente administrativo, no
  servidor, com a lista de colunas escrita na rota. Ela compara esportes, dias
  de treino e idade de todo mundo para sugerir quem treina parecido, e devolve
  só os nomes que passaram no filtro: precisa de colunas que ninguém pode ler
  de ninguém.
- `/api/friends/leaderboard` e `/api/friends/achievements` já usavam o
  administrativo.

### Por que não apliquei

A sessão do Supabase no Chrome expirou — o SQL Editor pede login, e isso é
coisa sua. **Entre no Supabase e eu aplico, confiro no `pg_policies` e sigo
para o push.**

### Uma decisão que é sua

Os `wellness_token` ficaram legíveis por qualquer usuário logado durante quatro
meses. São oito contas, todas de amigos seus, então o risco real é baixo — mas
o número honesto é "não dá para saber". Rotacioná-los fecha isso de vez e
**quebra o Atalho do iPhone de quem já configurou**, até a pessoa copiar o
token novo. Me diz se quer, e eu faço junto com a migration.

---

## 3. O push ⏸ esperando o item 2

47 commits locais, último push em **16/06**. Conferi o histórico inteiro: **não
há segredo nenhum** — só placeholders em `.env.local.example`, `README.md` e
`PROJETO_LIMIAR.md` (`xxxxx`, `12345`, prefixos de JWT truncados), e o
`.gitignore` cobre `.env` e `.env*.local`.

O que me faz segurar o push até a policy estar corrigida não é o código: é o
**`HANDOFF.md`**, que descreve a falha com nome, impacto e o que dá para fazer
com o token. Publicar isso enquanto está aberta é entregar o mapa. Depois da
039, o mesmo texto vira a história de algo resolvido.
