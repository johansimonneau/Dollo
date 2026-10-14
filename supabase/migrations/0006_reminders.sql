-- V3 · Rappels et alertes : réglages par personne et par bébé, abonnements aux notifications (Web Push),
-- et journal des rappels envoyés (une seule notification par « dernier repas » / « dernière couche »).
-- L'envoi est fait par la fonction serveur `send-reminders` (service role), déclenchée toutes les 5 minutes.

create table public.reminder_settings (
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  baby_id          uuid not null references public.babies (id) on delete cascade,
  feed_every_min   integer check (feed_every_min between 30 and 720),
  diaper_dry_hours integer check (diaper_dry_hours between 1 and 24),
  quiet_night      boolean not null default false,
  time_zone        text not null default 'Europe/Paris' check (char_length(time_zone) <= 64),
  updated_at       timestamptz not null default now(),
  primary key (user_id, baby_id)
);

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint   text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 2048),
  p256dh     text not null check (char_length(p256dh) <= 512),
  auth       text not null check (char_length(auth) <= 512),
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table public.reminder_sent (
  user_id uuid not null references auth.users (id) on delete cascade,
  baby_id uuid not null references public.babies (id) on delete cascade,
  kind    text not null check (kind in ('feed', 'diaper')),
  ref_id  uuid not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, baby_id, kind, ref_id)
);

alter table public.reminder_settings enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.reminder_sent enable row level security;

-- Chacun ses réglages, uniquement pour un bébé dont il est membre (parent ou nounou).
create policy reminder_settings_own on public.reminder_settings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_baby_member(baby_id));

-- Chacun ses appareils.
create policy push_subscriptions_own on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- reminder_sent : aucune policy → inaccessible depuis l'API (seule la fonction serveur, en service role, y écrit).
revoke all on public.reminder_settings, public.push_subscriptions, public.reminder_sent from anon;
revoke all on public.reminder_sent from authenticated;

-- Quitter un bébé (ou en être retiré) supprime ses rappels pour ce bébé : plus aucune notification n'en parle.
create or replace function public.drop_reminders_of_former_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.reminder_settings r where r.user_id = old.user_id and r.baby_id = old.baby_id;
  return old;
end;
$$;
revoke all on function public.drop_reminders_of_former_member() from public, anon, authenticated;

create trigger baby_members_drop_reminders
  after delete on public.baby_members
  for each row execute function public.drop_reminders_of_former_member();

create trigger reminder_settings_touch
  before update on public.reminder_settings
  for each row execute function public.touch_updated_at();

------------------------------------------------------------------------------
-- Déclenchement toutes les 5 minutes (pg_cron + pg_net). À activer une fois la fonction déployée : voir le README,
-- section « Rappels ». Laissé en commentaire car l'adresse du projet et la clé publique sont propres à chaque projet.
------------------------------------------------------------------------------
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
-- select cron.schedule('dollo-send-reminders', '*/5 * * * *', $$
--   select net.http_post(
--     url := 'https://VOTRE-PROJET.supabase.co/functions/v1/send-reminders',
--     headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer VOTRE_CLE_PUBLIQUE'),
--     body := '{}'::jsonb
--   );
-- $$);
