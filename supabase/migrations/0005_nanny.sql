-- V2 : partager le suivi avec la nounou, sans lui ouvrir les données des parents.
-- La limite est posée ICI (RLS + fonctions), pas seulement dans l'interface.
--
-- La nounou :
--   - voit le prénom du bébé (pas la date de naissance, ni le code d'invitation) ;
--   - voit les événements des dernières 48 h, en ajoute, corrige ou supprime LES SIENS ;
--   - peut seulement TERMINER ceux des parents (réveil, fin de tétée) ;
--   - ne voit ni les autres membres, ni les invitations, et ne peut inviter personne.
-- Les parents la retirent comme un autre parent (remove_member).

------------------------------------------------------------------------------
-- Rôle
------------------------------------------------------------------------------
alter table public.baby_members drop constraint baby_members_role_check;
alter table public.baby_members add constraint baby_members_role_check check (role in ('owner', 'parent', 'nanny'));

alter table public.baby_invitations add column role text not null default 'parent' check (role in ('parent', 'nanny'));

-- Fenêtre d'historique visible par la nounou.
create or replace function public.nanny_window_start()
returns timestamptz
language sql
stable
as $$ select now() - interval '48 hours' $$;

-- Parent (propriétaire ou co-parent) du bébé.
create or replace function public.is_baby_parent(p_baby_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.baby_members m
    where m.baby_id = p_baby_id and m.user_id = auth.uid() and m.role in ('owner', 'parent')
  );
$$;

create or replace function public.is_baby_nanny(p_baby_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.baby_members m
    where m.baby_id = p_baby_id and m.user_id = auth.uid() and m.role = 'nanny'
  );
$$;

------------------------------------------------------------------------------
-- Policies : ce qui était « membre » devient « parent », sauf les événements (fenêtre + les siens pour la nounou)
------------------------------------------------------------------------------
drop policy babies_select on public.babies;
create policy babies_select on public.babies
  for select to authenticated
  using (created_by = auth.uid() or public.is_baby_parent(id));

drop policy babies_update on public.babies;
create policy babies_update on public.babies
  for update to authenticated
  using (public.is_baby_parent(id))
  with check (public.is_baby_parent(id));

drop policy members_select on public.baby_members;
create policy members_select on public.baby_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_baby_parent(baby_id));

drop policy invitations_select on public.baby_invitations;
create policy invitations_select on public.baby_invitations
  for select to authenticated
  using (public.is_baby_parent(baby_id));

drop policy invitations_delete on public.baby_invitations;
create policy invitations_delete on public.baby_invitations
  for delete to authenticated
  using (public.is_baby_parent(baby_id) and accepted_at is null);

drop policy events_select on public.events;
create policy events_select on public.events
  for select to authenticated
  using (
    public.is_baby_parent(baby_id)
    or (public.is_baby_nanny(baby_id) and started_at >= public.nanny_window_start())
  );

drop policy events_insert on public.events;
create policy events_insert on public.events
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      public.is_baby_parent(baby_id)
      or (public.is_baby_nanny(baby_id) and started_at >= public.nanny_window_start())
    )
  );

drop policy events_update on public.events;
create policy events_update on public.events
  for update to authenticated
  using (
    public.is_baby_parent(baby_id)
    or (public.is_baby_nanny(baby_id) and started_at >= public.nanny_window_start())
  )
  with check (
    public.is_baby_parent(baby_id)
    or (public.is_baby_nanny(baby_id) and started_at >= public.nanny_window_start())
  );

-- Sur un événement saisi par un parent, la nounou peut seulement le terminer (réveil, fin de tétée) : rien d'autre.
create or replace function public.events_nanny_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.created_by is distinct from auth.uid()
     and public.is_baby_nanny(old.baby_id)
     and not public.is_baby_parent(old.baby_id)
     and (to_jsonb(new) - 'ended_at' - 'updated_at') is distinct from (to_jsonb(old) - 'ended_at' - 'updated_at')
  then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger events_nanny_guard
  before update on public.events
  for each row execute function public.events_nanny_guard();
revoke all on function public.events_nanny_guard() from public, anon, authenticated;

drop policy events_delete on public.events;
create policy events_delete on public.events
  for delete to authenticated
  using (
    public.is_baby_parent(baby_id)
    or (public.is_baby_nanny(baby_id) and created_by = auth.uid() and started_at >= public.nanny_window_start())
  );

