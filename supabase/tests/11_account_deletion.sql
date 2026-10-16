\set ON_ERROR_STOP on
\set alice '00000000-0000-0000-0000-00000000000a'
\set bob   '00000000-0000-0000-0000-00000000000b'
\set carol '00000000-0000-0000-0000-00000000000c'
\set eve   '00000000-0000-0000-0000-00000000000e'

begin;

insert into auth.users (id, email, email_confirmed_at) values (:'eve', 'eve@example.com', now());

-- Alice crée Léa, la partage avec Bob (parent) et Carol (nounou), et note de tout.
select test_as(:'alice');
insert into babies (name) values ('Léa') returning id as id \gset lea_
insert into events (baby_id, kind, started_at) values (:'lea_id', 'sleep', now() - interval '2 hours');
insert into measurements (baby_id, measured_on, weight_g) values (:'lea_id', '2026-10-01', 4200);
insert into vaccinations (baby_id, code, given_on) values (:'lea_id', 'hexa-1', '2026-10-02');
insert into milk_bags (baby_id, pumped_at, volume_ml, storage) values (:'lea_id', now(), 120, 'fridge');
select count(*) from invite_parent(:'lea_id', 'bob@example.com') \gset i1_
select count(*) from invite_parent(:'lea_id', 'carol@example.com', 'nanny') \gset i2_
-- Alice a aussi un 2e bébé, Noé, qu'elle suit seule (Dollo+ offert au lancement).
insert into babies (name) values ('Noé') returning id as id \gset noe_
insert into events (baby_id, kind, started_at) values (:'noe_id', 'sleep', now());
select test_as(:'bob');
select count(*) from accept_invitations() \gset a1_
select test_as(:'carol');
select count(*) from accept_invitations() \gset a2_

-- Eve suit seule son bébé, avec une nounou (Carol) : une nounou n'hérite jamais.
reset role;
insert into entitlements (user_id, plan, status, stripe_ref) values (:'eve', 'lifetime', 'active', 'cs_eve');
select test_as(:'eve');
insert into babies (name) values ('Zoé') returning id as id \gset zoe_
select count(*) from invite_parent(:'zoe_id', 'carol@example.com', 'nanny') \gset i3_
select test_as(:'carol');
select count(*) from accept_invitations() \gset a3_

-- 1. Réservé au serveur
select test_as(:'alice');
select expect_error('un client ne peut pas préparer une suppression', format('select * from prepare_account_deletion(%L)', :'bob'), 'permission denied');
select test_as(null);
select expect_error('anon non plus', format('select * from prepare_account_deletion(%L)', :'alice'), 'permission denied');

-- 2. Suppression du compte d'Alice (comme la fonction delete-account : préparation puis suppression)
reset role;
set local role service_role;
select expect_count('Léa gardée, Noé supprimé', format($q$select count(*) from prepare_account_deletion(%L) where (baby_id = %L and kept) or (baby_id = %L and not kept)$q$, :'alice', :'lea_id', :'noe_id'), 2);
reset role;
delete from auth.users where id = :'alice';

select test_as(:'bob');
select expect_count('Bob garde Léa', format('select count(*) from babies where id = %L', :'lea_id'), 1);
select expect_count('…avec tout le journal', format('select count(*) from events where baby_id = %L', :'lea_id'), 1);
select expect_count('…les mesures', format('select count(*) from measurements where baby_id = %L and created_by is null', :'lea_id'), 1);
select expect_count('…les vaccins', format('select count(*) from vaccinations where baby_id = %L and created_by is null', :'lea_id'), 1);
select expect_count('…le stock de lait', format('select count(*) from milk_bags where baby_id = %L and created_by is null', :'lea_id'), 1);
select expect_count('Bob devient propriétaire', format($q$select count(*) from list_members(%L) where user_id = %L and role = 'owner'$q$, :'lea_id', :'bob'), 1);
select expect_count('…et peut gérer le partage', format($q$select count(*) from (select remove_member(%L, %L)) x$q$, :'lea_id', :'carol'), 1);
select expect_count('Bob peut renommer Léa', format($q$with u as (update babies set name = 'Léa M.' where id = %L returning 1) select count(*) from u$q$, :'lea_id'), 1);
reset role;
select expect_count('Noé (suivi par Alice seule) supprimé avec son journal', format('select count(*) from babies b full join events e on e.baby_id = b.id where b.id = %L or e.baby_id = %L', :'noe_id', :'noe_id'), 0);
select expect_count('plus aucune trace d''Alice', format($q$select (select count(*) from baby_members where user_id = %1$L) + (select count(*) from baby_invitations where invited_by = %1$L) + (select count(*) from entitlements where user_id = %1$L)$q$, :'alice'), 0);

-- 3. Compte seul avec une nounou : le bébé part avec le compte, la nounou perd l'accès
set local role service_role;
select expect_count('Zoé non transmise à la nounou', format('select count(*) from prepare_account_deletion(%L) where not kept', :'eve'), 1);
reset role;
delete from auth.users where id = :'eve';
select test_as(:'carol');
select expect_count('la nounou ne voit plus Zoé', format('select count(*) from babies where id = %L', :'zoe_id'), 0);
reset role;
select expect_count('droits Dollo+ d''Eve supprimés', $q$select count(*) from entitlements where stripe_ref = 'cs_eve'$q$, 0);

-- 4. Un parent invité (pas propriétaire) supprime son compte : rien d'autre ne bouge
set local role service_role;
select expect_count('Bob seul propriétaire de Léa : rien à transmettre', format('select count(*) from prepare_account_deletion(%L) where not kept', :'carol'), 0);
reset role;

do $$ begin raise notice '=== TOUS LES TESTS DE SUPPRESSION DE COMPTE SONT PASSÉS ==='; end $$;
rollback;
