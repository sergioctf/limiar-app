-- 038 — Uma sugestão pode se resolver sozinha.
--
-- O conselheiro guarda cada achado como uma linha com três destinos possíveis:
-- `pending` (está lá), `accepted` (o atleta aplicou) e `dismissed` (o atleta
-- dispensou). Faltava o quarto, que é o mais comum de todos: **o problema
-- acabou**.
--
-- O atleta move a sessão de dia, o conflito some, e a linha fica `pending` para
-- sempre. Duas consequências reais, vistas na conta do Sérgio em 01/10:
--
--   • a notificação semanal (`/api/cron/notify-advisor`) lê linhas `pending` da
--     semana e podia empurrar um aviso sobre um conflito que não existe mais;
--   • a tabela acumula achados mortos, e quem for ler o histórico não distingue
--     "ele ignorou" de "ele resolveu".
--
-- `resolved` é o estado de quem resolveu sem clicar em nada — que é como a
-- maioria dos problemas de plano termina.

alter table public.advisor_suggestions
  drop constraint if exists advisor_suggestions_status_check;

alter table public.advisor_suggestions
  add constraint advisor_suggestions_status_check
  check (status in ('pending', 'accepted', 'dismissed', 'resolved'));
