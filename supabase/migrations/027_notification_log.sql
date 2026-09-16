-- One morning notification per athlete per day, however many times the job runs.
--
-- The morning notification now waits for the night's data instead of firing at
-- a fixed 05:30, which means the job runs repeatedly through the early morning
-- and sends each athlete's message on the first run that has something to say.
-- This row is what makes "the first run" a fact the next run can see.

create table if not exists notification_log (
  user_id  uuid not null references auth.users(id) on delete cascade,
  kind     text not null,
  date     date not null,
  sent_at  timestamptz default now() not null,
  detail   text,
  primary key (user_id, kind, date)
);

-- Server-only: written and read by the cron with the service role.
alter table notification_log enable row level security;
