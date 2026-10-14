-- V3 · Santé : température et médicaments dans le journal (comme les autres événements, donc partagés en direct,
-- notés par la nounou si besoin, disponibles hors ligne), traitement quotidien avec rappel (vitamine D…), vaccins.

------------------------------------------------------------------------------
-- Événements « temp » (température) et « med » (médicament)
------------------------------------------------------------------------------
alter table public.events drop constraint events_kind_check;
alter table public.events add constraint events_kind_check check (kind in ('breast', 'bottle', 'diaper', 'sleep', 'temp', 'med'));

alter table public.events add column temp_c numeric(3, 1) check (temp_c between 34 and 43);
alter table public.events add column med_name text check (char_length(btrim(med_name)) between 1 and 60);
alter table public.events add column med_dose text check (char_length(med_dose) <= 40);

alter table public.events drop constraint events_kind_fields;
alter table public.events add constraint events_kind_fields check (
  (kind = 'breast' and side is not null and diaper_type is null and amount_ml is null and temp_c is null and med_name is null and med_dose is null)
  or (kind = 'bottle' and side is null and diaper_type is null and temp_c is null and med_name is null and med_dose is null)
  or (kind = 'diaper' and diaper_type is not null and side is null and amount_ml is null and temp_c is null and med_name is null and med_dose is null)
  or (kind = 'sleep' and side is null and diaper_type is null and amount_ml is null and temp_c is null and med_name is null and med_dose is null)
  or (kind = 'temp' and temp_c is not null and side is null and diaper_type is null and amount_ml is null and med_name is null and med_dose is null)
  or (kind = 'med' and med_name is not null and side is null and diaper_type is null and amount_ml is null and temp_c is null)
);

grant update (temp_c, med_name, med_dose) on public.events to authenticated;

------------------------------------------------------------------------------
-- Traitement quotidien avec rappel (ex. : vitamine D à 9 h)
------------------------------------------------------------------------------
alter table public.reminder_settings add column daily_med_name text check (char_length(btrim(daily_med_name)) between 1 and 60);
alter table public.reminder_settings add column daily_med_hour integer check (daily_med_hour between 0 and 23);
alter table public.reminder_settings add constraint reminder_settings_daily_med check ((daily_med_name is null) = (daily_med_hour is null));

-- Un rappel quotidien se réfère à une DATE (et non à un événement) : la référence devient du texte.
alter table public.reminder_sent drop constraint reminder_sent_kind_check;
alter table public.reminder_sent add constraint reminder_sent_kind_check check (kind in ('feed', 'diaper', 'daily_med'));
alter table public.reminder_sent alter column ref_id type text using ref_id::text;

------------------------------------------------------------------------------
-- Vaccins (parents uniquement : données de santé)
------------------------------------------------------------------------------
create table public.vaccinations (
  id         uuid primary key default gen_random_uuid(),
  baby_id    uuid not null references public.babies (id) on delete cascade,
  -- Dose du calendrier (ex. « hexa-1 », « menb-2 ») : voir src/lib/vaccines.ts.
  code       text not null check (code ~ '^[a-z0-9-]{2,40}$'),
  given_on   date not null,
  note       text check (char_length(note) <= 300),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  unique (baby_id, code)
);

alter table public.vaccinations enable row level security;
create policy vaccinations_select on public.vaccinations for select to authenticated using (public.is_baby_parent(baby_id));
create policy vaccinations_insert on public.vaccinations for insert to authenticated with check (public.is_baby_parent(baby_id) and created_by = auth.uid());
create policy vaccinations_update on public.vaccinations for update to authenticated using (public.is_baby_parent(baby_id)) with check (public.is_baby_parent(baby_id));
create policy vaccinations_delete on public.vaccinations for delete to authenticated using (public.is_baby_parent(baby_id));
revoke all on public.vaccinations from anon;
revoke update on public.vaccinations from authenticated;
grant update (given_on, note) on public.vaccinations to authenticated;
