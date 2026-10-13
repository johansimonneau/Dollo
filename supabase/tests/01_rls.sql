\set ON_ERROR_STOP on
\set alice '00000000-0000-0000-0000-00000000000a'
\set bob   '00000000-0000-0000-0000-00000000000b'
\set carol '00000000-0000-0000-0000-00000000000c'

begin;

-- 1. Alice crée un bébé (insert ... returning) : le trigger la fait « owner »
select test_as(:'alice');
insert into babies (name, birth_date) values ('Léa', '2026-09-20') returning id as id, invite_code as code \gset baby_
select expect_count('Alice est owner de son bébé', format($q$select count(*) from baby_members where baby_id = %L and user_id = %L and role = 'owner'$q$, :'baby_id', :'alice'), 1);

-- 2. Contraintes d'intégrité des événements
insert into events (baby_id, kind, started_at, side) values (:'baby_id', 'breast', now() - interval '30 min', 'left');
insert into events (baby_id, kind, started_at, ended_at, diaper_type) values (:'baby_id', 'diaper', now(), now(), 'both');
insert into events (baby_id, kind, started_at, amount_ml) values (:'baby_id', 'bottle', now(), 90);
insert into events (baby_id, kind, started_at) values (:'baby_id', 'sleep', now() - interval '10 min');
select expect_error('tétée sans sein refusée', format($q$insert into events (baby_id, kind, started_at) values (%L, 'breast', now())$q$, :'baby_id'), 'events_kind_fields');
select expect_error('biberon avec un sein refusé', format($q$insert into events (baby_id, kind, started_at, side) values (%L, 'bottle', now(), 'left')$q$, :'baby_id'), 'events_kind_fields');
select expect_error('couche sans type refusée', format($q$insert into events (baby_id, kind, started_at) values (%L, 'diaper', now())$q$, :'baby_id'), 'events_kind_fields');
select expect_error('fin avant début refusée', format($q$insert into events (baby_id, kind, started_at, ended_at) values (%L, 'sleep', now(), now() - interval '1 h')$q$, :'baby_id'), 'events_end_after_start');
select expect_error('biberon 5 L refusé', format($q$insert into events (baby_id, kind, started_at, amount_ml) values (%L, 'bottle', now(), 5000)$q$, :'baby_id'), 'check');
select expect_error('created_by usurpé refusé', format($q$insert into events (baby_id, kind, started_at, diaper_type, created_by) values (%L, 'diaper', now(), 'pee', %L)$q$, :'baby_id', :'bob'), 'row-level security');

-- 3. Carol (étrangère) ne voit et ne touche à rien
select test_as(:'carol');
select expect_count('Carol ne voit pas le bébé', 'select count(*) from babies', 0);
select expect_count('Carol ne voit pas les événements', 'select count(*) from events', 0);
select expect_count('Carol ne voit pas les membres', 'select count(*) from baby_members', 0);
select expect_error('Carol ne peut pas écrire chez Alice', format($q$insert into events (baby_id, kind, started_at, diaper_type) values (%L, 'diaper', now(), 'pee')$q$, :'baby_id'), 'row-level security');
select expect_error('Carol ne peut pas s''ajouter comme membre', format($q$insert into baby_members (baby_id, user_id) values (%L, %L)$q$, :'baby_id', :'carol'), 'row-level security');
update events set note = 'piraté' where baby_id = :'baby_id';
delete from events where baby_id = :'baby_id';
delete from babies where id = :'baby_id';
select test_as(:'alice');
select expect_count('rien n''a été modifié/supprimé par Carol', 'select count(*) from events where note is null', 4);
select expect_count('le bébé existe toujours', 'select count(*) from babies', 1);

-- Carol ne peut pas créer un bébé au nom d'Alice
select test_as(:'carol');
select expect_error('Carol ne peut pas créer un bébé au nom d''Alice', format($q$insert into babies (name, created_by) values ('Intrus', %L)$q$, :'alice'), 'row-level security');

-- 4. Bob rejoint avec le code (saisi en minuscules, avec un tiret : le code est normalisé)
select test_as(:'bob');
select expect_count('Bob ne voit rien avant de rejoindre', 'select count(*) from events', 0);
select expect_error('code invalide refusé', $$select join_baby('ZZZZZZZZZZ')$$, 'invalid_code');
select expect_error('code vide refusé', $$select join_baby('')$$, 'invalid_code');
select join_baby(lower(substr(:'baby_code', 1, 5)) || '-' || lower(substr(:'baby_code', 6))) \gset joined_
select expect_count('Bob voit le bébé', 'select count(*) from babies', 1);
select expect_count('Bob voit les 4 événements', 'select count(*) from events', 4);
select expect_count('Bob voit les 2 membres', 'select count(*) from baby_members', 2);
select expect_count('rejoindre deux fois ne duplique pas', $$select count(*) from (select join_baby(invite_code) from babies) t, baby_members$$, 2);

