-- Mesure des campagnes : inscription → premier bébé → essai → paiement, par source / campagne.
--
-- Schéma `analytics` PRIVÉ : non exposé par l'API Supabase et sans aucun droit pour anon / authenticated. On le lit
-- depuis le SQL Editor du tableau de bord (rôle postgres). Aucun e-mail ni donnée de santé : identifiant du compte,
-- dates, campagne (UTM et identifiants de clic, déjà enregistrés à l'inscription par l'app) et offre.
--
-- Les conversions sont relevées par un déclencheur sur `entitlements` (écrite par le webhook Stripe) : le webhook
-- n'est pas modifié, et une erreur de mesure ne peut jamais bloquer l'activation de Dollo+.
--
-- Lecture :
--   select * from analytics.funnel_by_campaign;      -- entonnoir et taux par source / support / campagne
--   select * from analytics.funnel_by_week;          -- entonnoir par semaine d'inscription
--   select * from analytics.user_journey;            -- un compte par ligne (dates, campagne, offre)
--   select * from analytics.offline_conversions;     -- achats avec gclid / fbclid / ttclid, à importer dans les régies

create schema if not exists analytics;
revoke all on schema analytics from public, anon, authenticated;

------------------------------------------------------------------------------
-- Conversions (une par droit Stripe et par étape : les renouvellements ne recomptent pas)
------------------------------------------------------------------------------
create table analytics.conversions (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  kind           text not null check (kind in ('trial_start', 'purchase', 'refund')),
  plan           text not null,
  entitlement_id uuid not null,
  stripe_ref     text,
  occurred_at    timestamptz not null default now(),
  unique (entitlement_id, kind)
);
create index conversions_user_idx on analytics.conversions (user_id);

-- Prix du premier paiement, pour estimer le chiffre d'affaires par campagne (TTC, à garder alignés sur Stripe).
create table analytics.plan_prices (
  plan              text primary key,
  first_payment_eur numeric(10, 2) not null check (first_payment_eur >= 0)
);
insert into analytics.plan_prices (plan, first_payment_eur) values ('monthly', 3.99), ('yearly', 29.99), ('lifetime', 49.99);

