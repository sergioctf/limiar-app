# O `wellness_token` deixou de ser legível (18/10/2026)

## O contorno

O conserto certo da dívida C3 é a policy, e ela está escrita em
`039_profiles_leak.sql`. Mas ela precisa de DDL → DDL precisa do SQL Editor do
Supabase → o Supabase entra por GitHub → e o GitHub é o que está fora do ar.

Não há `DATABASE_URL` em lugar nenhum (nem no `.env.local`, nem na Vercel —
conferido), que é a dívida C4 cobrando juros: **sem o dashboard, não existe
caminho para DDL neste projeto.**

Mas a parte que machuca dá para fechar **sem DDL nenhum**: é a mesma coluna de
texto, com outro conteúdo.

## O que era

`profiles.wellness_token` guardava o token **em claro**. Com a policy larga,
qualquer usuário logado — usando a anon key que vai no navegador — podia ler o
token de qualquer atleta. E o token autentica `/api/ingest/wellness`, que grava
sono, HRV e calorias: com ele na mão, dava para **inventar a noite de outra
pessoa**.

## O que ficou

**O banco guarda a impressão digital, não o token** (`src/lib/wellness-token.ts`).

- O Atalho manda o token; a rota calcula o SHA-256 e compara com o que está
  guardado. Ler a coluna passa a render 64 caracteres hexadecimais, que não
  autenticam coisa nenhuma.
- SHA-256 sem sal, de propósito: o token tem 48 hex de `randomBytes`, então não
  há dicionário que o alcance, e a busca precisa ser por igualdade exata, que é
  o que o PostgREST sabe fazer.
- **O app não sabe mais o seu token.** O GET passou a responder apenas *se
  existe um*; o valor aparece uma única vez, no instante em que é gerado. É o
  comportamento de qualquer chave de API.
- O GET também **parou de criar um token só porque alguém abriu a tela**.
  Deixar uma chave na porta de quem nunca pediu já era errado; com o hash, ela
  nem poderia ser mostrada depois.

## O custo real foi zero

Antes de mexer, conferi o banco:

| | |
|---|---|
| perfis | 8 |
| com `wellness_token` | **1** (o do Sérgio, formato antigo) |
| linhas de wellness pelo Atalho | **0** — as 68 vieram todas do intervals.icu |

Ou seja: **ninguém nunca usou o Atalho.** Limpei o único token em claro (com
backup do valor antes, fora do projeto) e a coluna ficou vazia. Nenhuma
desconexão, porque não havia conexão.

Também é informação de produto: a feature "calorias pelo Atalho do iPhone"
nunca saiu do papel para nenhum atleta.

## Verificado em produção

```
token inventado       → 401 Token inválido
token antigo do banco → 401 Token inválido
sem token             → 401 Token ausente

tokens restantes na coluna: 0
algum em claro?             nenhum
```

E 12 testes em `tests/wellness-token.test.ts`.

## O que isto NÃO resolve

A policy continua lá. **E-mail, data de nascimento, altura e sexo de todos os
atletas seguem legíveis** por qualquer usuário logado. O que saiu de cena foi a
chave da casa, não a janela.

C3 fica **parcialmente mitigada** até a 039 rodar — e ela depende de você
conseguir entrar no Supabase.
