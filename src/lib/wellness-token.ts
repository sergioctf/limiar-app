import { createHash, randomBytes, timingSafeEqual } from "crypto";

/**
 * O token do Atalho do iPhone — guardado como impressão digital, não como ele.
 *
 * ## O que estava errado
 *
 * `profiles.wellness_token` guardava o token **em texto puro**, e a policy
 * `"Authenticated can search profiles"` libera a tabela inteira para qualquer
 * usuário logado (dívida C3): **RLS filtra linhas, não colunas**. Ou seja, com
 * a anon key que vai no navegador dava para ler o token de qualquer atleta — e
 * o token autentica `/api/ingest/wellness`, que grava sono, HRV e calorias.
 * Com ele na mão, dava para inventar a noite de outra pessoa.
 *
 * ## Por que o conserto é este, e não a policy
 *
 * A policy é o conserto certo, e está escrita em `039_profiles_leak.sql`. Mas
 * ela precisa de DDL, o DDL precisa do SQL Editor do Supabase, e o Supabase
 * entra por GitHub — que é exatamente o que está fora do ar (Sérgio, 18/10).
 *
 * Guardar o hash não precisa de DDL nenhum: é a mesma coluna de texto, com
 * outro conteúdo. E fecha a parte que machuca — ler a coluna passa a render um
 * SHA-256, que não serve para autenticar nada. O e-mail e a data de nascimento
 * continuam expostos até a 039 rodar; o que some é a chave da casa.
 *
 * É também como se guarda token de portador em qualquer lugar: nem nós
 * precisamos saber o valor, só reconhecê-lo quando ele chega.
 *
 * ## O preço
 *
 * Ninguém consegue **reler** o próprio token — nem o app. Quem perder, gera
 * outro. É o comportamento normal de uma chave de API, e o custo real aqui era
 * zero: em 18/10 existia **um** token no banco e o Atalho nunca tinha mandado
 * uma linha sequer (as 68 de wellness vieram todas do intervals.icu).
 */

const PREFIXO = "wlt_";

/** Um token novo, em claro. É a única vez que ele existe assim. */
export function newWellnessToken(): string {
  return PREFIXO + randomBytes(24).toString("hex");
}

/**
 * A impressão digital que vai para o banco.
 *
 * SHA-256 sem sal, de propósito: o token tem 48 hex de aleatoriedade vinda do
 * `randomBytes`, então não há dicionário que o alcance, e a busca precisa ser
 * por igualdade exata (`.eq()`), que é o que o PostgREST sabe fazer. Sal
 * exigiria ler cada linha e comparar uma a uma.
 */
export function hashWellnessToken(raw: string): string {
  return createHash("sha256").update(raw.trim()).digest("hex");
}

/** Forma plausível de token — barra o campo vazio antes de ir ao banco. */
export function looksLikeWellnessToken(raw: string | null | undefined): boolean {
  const s = (raw ?? "").trim();
  return s.length >= 16 && s.length <= 128 && /^[A-Za-z0-9_-]+$/.test(s);
}

/**
 * Compara em tempo constante.
 *
 * A busca no banco já é por igualdade, então isto vale para quem comparar dois
 * hashes em memória: um `===` vaza, pelo tempo, quantos caracteres bateram.
 */
export function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