-- Essai (trialing), premier paiement (active), remboursement (refunded). Les cadeaux ne comptent pas.
-- past_due n'est PAS un paiement : c'est une carte refusée (souvent à la fin de l'essai).
create or replace function analytics.record_conversion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  step text;
begin
  if new.plan = 'gift' or (tg_op = 'UPDATE' and old.status is not distinct from new.status) then
    return null;
  end if;
  step := case new.status
    when 'trialing' then 'trial_start'
    when 'active' then 'purchase'
    when 'refunded' then 'refund'
  end;
  if step is null then
    return null;
  end if;
  begin
    insert into analytics.conversions (user_id, kind, plan, entitlement_id, stripe_ref)
    values (new.user_id, step, new.plan, new.id, new.stripe_ref)
    on conflict (entitlement_id, kind) do nothing;
  exception when others then
    -- La mesure ne doit jamais empêcher d'accorder Dollo+.
    raise warning 'analytics.record_conversion: %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function analytics.record_conversion() from public, anon, authenticated;

create trigger entitlements_record_conversion
  after insert or update on public.entitlements
  for each row execute function analytics.record_conversion();

-- Droits déjà présents au moment de la migration (date réelle inconnue : date de création du droit).
-- past_due / canceled : on ne sait pas si un paiement a eu lieu (essai abandonné ?), ils ne sont pas comptés.
insert into analytics.conversions (user_id, kind, plan, entitlement_id, stripe_ref, occurred_at)
select e.user_id, s.kind, e.plan, e.id, e.stripe_ref, e.created_at
from public.entitlements e
join (values ('trialing', 'trial_start'), ('active', 'purchase'), ('refunded', 'purchase'), ('refunded', 'refund')) as s (status, kind)
  on s.status = e.status
where e.plan <> 'gift'
on conflict (entitlement_id, kind) do nothing;

-- Les métadonnées du compte sont modifiables par l'utilisateur : une date illisible donne null, sans casser les vues.
create or replace function analytics.safe_timestamptz(v text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  return v::timestamptz;
exception when others then
  return null;
end;
$$;
revoke all on function analytics.safe_timestamptz(text) from public, anon, authenticated;

------------------------------------------------------------------------------
-- Vues de lecture
------------------------------------------------------------------------------
-- Un compte par ligne. Campagne = dernier contact (celui qui a précédé l'inscription, comme les régies),
-- sinon premier contact ; tous les champs viennent du MÊME contact (on ne mélange jamais deux campagnes).
create view analytics.user_journey as
with base as (
  select u.id, u.created_at, u.email_confirmed_at,
         coalesce(u.raw_user_meta_data, '{}'::jsonb) as meta,
         case when coalesce(u.raw_user_meta_data, '{}'::jsonb) ? 'last_at' then 'last_' else 'first_' end as t
  from auth.users u
),
conv as (
  select c.user_id,
         min(c.occurred_at) filter (where c.kind = 'trial_start') as trial_at,
         min(c.occurred_at) filter (where c.kind = 'purchase') as purchased_at,
         min(c.occurred_at) filter (where c.kind = 'refund') as refunded_at,
         (array_agg(c.plan order by c.occurred_at) filter (where c.kind = 'purchase'))[1] as plan
  from analytics.conversions c
  group by c.user_id
)
select b.id as user_id,
       b.created_at as signed_up_at,
       b.email_confirmed_at as confirmed_at,
       (select min(m.joined_at) from public.baby_members m where m.user_id = b.id and m.role in ('owner', 'parent')) as activated_at,
       c.trial_at,
       c.purchased_at,
       c.refunded_at,
       c.plan,
       case when c.purchased_at is not null and c.refunded_at is null then p.first_payment_eur end as value_eur,
       b.meta ->> (b.t || 'utm_source') as utm_source,
       b.meta ->> (b.t || 'utm_medium') as utm_medium,
       b.meta ->> (b.t || 'utm_campaign') as utm_campaign,
       b.meta ->> (b.t || 'utm_content') as utm_content,
       b.meta ->> (b.t || 'utm_term') as utm_term,
       b.meta ->> (b.t || 'gclid') as gclid,
       b.meta ->> (b.t || 'gbraid') as gbraid,
       b.meta ->> (b.t || 'wbraid') as wbraid,
       b.meta ->> (b.t || 'fbclid') as fbclid,
       b.meta ->> (b.t || 'ttclid') as ttclid,
       b.meta ->> (b.t || 'msclkid') as msclkid,
       b.meta ->> (b.t || 'referrer') as referrer,
       b.meta ->> (b.t || 'landing') as landing,
       analytics.safe_timestamptz(b.meta ->> (b.t || 'at')) as touched_at
from base b
left join conv c on c.user_id = b.id
left join analytics.plan_prices p on p.plan = c.plan;

-- Clé de regroupement lisible : « (direct) » quand aucune campagne n'a été vue sur l'appareil.
create view analytics.funnel_by_campaign as
select coalesce(j.utm_source, case when j.gclid is not null or j.gbraid is not null or j.wbraid is not null then 'google'
                                   when j.fbclid is not null then 'meta'
                                   when j.ttclid is not null then 'tiktok'
                                   when j.msclkid is not null then 'microsoft' end, '(direct)') as source,
       coalesce(j.utm_medium, '(none)') as medium,
       coalesce(j.utm_campaign, '(none)') as campaign,
       count(*) as signups,
       count(j.confirmed_at) as confirmed,
       count(j.activated_at) as activated,
       count(j.trial_at) as trials,
       count(j.purchased_at) filter (where j.refunded_at is null) as customers,
       coalesce(sum(j.value_eur), 0) as revenue_eur,
       round(100.0 * count(j.activated_at) / count(*), 1) as activation_pct,
       round(100.0 * count(j.purchased_at) filter (where j.refunded_at is null) / count(*), 1) as signup_to_customer_pct,
       min(j.signed_up_at) as first_signup,
       max(j.signed_up_at) as last_signup
from analytics.user_journey j
group by 1, 2, 3
order by signups desc;

create view analytics.funnel_by_week as
select date_trunc('week', j.signed_up_at)::date as week,
       count(*) as signups,
       count(j.confirmed_at) as confirmed,
       count(j.activated_at) as activated,
       count(j.trial_at) as trials,
       count(j.purchased_at) filter (where j.refunded_at is null) as customers,
       coalesce(sum(j.value_eur), 0) as revenue_eur
from analytics.user_journey j
group by 1
order by 1 desc;

-- Achats rattachables à un clic publicitaire : import « conversions hors ligne » (Google Ads : gclid / gbraid /
-- wbraid, fenêtre de 90 jours ; Meta et TikTok : fbclid / ttclid).
create view analytics.offline_conversions as
select j.user_id,
       j.purchased_at as conversion_time,
       j.plan,
       j.value_eur as conversion_value,
       'EUR' as currency,
       j.gclid, j.gbraid, j.wbraid, j.fbclid, j.ttclid, j.msclkid,
       j.utm_source, j.utm_campaign
from analytics.user_journey j
where j.purchased_at is not null and j.refunded_at is null
  and coalesce(j.gclid, j.gbraid, j.wbraid, j.fbclid, j.ttclid, j.msclkid) is not null
order by j.purchased_at desc;

-- Rien n'est lisible depuis l'app ou l'API.
revoke all on all tables in schema analytics from public, anon, authenticated;
revoke all on all sequences in schema analytics from public, anon, authenticated;
