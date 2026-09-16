-- Usernames have to be unique, and the application check is not enough.
--
-- Two people picking the same handle in the same second both pass a
-- "SELECT ... WHERE username = ?" and both write. The route already turns a
-- unique violation into a friendly message; this is what raises it.
--
-- Case-insensitive because @Sergio and @sergio are the same person to everyone
-- except the database.

create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username))
  where username is not null;