-- 5. Bob (co-parent) peut journaliser, corriger, supprimer
insert into events (baby_id, kind, started_at, diaper_type, note) values (:'baby_id', 'diaper', now(), 'poop', 'jaune moutarde');
select expect_count('created_by = Bob par défaut', format($q$select count(*) from events where baby_id = %L and note = 'jaune moutarde' and created_by = %L$q$, :'baby_id', :'bob'), 1);
update events set note = 'corrigé par Bob' where kind = 'bottle';
select expect_count('Bob a pu corriger un événement d''Alice', $$select count(*) from events where note = 'corrigé par Bob'$$, 1);
delete from events where note = 'jaune moutarde';
select expect_count('Bob a pu supprimer', 'select count(*) from events', 4);

-- 6. Droits de colonnes et rôle owner
select expect_error('Bob ne peut pas changer le code', format($q$update babies set invite_code = 'HACKED' where id = %L$q$, :'baby_id'), 'permission denied');
select expect_error('Bob ne peut pas changer le créateur', format($q$update babies set created_by = %L where id = %L$q$, :'bob', :'baby_id'), 'permission denied');
update babies set name = 'Léa-Rose' where id = :'baby_id';
select expect_count('un membre peut renommer', $$select count(*) from babies where name = 'Léa-Rose'$$, 1);
delete from babies where id = :'baby_id';
select expect_count('Bob (non owner) ne peut pas supprimer le bébé', 'select count(*) from babies', 1);
select expect_error('Bob ne peut pas régénérer le code', format($q$select regenerate_invite_code(%L)$q$, :'baby_id'), 'forbidden');

-- 7. Isoler un autre bébé d'Alice : Bob ne peut pas y déplacer un événement
select test_as(:'alice');
insert into babies (name) values ('Tom') returning id as id \gset tom_
select test_as(:'bob');
select expect_error('Bob ne peut pas déplacer un événement vers un bébé non partagé', format($q$update events set baby_id = %L where kind = 'bottle'$q$, :'tom_id'), 'row-level security');
select expect_count('Bob ne voit pas Tom', format($q$select count(*) from babies where id = %L$q$, :'tom_id'), 0);

-- 8. Régénération du code par Alice : l'ancien code ne marche plus
select test_as(:'alice');
select regenerate_invite_code(:'baby_id') as newcode \gset
select expect_count('le code a changé', format($q$select count(*) from babies where id = %L and invite_code = %L$q$, :'baby_id', :'newcode'), 1);
select test_as(:'carol');
select expect_error('l''ancien code ne marche plus', format($q$select join_baby(%L)$q$, :'baby_code'), 'invalid_code');
select join_baby(:'newcode') \gset carolj_
select expect_count('Carol voit le bébé avec le nouveau code', 'select count(*) from babies where name = ''Léa-Rose''', 1);
delete from baby_members where user_id = :'carol';
select expect_count('Carol a quitté : plus rien de visible', 'select count(*) from events', 0);

-- 9. Anonyme : aucun accès
select test_as(null);
select expect_error('anon ne lit pas les bébés', 'select count(*) from babies', 'permission denied');
select expect_error('anon ne lit pas les événements', 'select count(*) from events', 'permission denied');
select expect_error('anon ne peut pas appeler join_baby', format($q$select join_baby(%L)$q$, :'newcode'), 'permission denied');
select expect_error('anon ne peut pas appeler is_baby_member via l''API', format($q$select is_baby_member(%L)$q$, :'baby_id'), 'permission denied');
select expect_error('anon ne peut pas appeler la fonction de trigger', 'select add_creator_as_owner()', 'permission denied');
select expect_error('anon ne peut pas appeler touch_updated_at', 'select touch_updated_at()', 'permission denied');
select test_as(:'bob');
select expect_error('un utilisateur connecté ne peut pas appeler la fonction de trigger', 'select add_creator_as_owner()', 'permission denied');
select expect_error('un utilisateur connecté ne peut pas appeler touch_updated_at', 'select touch_updated_at()', 'permission denied');
select expect_count('mais is_baby_member reste utilisable (RLS) par un utilisateur connecté', format($q$select count(*) from (select is_baby_member(%L)) t$q$, :'baby_id'), 1);
select test_as(null);

-- 10. Suppression du bébé par Alice (owner) : cascade sur les événements et membres
select test_as(:'alice');
delete from babies where id = :'baby_id';
reset role;
select expect_count('cascade : plus d''événements', format($q$select count(*) from events where baby_id = %L$q$, :'baby_id'), 0);
select expect_count('cascade : plus de membres', format($q$select count(*) from baby_members where baby_id = %L$q$, :'baby_id'), 0);

do $$ begin raise notice '=== TOUS LES TESTS RLS SONT PASSÉS ==='; end $$;
rollback;
