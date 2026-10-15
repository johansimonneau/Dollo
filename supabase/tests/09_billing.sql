\set ON_ERROR_STOP on
\set alice '00000000-0000-0000-0000-00000000000a'
\set carol '00000000-0000-0000-0000-00000000000c'
\set eve   '00000000-0000-0000-0000-00000000000e'

begin;

-- Eve s'inscrit APRÈS le lancement de Dollo+ : pas de cadeau.
insert into auth.users (id, email, email_confirmed_at) values (:'eve', 'eve@example.com', now());

-- 1. Cadeau de lancement pour les comptes existants
select test_as(:'alice');
select expect_count('compte existant : Dollo+ offert', $q$select count(*) from (select billing_status() s) x where (s->>'premium')::boolean and s->>'plan' = 'gift'$q$, 1);
select expect_count('…pendant 3 mois', $q$select count(*) from entitlements where plan = 'gift' and current_period_end between now() + interval '89 days' and now() + interval '93 days'$q$, 1);

-- 2. Nouveau compte : gratuit
select test_as(:'eve');
select expect_count('nouveau compte : pas de Dollo+', $q$select count(*) from (select billing_status() s) x where not (s->>'premium')::boolean and s->>'plan' is null$q$, 1);
select expect_count('nouveau compte : ne voit pas les droits des autres', 'select count(*) from entitlements', 0);
select expect_error('un client ne s''offre pas Dollo+', format($q$insert into entitlements (user_id, plan, status) values (%L, 'lifetime', 'active')$q$, :'eve'), 'permission denied');
select expect_error('les clients Stripe ne sont pas lisibles', 'select count(*) from billing_customers', 'permission denied');
select expect_error('premium_baby_ids réservé au serveur', 'select count(*) from premium_baby_ids()', 'permission denied');
select expect_error('baby_is_premium réservé au serveur', 'select baby_is_premium(gen_random_uuid())', 'permission denied');

insert into babies (name) values ('Noé') returning id as id \gset eb_
select expect_count('premier bébé : gratuit', 'select count(*) from babies', 1);
select expect_error('deuxième bébé : Dollo+', $q$insert into babies (name) values ('Jade')$q$, 'premium_required');
select expect_error('inviter une nounou : Dollo+', format($q$select invite_parent(%L, 'carol@example.com', 'nanny')$q$, :'eb_id'), 'premium_required');
select expect_count('inviter l''autre parent : gratuit', format($q$select count(*) from invite_parent(%L, 'bob@example.com')$q$, :'eb_id'), 1);
insert into events (baby_id, kind, started_at) values (:'eb_id', 'sleep', now() - interval '1 hour');

-- 3. Eve achète Dollo+ à vie (écrit par le webhook, service role)
reset role;
insert into entitlements (user_id, plan, status, stripe_ref) values (:'eve', 'lifetime', 'active', 'cs_test_1') returning id as id \gset ent_
select test_as(:'eve');
select expect_count('à vie : Dollo+ actif', $q$select count(*) from (select billing_status() s) x where (s->>'premium')::boolean and s->>'plan' = 'lifetime' and s->>'period_end' is null$q$, 1);
select expect_count('le bébé est couvert', format($q$select count(*) from (select billing_status() s) x where s->'premium_baby_ids' ? %L$q$, :'eb_id'), 1);
insert into babies (name) values ('Jade');
select expect_count('deuxième bébé avec Dollo+', 'select count(*) from babies', 2);
select count(*) from invite_parent(:'eb_id', 'carol@example.com', 'nanny') \gset inv_

select test_as(:'carol');
select count(*) from accept_invitations() \gset acc_
select expect_count('la nounou voit la journée', 'select count(*) from events', 1);
select expect_count('…et profite de Dollo+ de la famille', format($q$select count(*) from (select billing_status() s) x where s->'premium_baby_ids' ? %L$q$, :'eb_id'), 1);

-- 4. Remboursement / fin d'accès : la nounou perd l'accès, les parents gardent tout leur journal
reset role;
update entitlements set status = 'canceled' where id = :'ent_id';
select test_as(:'carol');
select expect_count('sans Dollo+ : la nounou ne voit plus rien', 'select count(*) from events', 0);
select expect_error('…et ne peut plus noter', format($q$insert into events (baby_id, kind, started_at) values (%L, 'sleep', now())$q$, :'eb_id'), 'row-level security');
select test_as(:'eve');
select expect_count('les parents gardent leurs données', 'select count(*) from events', 1);

-- 5. L'abonnement d'une nounou ne débloque pas la famille (Carol a son propre cadeau de lancement)
reset role;
select expect_count('carol a Dollo+ pour elle', format($q$select count(*) from entitlements where user_id = %L and user_has_premium(user_id)$q$, :'carol'), 1);
select expect_count('…mais le bébé d''Eve reste gratuit', format($q$select count(*) from premium_baby_ids() id where id = %L$q$, :'eb_id'), 0);

-- 6. Abonnement expiré (période passée) ou en échec de paiement
insert into entitlements (user_id, plan, status, current_period_end, stripe_ref) values (:'eve', 'monthly', 'active', now() - interval '1 day', 'sub_old');
select expect_count('période terminée : pas de Dollo+', format('select count(*) from entitlements where user_id = %L and user_has_premium(user_id)', :'eve'), 0);
update entitlements set status = 'past_due', current_period_end = now() + interval '3 days' where stripe_ref = 'sub_old';
select expect_count('paiement en échec : accès gardé pendant les relances', format('select count(*) from (select user_has_premium(%L) p) x where p', :'eve'), 1);
select expect_count('service : bébés couverts', format($q$select count(*) from premium_baby_ids() id where id = %L$q$, :'eb_id'), 1);

-- 7. Expiration du cadeau
update entitlements set current_period_end = now() - interval '1 minute' where user_id = :'alice' and plan = 'gift';
select test_as(:'alice');
select expect_count('cadeau terminé : retour au gratuit', $q$select count(*) from (select billing_status() s) x where not (s->>'premium')::boolean and s->>'plan' = 'gift'$q$, 1);

select test_as(null);
select expect_error('anon : rien', 'select billing_status()', 'permission denied');

do $$ begin raise notice '=== TOUS LES TESTS DOLLO+ SONT PASSÉS ==='; end $$;
rollback;
