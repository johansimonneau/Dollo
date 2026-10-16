-- Dollo+ : offre payante (abonnement mensuel / annuel, ou achat « à vie »), payée par carte via Stripe.
--
-- Gratuit : saisie, journal, stats 7 jours, partage entre parents, hors ligne, dictée.
-- Dollo+ : nounou, rapport pour le pédiatre, courbes OMS, notifications app fermée, stock de lait, export CSV,
--          plusieurs bébés.
--
-- Un abonnement couvre toute la famille : un bébé est « Dollo+ » dès qu'UN de ses parents l'est (l'autre parent et la
-- nounou en profitent). Les droits sont écrits UNIQUEMENT par le webhook Stripe (service role) : un client ne peut ni
-- en créer, ni en modifier.
--
-- Comptes existants au moment de la migration : Dollo+ offert pendant 14 jours (appliquer le jour du lancement).
--
-- Verrous posés dans la base (le reste est géré par l'app) :
--   - inviter une nounou, et l'accès de la nounou lui-même ;
--   - créer un 2e bébé ;
--   - notifications : la fonction send-reminders n'envoie qu'aux bébés Dollo+ (premium_baby_ids()).

------------------------------------------------------------------------------
-- Droits (un par abonnement Stripe, par achat à vie, par cadeau)
------------------------------------------------------------------------------
create table public.entitlements (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  plan                 text not null check (plan in ('monthly', 'yearly', 'lifetime', 'gift')),
  -- Statuts Stripe (active, trialing, past_due, canceled, unpaid, incomplete…) ; « active » pour un cadeau ou un achat.
  status               text not null check (char_length(status) <= 40),
  -- Fin de la période payée ou offerte ; null = à vie.
  current_period_end   timestamptz,
  cancel_at_period_end boolean not null default false,
  stripe_customer_id   text,
  -- Abonnement (sub_…) ou session de paiement (cs_…) : clé d'idempotence du webhook.
  stripe_ref           text unique,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index entitlements_user_idx on public.entitlements (user_id);

create trigger entitlements_touch_updated_at
  before update on public.entitlements
  for each row execute function public.touch_updated_at();

alter table public.entitlements enable row level security;
create policy entitlements_select on public.entitlements for select to authenticated using (user_id = auth.uid());
revoke all on public.entitlements from anon;
revoke insert, update, delete on public.entitlements from authenticated;

-- Client Stripe de chaque compte (lu et écrit par les fonctions serveur uniquement).
create table public.billing_customers (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at         timestamptz not null default now()
);
alter table public.billing_customers enable row level security;
revoke all on public.billing_customers from anon, authenticated;

------------------------------------------------------------------------------
-- Qui a Dollo+ ?
------------------------------------------------------------------------------
-- past_due : paiement en échec, Stripe réessaie pendant quelques jours ; on garde l'accès pendant ce délai.
create or replace function public.user_has_premium(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.entitlements e
    where e.user_id = p_user_id
      and e.status in ('active', 'trialing', 'past_due')
      and (e.current_period_end is null or e.current_period_end > now())
  );
$$;

-- Un bébé est Dollo+ si l'un de ses PARENTS l'est (l'abonnement d'une nounou ne compte pas).
create or replace function public.baby_is_premium(p_baby_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.baby_members m
    where m.baby_id = p_baby_id and m.role in ('owner', 'parent') and public.user_has_premium(m.user_id)
  );
$$;

-- État affiché dans l'app : le droit le plus avantageux de l'utilisateur, et ses bébés couverts.
create or replace function public.billing_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with best as (
    select e.plan, e.status, e.current_period_end, e.cancel_at_period_end
    from public.entitlements e
    where e.user_id = auth.uid()
    order by (e.status in ('active', 'trialing', 'past_due') and (e.current_period_end is null or e.current_period_end > now())) desc,
             e.plan = 'lifetime' desc,
             e.plan <> 'gift' desc,
             e.current_period_end desc nulls first
    limit 1
  )
  select jsonb_build_object(
    'premium', public.user_has_premium(auth.uid()),
    'plan', (select plan from best),
    'status', (select status from best),
    'period_end', (select current_period_end from best),
    'cancel_at_period_end', coalesce((select cancel_at_period_end from best), false),
    'premium_baby_ids', coalesce(
      (select jsonb_agg(m.baby_id) from public.baby_members m where m.user_id = auth.uid() and public.baby_is_premium(m.baby_id)),
      '[]'::jsonb
    )
  );
$$;

-- Pour la fonction send-reminders (service role) : bébés dont les rappels peuvent partir en notification.
create or replace function public.premium_baby_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select b.id from public.babies b where public.baby_is_premium(b.id);
$$;

------------------------------------------------------------------------------
-- Verrous
------------------------------------------------------------------------------
-- La nounou n'a accès au bébé que tant que la famille a Dollo+ (toutes les policies passent par cette fonction).
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
  ) and public.baby_is_premium(p_baby_id);
$$;

-- Inviter une nounou : Dollo+ (couvre invite_parent et le renouvellement d'une invitation).
create or replace function public.invitations_premium_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'nanny' and not public.baby_is_premium(new.baby_id) then
    raise exception 'premium_required' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger invitations_premium_guard
  before insert or update of role, expires_at on public.baby_invitations
  for each row execute function public.invitations_premium_guard();

-- Un bébé créé gratuitement ; les suivants avec Dollo+ (jumeaux, petit frère). Rejoindre un bébé reste gratuit.
create or replace function public.babies_premium_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null
     and not public.user_has_premium(new.created_by)
     and exists (select 1 from public.babies b where b.created_by = new.created_by)
  then
    raise exception 'premium_required' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger babies_premium_guard
  before insert on public.babies
  for each row execute function public.babies_premium_guard();

------------------------------------------------------------------------------
-- Lancement : 14 jours offerts à tous les comptes existants
------------------------------------------------------------------------------
insert into public.entitlements (user_id, plan, status, current_period_end)
select u.id, 'gift', 'active', now() + interval '14 days'
from auth.users u;

------------------------------------------------------------------------------
-- Droits d'exécution
------------------------------------------------------------------------------
revoke all on function public.user_has_premium(uuid) from public, anon, authenticated;
revoke all on function public.baby_is_premium(uuid) from public, anon, authenticated;
revoke all on function public.premium_baby_ids() from public, anon, authenticated;
revoke all on function public.billing_status() from public, anon;
revoke all on function public.invitations_premium_guard() from public, anon, authenticated;
revoke all on function public.babies_premium_guard() from public, anon, authenticated;
grant execute on function public.billing_status() to authenticated;
grant execute on function public.premium_baby_ids() to service_role;
grant execute on function public.user_has_premium(uuid) to service_role;