------------------------------------------------------------------------------
-- Bébés de l'utilisateur, avec son rôle. La nounou ne reçoit ni la date de naissance ni le code d'invitation.
------------------------------------------------------------------------------
create or replace function public.list_my_babies()
returns table (id uuid, name text, birth_date date, invite_code text, created_at timestamptz, role text)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.name,
         case when m.role = 'nanny' then null else b.birth_date end,
         case when m.role = 'nanny' then null else b.invite_code end,
         b.created_at, m.role
  from public.babies b
  join public.baby_members m on m.baby_id = b.id and m.user_id = auth.uid()
  order by b.created_at;
$$;

------------------------------------------------------------------------------
-- Invitations avec rôle (réservées aux parents)
------------------------------------------------------------------------------
drop function public.invite_parent(uuid, text);
create function public.invite_parent(p_baby_id uuid, p_email text, p_role text default 'parent')
returns public.baby_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  e text := lower(btrim(coalesce(p_email, '')));
  r text := coalesce(p_role, 'parent');
  inv public.baby_invitations;
  pending integer;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not public.is_baby_parent(p_baby_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if r not in ('parent', 'nanny') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  if char_length(e) > 254 or e !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.baby_members m
    join auth.users u on u.id = m.user_id
    where m.baby_id = p_baby_id and lower(u.email) = e
  ) then
    raise exception 'already_member' using errcode = '23505';
  end if;

  select count(*) into pending
  from public.baby_invitations i
  where i.baby_id = p_baby_id and i.accepted_at is null and i.expires_at > now() and i.email <> e;
  if pending >= 5 then
    raise exception 'too_many_invitations' using errcode = '54000';
  end if;

  insert into public.baby_invitations as i (baby_id, email, invited_by, role)
  values (p_baby_id, e, auth.uid(), r)
  on conflict (baby_id, email) where accepted_at is null
  do update set invited_by = auth.uid(), role = r, created_at = now(), expires_at = now() + interval '14 days'
  returning i.* into inv;

  return inv;
end;
$$;

-- Accepte les invitations de l'adresse vérifiée, avec le rôle de l'invitation. Ne renvoie que l'identifiant et le
-- prénom (pas de code d'invitation ni de date de naissance pour une nounou).
drop function public.accept_invitations();
create function public.accept_invitations()
returns table (id uuid, name text)
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
    return;
  end if;

  return query
  with accepted as (
    update public.baby_invitations i
    set accepted_at = now()
    where i.email = my_email and i.accepted_at is null and i.expires_at > now()
    returning i.baby_id, i.role
  ),
  joined as (
    insert into public.baby_members (baby_id, user_id, role)
    select distinct on (a.baby_id) a.baby_id, me, a.role from accepted a
    order by a.baby_id, a.role = 'parent' desc
    on conflict do nothing
    returning baby_id
  )
  select b.id, b.name from public.babies b where b.id in (select a.baby_id from accepted a);
end;
$$;

-- Membres : réservé aux parents (la nounou ne voit pas qui d'autre suit le bébé).
create or replace function public.list_members(p_baby_id uuid)
returns table (user_id uuid, email text, role text, joined_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_baby_parent(p_baby_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select m.user_id, u.email::text, m.role, m.joined_at
    from public.baby_members m
    join auth.users u on u.id = m.user_id
    where m.baby_id = p_baby_id
    order by m.role = 'owner' desc, m.role = 'nanny', m.joined_at;
end;
$$;

------------------------------------------------------------------------------
-- Droits d'exécution
------------------------------------------------------------------------------
revoke all on function public.nanny_window_start() from public, anon;
revoke all on function public.is_baby_parent(uuid) from public, anon;
revoke all on function public.is_baby_nanny(uuid) from public, anon;
revoke all on function public.list_my_babies() from public, anon;
revoke all on function public.invite_parent(uuid, text, text) from public, anon;
revoke all on function public.accept_invitations() from public, anon;
revoke all on function public.list_members(uuid) from public, anon;
grant execute on function public.nanny_window_start() to authenticated;
grant execute on function public.is_baby_parent(uuid) to authenticated;
grant execute on function public.is_baby_nanny(uuid) to authenticated;
grant execute on function public.list_my_babies() to authenticated;
grant execute on function public.invite_parent(uuid, text, text) to authenticated;
grant execute on function public.accept_invitations() to authenticated;
grant execute on function public.list_members(uuid) to authenticated;
