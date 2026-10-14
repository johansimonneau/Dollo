-- V3 · Tire-lait et stock de lait maternel.
-- Tirage = événement « pump » (sein gauche / droit / les deux, quantité, durée) ; stock = sachets / biberons de lait
-- tiré au réfrigérateur ou au congélateur, avec date limite. Accessible à tous les membres (la nounou donne souvent le
-- lait du stock) ; seuls les parents peuvent supprimer une ligne.

alter table public.events drop constraint events_kind_check;
alter table public.events add constraint events_kind_check check (kind in ('breast', 'bottle', 'diaper', 'sleep', 'temp', 'med', 'pump'));

-- « both » : tirage des deux seins (double pompe). Interdit pour une tétée.
alter table public.events drop constraint events_side_check;
alter table public.events add constraint events_side_check check (side in ('left', 'right', 'both'));

alter table public.events drop constraint events_kind_fields;
alter table public.events add constraint events_kind_fields check (
  (kind = 'breast' and side is not null and side in ('left', 'right') and diaper_type is null and amount_ml is null and temp_c is null and med_name is null and med_dose is null)
  or (kind = 'bottle' and side is null and diaper_type is null and temp_c is null and med_name is null and med_dose is null)
  or (kind = 'diaper' and diaper_type is not null and side is null and amount_ml is null and temp_c is null and med_name is null and med_dose is null)
  or (kind = 'sleep' and side is null and diaper_type is null and amount_ml is null and temp_c is null and med_name is null and med_dose is null)
  or (kind = 'temp' and temp_c is not null and side is null and diaper_type is null and amount_ml is null and med_name is null and med_dose is null)
  or (kind = 'med' and med_name is not null and side is null and diaper_type is null and amount_ml is null and temp_c is null)
  or (kind = 'pump' and diaper_type is null and temp_c is null and med_name is null and med_dose is null)
);

create table public.milk_bags (
  id           uuid primary key default gen_random_uuid(),
  baby_id      uuid not null references public.babies (id) on delete cascade,
  pumped_at    timestamptz not null,
  volume_ml    integer not null check (volume_ml between 1 and 1000),
  -- fridge : réfrigérateur ; freezer : congélateur ; thawed : décongelé (au réfrigérateur, à ne pas recongeler)
  storage      text not null check (storage in ('fridge', 'freezer', 'thawed')),
  -- Entrée dans le stockage actuel (point de départ de la date limite).
  stored_at    timestamptz not null default now(),
  used_at      timestamptz,
  discarded_at timestamptz,
  note         text check (char_length(note) <= 200),
  created_by   uuid not null default auth.uid() references auth.users (id),
  created_at   timestamptz not null default now(),
  check (used_at is null or discarded_at is null)
);
create index milk_bags_active_idx on public.milk_bags (baby_id) where used_at is null and discarded_at is null;

alter table public.milk_bags enable row level security;
create policy milk_bags_select on public.milk_bags for select to authenticated using (public.is_baby_member(baby_id));
create policy milk_bags_insert on public.milk_bags for insert to authenticated with check (public.is_baby_member(baby_id) and created_by = auth.uid());
create policy milk_bags_update on public.milk_bags for update to authenticated using (public.is_baby_member(baby_id)) with check (public.is_baby_member(baby_id));
create policy milk_bags_delete on public.milk_bags for delete to authenticated using (public.is_baby_parent(baby_id));
revoke all on public.milk_bags from anon;
revoke update on public.milk_bags from authenticated;
grant update (volume_ml, storage, stored_at, used_at, discarded_at, note) on public.milk_bags to authenticated;
