-- Invite codes for signup.
--
-- Replaces the access code that lived in the client bundle (and was therefore
-- readable by anyone). Validation now happens server-side against this table.
--
-- Existing users are unaffected: invites gate signup only, never login.

create table if not exists invite_codes (
  id          uuid default uuid_generate_v4() primary key,
  code        text not null unique,
  label       text,                          -- who/what it's for
  max_uses    int  not null default 1,       -- 0 = unlimited
  used_count  int  not null default 0,
  expires_at  timestamptz,                   -- null = never expires
  active      boolean not null default true,
  created_at  timestamptz default now() not null
);

create index if not exists invite_codes_code_idx on invite_codes (lower(code));

-- Who redeemed what, for auditing.
create table if not exists invite_redemptions (
  id          uuid default uuid_generate_v4() primary key,
  invite_id   uuid not null references invite_codes(id) on delete cascade,
  email       text,
  redeemed_at timestamptz default now() not null
);

create index if not exists invite_redemptions_invite_idx on invite_redemptions (invite_id);

-- Locked down: only the service role touches these (the validation endpoint).
alter table invite_codes       enable row level security;
alter table invite_redemptions enable row level security;

-- Keep the code already in circulation working, so nothing breaks mid-flight.
insert into invite_codes (code, label, max_uses, active)
values ('Manoela Pinheiro', 'Código original (migrado do cliente)', 0, true)
on conflict (code) do nothing;
