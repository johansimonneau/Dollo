-- Émulation minimale de Supabase (rôles, auth.users, auth.uid(), privilèges par défaut)
do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', now()),
 ('00000000-0000-0000-0000-00000000000b', 'bob@example.com',   now()),
 ('00000000-0000-0000-0000-00000000000c', 'carol@example.com', now()),
 ('00000000-0000-0000-0000-00000000000d', 'dave@example.com',  null);   -- e-mail NON vérifié
