\set ON_ERROR_STOP on
\set alice '00000000-0000-0000-0000-00000000000a'
\set frank '00000000-0000-0000-0000-00000000000f'
\set gina  '00000000-0000-0000-0000-000000000010'
\set hugo  '00000000-0000-0000-0000-000000000011'

begin;

-- Frank arrive d'une pub Meta (premier contact Google, dernier contact Meta) ; Gina d'une pub Google ; Hugo en direct
-- avec des métadonnées trafiquées (date illisible).
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:'frank', 'frank@example.com', now(), '{"first_utm_source":"google","first_utm_campaign":"search","first_gclid":"G-OLD","first_at":"2026-09-01T10:00:00Z","last_utm_source":"facebook","last_utm_medium":"paid_social","last_utm_campaign":"rentree","last_fbclid":"FB-1","last_at":"2026-10-01T10:00:00Z"}'),
  (:'gina',  'gina@example.com',  now(), '{"first_utm_source":"google","first_utm_medium":"cpc","first_utm_campaign":"search","first_gclid":"G-2","first_at":"2026-10-02T10:00:00Z"}'),
  (:'hugo',  'hugo@example.com',  null,  '{"last_at":"pas une date","last_utm_source":"x"}');

-- 1. Personne ne lit les mesures depuis l'app ou l'API
select test_as(:'frank');
select expect_error('authenticated : schéma analytics fermé', 'select count(*) from analytics.funnel_by_campaign', 'permission denied');
select expect_error('authenticated : conversions fermées', 'select count(*) from analytics.conversions', 'permission denied');
select test_as(null);
select expect_error('anon : schéma analytics fermé', 'select count(*) from analytics.user_journey', 'permission denied');
reset role;

-- 2. Activation : Frank crée un bébé
select test_as(:'frank');
insert into babies (name) values ('Lou');
reset role;

-- 3. Le webhook écrit les droits (service role) : le déclencheur relève essai, paiement, remboursement
set local role service_role;
insert into entitlements (user_id, plan, status, current_period_end, stripe_ref) values (:'frank', 'yearly', 'trialing', now() + interval '7 days', 'sub_f');
-- Upsert du webhook (même forme que supabase-js) : l'essai devient payant.
insert into entitlements (user_id, plan, status, current_period_end, stripe_ref) values (:'frank', 'yearly', 'active', now() + interval '1 year', 'sub_f')
  on conflict (stripe_ref) do update set status = excluded.status, current_period_end = excluded.current_period_end;
-- Renouvellement : pas de nouvelle conversion.
update entitlements set status = 'past_due' where stripe_ref = 'sub_f';
update entitlements set status = 'active', current_period_end = now() + interval '2 years' where stripe_ref = 'sub_f';
-- Gina : achat à vie puis remboursement.
insert into entitlements (user_id, plan, status, stripe_ref) values (:'gina', 'lifetime', 'active', 'cs_g');
update entitlements set status = 'refunded' where stripe_ref = 'cs_g';
-- Carte refusée à la fin de l'essai : ni essai payant, ni achat.
insert into entitlements (user_id, plan, status, stripe_ref) values (:'hugo', 'monthly', 'past_due', 'sub_h');
-- Cadeau : jamais une conversion.
insert into entitlements (user_id, plan, status, current_period_end) values (:'hugo', 'gift', 'active', now() + interval '14 days');
reset role;

select expect_count('frank : un essai, un achat (renouvellements ignorés)', format($q$select count(*) from analytics.conversions where user_id = %L$q$, :'frank'), 2);
select expect_count('gina : achat + remboursement', format($q$select count(*) from analytics.conversions where user_id = %L$q$, :'gina'), 2);
select expect_count('hugo : rien (past_due, cadeau)', format($q$select count(*) from analytics.conversions where user_id = %L$q$, :'hugo'), 0);

-- 4. Une erreur de mesure ne bloque jamais l'activation de Dollo+
alter table analytics.conversions add constraint casse check (false) not valid;
insert into entitlements (user_id, plan, status, stripe_ref) values (:'alice', 'monthly', 'active', 'sub_a');
select expect_count('mesure en panne : Dollo+ accordé quand même', $q$select count(*) from entitlements where stripe_ref = 'sub_a'$q$, 1);
alter table analytics.conversions drop constraint casse;

-- 5. Parcours : campagne du dernier contact, sans mélange
select expect_count('frank attribué à la dernière campagne (Meta)', format($q$select count(*) from analytics.user_journey where user_id = %L and utm_source = 'facebook' and utm_campaign = 'rentree' and fbclid = 'FB-1' and gclid is null$q$, :'frank'), 1);
select expect_count('frank activé, essai, client annuel à 29,99', format($q$select count(*) from analytics.user_journey where user_id = %L and activated_at is not null and trial_at is not null and plan = 'yearly' and value_eur = 29.99$q$, :'frank'), 1);
select expect_count('gina : premier contact faute de dernier', format($q$select count(*) from analytics.user_journey where user_id = %L and utm_source = 'google' and gclid = 'G-2'$q$, :'gina'), 1);
select expect_count('gina remboursée : pas de valeur', format($q$select count(*) from analytics.user_journey where user_id = %L and value_eur is null$q$, :'gina'), 1);
select expect_count('date trafiquée : null, la vue fonctionne', format($q$select count(*) from analytics.user_journey where user_id = %L and touched_at is null$q$, :'hugo'), 1);

-- 6. Entonnoir et import hors ligne
select expect_count('entonnoir Meta : 1 inscrit, 1 activé, 1 essai, 1 client, 29,99 €', $q$select count(*) from analytics.funnel_by_campaign where source = 'facebook' and campaign = 'rentree' and signups = 1 and activated = 1 and trials = 1 and customers = 1 and revenue_eur = 29.99$q$, 1);
select expect_count('entonnoir Google : client remboursé non compté', $q$select count(*) from analytics.funnel_by_campaign where source = 'google' and customers = 0$q$, 1);
select expect_count('par semaine : tous les inscrits', $q$select sum(signups) from analytics.funnel_by_week$q$, (select count(*) from auth.users));
select expect_count('hors ligne : seul l''achat de Frank (fbclid)', $q$select count(*) from analytics.offline_conversions where fbclid = 'FB-1' and conversion_value = 29.99 and currency = 'EUR'$q$, 1);
select expect_count('hors ligne : rien d''autre', 'select count(*) from analytics.offline_conversions', 1);

-- 7. Suppression du compte (RGPD) : ses mesures disparaissent
delete from auth.users where id = :'gina';
select expect_count('compte supprimé : conversions supprimées', format($q$select count(*) from analytics.conversions where user_id = %L$q$, :'gina'), 0);

do $$ begin raise notice '=== TOUS LES TESTS DE MESURE SONT PASSÉS ==='; end $$;
rollback;
