-- Dollo – invitation d'un parent par e-mail.
-- À appliquer APRÈS 0001_init.sql.
--
-- Principe : un parent invite une adresse e-mail. L'invité se connecte (code reçu par e-mail) avec CETTE adresse ;
-- à la connexion, l'app appelle accept_invitations() qui l'ajoute au bébé. Aucun code à recopier, aucun mot de passe
-- à créer. L'invitation n'est acceptée que si l'adresse de l'utilisateur est VÉRIFIÉE (sinon quelqu'un qui connaît
-- l'adresse invitée pourrait s'inscrire avec elle sans la posséder et rejoindre le bébé).

create table public.baby_invitations (
  id          uuid primary key default gen_random_uuid(),
  baby_id     uuid not null references public.babies (id) on delete cascade,
  email       text not null check (email = lower(email) and char_length(email) between 3 and 254),
  invited_by  uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz
);

-- Une seule invitation en attente par bébé et par adresse (réinviter la renouvelle).
create unique index baby_invitations_pending_uniq on public.baby_invitations (baby_id, email) where accepted_at is null;
create index baby_invitations_email_idx on public.baby_invitations (email) where accepted_at is null;

alter table public.baby_invitations enable row level security;

-- Les parents d'un bébé voient (et peuvent annuler) ses invitations en attente. La création et l'acceptation passent
-- uniquement par les fonctions ci-dessous : aucun INSERT / UPDATE direct.
create policy invitations_select on public.baby_invitations
  for select to authenticated
  using (public.is_baby_member(baby_id));

create policy invitations_delete on public.baby_invitations
  for delete to authenticated
  using (public.is_baby_member(baby_id) and accepted_at is null);

revoke all on public.baby_invitations from anon;
revoke insert, update on public.baby_invitations from authenticated;

-- Invite (ou renouvelle l'invitation de) une adresse e-mail. Réservé aux parents du bébé.
create or replace function public.invite_parent(p_baby_id uuid, p_email text)
returns public.baby_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  e text := lower(btrim(coalesce(p_email, '')));
  inv public.baby_invitations;
  pending integer;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not public.is_baby_member(p_baby_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(e) > 254 or e !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  -- Déjà parent de ce bébé : rien à faire (ne révèle rien : l'appelant est déjà membre).
  if exists (
    select 1
    from public.baby_members m
    join auth.users u on u.id = m.user_id
    where m.baby_id = p_baby_id and lower(u.email) = e
  ) then
    raise exception 'already_member' using errcode = '23505';
  end if;

  -- Garde-fou anti-abus : 5 invitations en attente au plus par bébé.
  select count(*) into pending
  from public.baby_invitations i
  where i.baby_id = p_baby_id and i.accepted_at is null and i.expires_at > now() and i.email <> e;
  if pending >= 5 then
    raise exception 'too_many_invitations' using errcode = '54000';
  end if;

  insert into public.baby_invitations as i (baby_id, email, invited_by)
  values (p_baby_id, e, auth.uid())
  on conflict (baby_id, email) where accepted_at is null
  do update set invited_by = auth.uid(), created_at = now(), expires_at = now() + interval '14 days'
  returning i.* into inv;

  return inv;
end;
$$;

-- Accepte toutes les invitations en attente adressées à l'e-mail de l'utilisateur connecté, à condition que cette
-- adresse soit vérifiée. Renvoie les bébés rejoints (liste vide s'il n'y a rien à accepter).
create or replace function public.accept_invitations()
returns setof public.babies
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_email text;
  confirmed timestamptz;
begin
  if me is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select lower(u.email), u.email_confirmed_at into my_email, confirmed
  from auth.users u
  where u.id = me;

  if my_email is null or confirmed is null then
    return; -- adresse non vérifiée : on n'accepte rien
  end if;

  return query
  with accepted as (
    update public.baby_invitations i
    set accepted_at = now()
    where i.email = my_email and i.accepted_at is null and i.expires_at > now()
    returning i.baby_id
  ),
  joined as (
    insert into public.baby_members (baby_id, user_id, role)
    select distinct a.baby_id, me, 'parent' from accepted a
    on conflict do nothing
    returning baby_id
  )
  select b.* from public.babies b where b.id in (select a.baby_id from accepted a);
end;
$$;

revoke all on function public.invite_parent(uuid, text) from public, anon;
revoke all on function public.accept_invitations() from public, anon;
grant execute on function public.invite_parent(uuid, text) to authenticated;
grant execute on function public.accept_invitations() to authenticated;
