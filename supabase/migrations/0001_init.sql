-- Dollo – schéma initial.
-- À appliquer via le SQL Editor de Supabase, ou : psql "$SUPABASE_DB_URL" -f supabase/migrations/0001_init.sql
-- Sécurité : toutes les tables ont la RLS activée ; un utilisateur n'accède qu'aux bébés dont il est membre.

------------------------------------------------------------------------------
-- Tables
------------------------------------------------------------------------------

create table public.babies (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 60),
  birth_date   date,
  -- Code à donner à l'autre parent (10 caractères hexadécimaux, régénérable).
  invite_code  text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  created_by   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now()
);

create table public.baby_members (
  baby_id    uuid not null references public.babies (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'parent' check (role in ('owner', 'parent')),
  joined_at  timestamptz not null default now(),
  primary key (baby_id, user_id)
);
create index baby_members_user_idx on public.baby_members (user_id);

create table public.events (
  id           uuid primary key default gen_random_uuid(),
  baby_id      uuid not null references public.babies (id) on delete cascade,
  kind         text not null check (kind in ('breast', 'bottle', 'diaper', 'sleep')),
  started_at   timestamptz not null,
  -- Null tant que la tétée / le sommeil est en cours.
  ended_at     timestamptz,
  side         text check (side in ('left', 'right')),
  amount_ml    integer check (amount_ml between 0 and 1000),
  diaper_type  text check (diaper_type in ('pee', 'poop', 'both')),
  note         text check (char_length(note) <= 500),
  created_by   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint events_end_after_start check (ended_at is null or ended_at >= started_at),
  -- Chaque type d'événement n'a que les champs qui le concernent.
  constraint events_kind_fields check (
    (kind = 'breast' and side is not null and diaper_type is null and amount_ml is null)
    or (kind = 'bottle' and side is null and diaper_type is null)
    or (kind = 'diaper' and diaper_type is not null and side is null and amount_ml is null)
    or (kind = 'sleep' and side is null and diaper_type is null and amount_ml is null)
  )
);
create index events_baby_started_idx on public.events (baby_id, started_at desc);

------------------------------------------------------------------------------
-- Fonctions & triggers
------------------------------------------------------------------------------

-- Appartenance de l'utilisateur courant à un bébé. SECURITY DEFINER pour éviter la récursion de RLS
-- sur baby_members.
create or replace function public.is_baby_member(p_baby_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.baby_members m
    where m.baby_id = p_baby_id and m.user_id = auth.uid()
  );
$$;

-- Le créateur d'un bébé en devient automatiquement « owner ».
create or replace function public.add_creator_as_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.baby_members (baby_id, user_id, role) values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

create trigger babies_add_owner
  after insert on public.babies
  for each row execute function public.add_creator_as_owner();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger events_touch_updated_at
  before update on public.events
  for each row execute function public.touch_updated_at();

-- Rejoindre un bébé avec le code d'invitation de l'autre parent.
create or replace function public.join_baby(p_code text)
returns public.babies
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.babies;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into b
  from public.babies
  where invite_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));

  if not found then
    raise exception 'invalid_code' using errcode = 'P0002';
  end if;

  insert into public.baby_members (baby_id, user_id, role)
  values (b.id, auth.uid(), 'parent')
  on conflict do nothing;

  return b;
end;
$$;

-- Invalide l'ancien code (ex. : il a été partagé par erreur). Réservé au propriétaire.
create or replace function public.regenerate_invite_code(p_baby_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  new_code text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
begin
  update public.babies b
  set invite_code = new_code
  where b.id = p_baby_id
    and exists (
      select 1 from public.baby_members m
      where m.baby_id = b.id and m.user_id = auth.uid() and m.role = 'owner'
    );
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return new_code;
end;
$$;

revoke all on function public.join_baby(text) from public, anon;
revoke all on function public.regenerate_invite_code(uuid) from public, anon;
grant execute on function public.join_baby(text) to authenticated;
grant execute on function public.regenerate_invite_code(uuid) to authenticated;

------------------------------------------------------------------------------
-- Row Level Security
------------------------------------------------------------------------------

alter table public.babies enable row level security;
alter table public.baby_members enable row level security;
alter table public.events enable row level security;

-- babies ---------------------------------------------------------------------
-- `created_by = auth.uid()` permet le `insert ... returning` avant que le trigger n'ait ajouté l'appartenance.
create policy babies_select on public.babies
  for select to authenticated
  using (created_by = auth.uid() or public.is_baby_member(id));

create policy babies_insert on public.babies
  for insert to authenticated
  with check (created_by = auth.uid());

create policy babies_update on public.babies
  for update to authenticated
  using (public.is_baby_member(id))
  with check (public.is_baby_member(id));

create policy babies_delete on public.babies
  for delete to authenticated
  using (exists (
    select 1 from public.baby_members m
    where m.baby_id = babies.id and m.user_id = auth.uid() and m.role = 'owner'
  ));

-- Seuls le nom et la date de naissance sont modifiables par le client (pas le code, pas le créateur).
revoke update on public.babies from authenticated;
grant update (name, birth_date) on public.babies to authenticated;

-- baby_members ---------------------------------------------------------------
-- Lecture : ses propres lignes et celles des co-parents. Écriture : uniquement via join_baby() / le trigger,
-- sauf pour quitter un bébé soi-même.
create policy members_select on public.baby_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_baby_member(baby_id));

create policy members_leave on public.baby_members
  for delete to authenticated
  using (user_id = auth.uid());

-- events ---------------------------------------------------------------------
create policy events_select on public.events
  for select to authenticated
  using (public.is_baby_member(baby_id));

create policy events_insert on public.events
  for insert to authenticated
  with check (public.is_baby_member(baby_id) and created_by = auth.uid());

create policy events_update on public.events
  for update to authenticated
  using (public.is_baby_member(baby_id))
  with check (public.is_baby_member(baby_id));

create policy events_delete on public.events
  for delete to authenticated
  using (public.is_baby_member(baby_id));

-- Aucune donnée n'est accessible sans compte.
revoke all on public.babies, public.baby_members, public.events from anon;

------------------------------------------------------------------------------
-- Realtime : le second parent voit les événements apparaître en direct.
------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.events;
  end if;
end;
$$;
