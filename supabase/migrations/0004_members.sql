-- Gestion des membres : voir qui suit le bébé, et retirer un parent invité.

-- Liste des membres d'un bébé, avec leur e-mail (auth.users n'est pas lisible depuis l'API).
-- Réservé aux membres du bébé.
create or replace function public.list_members(p_baby_id uuid)
returns table (user_id uuid, email text, role text, joined_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.baby_members m where m.baby_id = p_baby_id and m.user_id = auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select m.user_id, u.email::text, m.role, m.joined_at
    from public.baby_members m
    join auth.users u on u.id = m.user_id
    where m.baby_id = p_baby_id
    order by m.role = 'owner' desc, m.joined_at;
end;
$$;

-- Retirer un parent. Réservé au propriétaire (le créateur du suivi), qui ne peut pas se retirer lui-même.
-- Le code d'invitation est renouvelé dans la foulée : sinon la personne retirée pourrait revenir avec l'ancien.
create or replace function public.remove_member(p_baby_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.baby_members m
    where m.baby_id = p_baby_id and m.user_id = auth.uid() and m.role = 'owner'
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  delete from public.baby_members m
  where m.baby_id = p_baby_id and m.user_id = p_user_id and m.role <> 'owner';
  if not found then
    raise exception 'not_a_member' using errcode = 'P0002';
  end if;

  update public.babies
  set invite_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
  where id = p_baby_id;
end;
$$;

revoke all on function public.list_members(uuid) from public, anon;
revoke all on function public.remove_member(uuid, uuid) from public, anon;
grant execute on function public.list_members(uuid) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
