-- V3 · Croissance : sexe du bébé (nécessaire aux courbes OMS) et mesures (poids, taille, périmètre crânien).
-- Réservé aux parents : la nounou n'y a pas accès (données de santé).

alter table public.babies add column sex text check (sex in ('f', 'm'));
grant update (sex) on public.babies to authenticated;

create table public.measurements (
  id           uuid primary key default gen_random_uuid(),
  baby_id      uuid not null references public.babies (id) on delete cascade,
  measured_on  date not null,
  weight_g     integer check (weight_g between 300 and 30000),
  length_mm    integer check (length_mm between 200 and 1300),
  head_mm      integer check (head_mm between 200 and 600),
  note         text check (char_length(note) <= 500),
  created_by   uuid not null default auth.uid() references auth.users (id),
  created_at   timestamptz not null default now(),
  check (weight_g is not null or length_mm is not null or head_mm is not null)
);
create index measurements_baby_idx on public.measurements (baby_id, measured_on);

alter table public.measurements enable row level security;

create policy measurements_select on public.measurements
  for select to authenticated using (public.is_baby_parent(baby_id));
create policy measurements_insert on public.measurements
  for insert to authenticated with check (public.is_baby_parent(baby_id) and created_by = auth.uid());
create policy measurements_update on public.measurements
  for update to authenticated using (public.is_baby_parent(baby_id)) with check (public.is_baby_parent(baby_id));
create policy measurements_delete on public.measurements
  for delete to authenticated using (public.is_baby_parent(baby_id));

revoke all on public.measurements from anon;
-- Modifiables : la mesure elle-même, pas le bébé ni l'auteur (un retrait de colonne ne suffit pas quand la table entière
-- est accordée : on retire tout puis on accorde colonne par colonne).
revoke update on public.measurements from authenticated;
grant update (measured_on, weight_g, length_mm, head_mm, note) on public.measurements to authenticated;

-- list_my_babies renvoie aussi le sexe (null pour une nounou, comme la date de naissance).
drop function public.list_my_babies();
create function public.list_my_babies()
returns table (id uuid, name text, birth_date date, invite_code text, created_at timestamptz, role text, sex text)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.name,
         case when m.role = 'nanny' then null else b.birth_date end,
         case when m.role = 'nanny' then null else b.invite_code end,
         b.created_at, m.role,
         case when m.role = 'nanny' then null else b.sex end
  from public.babies b
  join public.baby_members m on m.baby_id = b.id and m.user_id = auth.uid()
  order by b.created_at;
$$;
revoke all on function public.list_my_babies() from public, anon;
grant execute on function public.list_my_babies() to authenticated;

-- Renforcement : sur un événement, l'auteur et le bébé ne sont plus modifiables depuis l'API (on ne pouvait pas
-- falsifier les droits, mais on pouvait effacer « par la nounou » ou déplacer un événement vers un autre de ses bébés).
revoke update on public.events from authenticated;
grant update (kind, started_at, ended_at, side, amount_ml, diaper_type, note) on public.events to authenticated;
