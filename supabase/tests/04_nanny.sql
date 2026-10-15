\set ON_ERROR_STOP on
\set alice '00000000-0000-0000-0000-00000000000a'
\set bob   '00000000-0000-0000-0000-00000000000b'
\set carol '00000000-0000-0000-0000-00000000000c'

begin;

-- Alice crée Léa, avec un événement récent et un ancien (3 jours), puis invite Carol comme nounou
select test_as(:'alice');
insert into babies (name, birth_date) values ('Léa', '2026-09-20') returning id as id, invite_code as code \gset baby_
insert into events (baby_id, kind, started_at, amount_ml, note) values (:'baby_id', 'bottle', now() - interval '2 hours', 120, 'récent') returning id as id \gset recent_
insert into events (baby_id, kind, started_at, amount_ml, note) values (:'baby_id', 'bottle', now() - interval '3 days', 90, 'ancien') returning id as id \gset old_
select expect_error('rôle d''invitation inconnu refusé', format($q$select invite_parent(%L, 'x@example.com', 'admin')$q$, :'baby_id'), 'invalid_role');
select invite_parent(:'baby_id', 'carol@example.com', 'nanny') \gset inv_
select expect_count('invitation enregistrée avec le rôle nounou', format($q$select count(*) from baby_invitations where baby_id = %L and email = 'carol@example.com' and role = 'nanny'$q$, :'baby_id'), 1);

-- Carol accepte : elle devient nounou (pas parent), et ne reçoit que l'identifiant + le prénom
select test_as(:'carol');
select expect_count('accept_invitations renvoie le bébé', 'select count(*) from accept_invitations()', 1);
reset role;
select expect_count('Carol est membre avec le rôle nanny', format($q$select count(*) from baby_members where baby_id = %L and user_id = %L and role = 'nanny'$q$, :'baby_id', :'carol'), 1);

-- 1. Ce que la nounou voit du bébé
select test_as(:'carol');
select expect_count('la table babies ne lui montre rien (ni date de naissance, ni code)', 'select count(*) from babies', 0);
select expect_count('list_my_babies : Léa, rôle nanny', format($q$select count(*) from list_my_babies() where id = %L and name = 'Léa' and role = 'nanny'$q$, :'baby_id'), 1);
select expect_count('list_my_babies : sans date de naissance ni code', format($q$select count(*) from list_my_babies() where id = %L and birth_date is null and invite_code is null$q$, :'baby_id'), 1);
update babies set name = 'X' where id = :'baby_id'; -- RLS : 0 ligne touchée
reset role;
select expect_count('le bébé n''a pas été renommé', format($q$select count(*) from babies where id = %L and name = 'Léa'$q$, :'baby_id'), 1);

-- 2. Événements : fenêtre de 48 h
select test_as(:'carol');
select expect_count('elle voit l''événement récent', format($q$select count(*) from events where id = %L$q$, :'recent_id'), 1);
select expect_count('elle ne voit pas l''événement de 3 jours', format($q$select count(*) from events where id = %L$q$, :'old_id'), 0);
insert into events (baby_id, kind, started_at, diaper_type) values (:'baby_id', 'diaper', now() - interval '10 min', 'pee') returning id as id \gset mine_
select expect_count('elle ajoute un événement (created_by = elle)', format($q$select count(*) from events where id = %L and created_by = %L$q$, :'mine_id', :'carol'), 1);
select expect_error('elle ne peut pas antidater au-delà de 48 h', format($q$insert into events (baby_id, kind, started_at) values (%L, 'diaper', now() - interval '3 days')$q$, :'baby_id'), 'row-level security');
update events set note = 'corrigé' where id = :'mine_id';
select expect_count('elle corrige le sien', format($q$select count(*) from events where id = %L and note = 'corrigé'$q$, :'mine_id'), 1);
select expect_error('elle ne modifie pas un événement d''Alice', format($q$update events set note = 'piraté' where id = %L$q$, :'recent_id'), 'forbidden');
select expect_error('…ni sa quantité', format($q$update events set amount_ml = 10 where id = %L$q$, :'recent_id'), 'forbidden');
delete from events where id = :'recent_id'; -- RLS : 0 ligne supprimée
select expect_error('elle ne peut pas déplacer le sien hors de la fenêtre', format($q$update events set started_at = now() - interval '5 days' where id = %L$q$, :'mine_id'), 'row-level security');
reset role;
select expect_count('l''événement d''Alice n''a été ni modifié ni supprimé', format($q$select count(*) from events where id = %L and note = 'récent'$q$, :'recent_id'), 1);
select test_as(:'carol');
delete from events where id = :'mine_id';
reset role;
select expect_count('elle supprime le sien', format($q$select count(*) from events where id = %L$q$, :'mine_id'), 0);

-- Dodo lancé par Alice : la nounou peut le terminer (réveil), et seulement ça
select test_as(:'alice');
insert into events (baby_id, kind, started_at) values (:'baby_id', 'sleep', now() - interval '1 hour') returning id as id \gset nap_
select test_as(:'carol');
update events set ended_at = now() where id = :'nap_id';
reset role;
select expect_count('la nounou a terminé le dodo lancé par Alice', format($q$select count(*) from events where id = %L and ended_at is not null$q$, :'nap_id'), 1);
select test_as(:'carol');
select expect_error('…mais ne peut pas en changer le début', format($q$update events set started_at = now() - interval '2 hours', ended_at = now() where id = %L$q$, :'nap_id'), 'forbidden');

-- Auteur et bébé d'un événement : non modifiables (sinon « par la nounou » pourrait être effacé, ou un événement déplacé)
insert into events (baby_id, kind, started_at, diaper_type) values (:'baby_id', 'diaper', now() - interval '5 min', 'pee') returning id as id \gset own_
select expect_error('la nounou ne peut pas attribuer sa saisie à Alice', format($q$update events set created_by = %L where id = %L$q$, :'alice', :'own_id'), 'permission denied');
select test_as(:'alice');
select expect_error('un parent non plus', format($q$update events set created_by = %L where id = %L$q$, :'alice', :'own_id'), 'permission denied');
select expect_error('…ni déplacer un événement vers un autre bébé', format($q$update events set baby_id = gen_random_uuid() where id = %L$q$, :'own_id'), 'permission denied');
select test_as(:'carol');

-- 3. Rien sur les parents
select test_as(:'carol');
select expect_count('elle ne voit pas les autres membres', format($q$select count(*) from baby_members where baby_id = %L and user_id <> %L$q$, :'baby_id', :'carol'), 0);
select expect_error('list_members refusé', format($q$select * from list_members(%L)$q$, :'baby_id'), 'forbidden');
select expect_count('elle ne voit pas les invitations', 'select count(*) from baby_invitations', 0);
select expect_error('elle ne peut inviter personne', format($q$select invite_parent(%L, 'x@example.com')$q$, :'baby_id'), 'forbidden');
select expect_error('elle ne peut pas inviter une autre nounou', format($q$select invite_parent(%L, 'x@example.com', 'nanny')$q$, :'baby_id'), 'forbidden');
select expect_error('elle ne peut pas renouveler le code', format($q$select regenerate_invite_code(%L)$q$, :'baby_id'), 'forbidden');
select expect_error('elle ne peut retirer personne', format($q$select remove_member(%L, %L)$q$, :'baby_id', :'alice'), 'forbidden');

-- 4. Les parents gardent tout, et voient ce qu'a noté la nounou
select test_as(:'alice');
select expect_count('Alice voit l''ancien événement', format($q$select count(*) from events where id = %L$q$, :'old_id'), 1);
select expect_count('Alice voit la nounou dans les membres', format($q$select count(*) from list_members(%L) where role = 'nanny'$q$, :'baby_id'), 1);
select expect_count('list_my_babies côté parent : code et date présents', format($q$select count(*) from list_my_babies() where id = %L and role = 'owner' and invite_code is not null and birth_date is not null$q$, :'baby_id'), 1);

-- 5. Un co-parent (Bob, rejoint par code) reste parent
select test_as(:'bob');
select id from join_baby(:'baby_code') \gset j_
select expect_count('Bob voit l''ancien événement', format($q$select count(*) from events where id = %L$q$, :'old_id'), 1);
select expect_count('Bob peut inviter', format($q$select count(*) from invite_parent(%L, 'mamie@example.com')$q$, :'baby_id'), 1);

-- 6. Retrait de la nounou par le propriétaire : plus aucun accès
select test_as(:'alice');
select remove_member(:'baby_id', :'carol');
select test_as(:'carol');
select expect_count('nounou retirée : plus de bébé', 'select count(*) from list_my_babies()', 0);
select expect_count('nounou retirée : plus d''événements', format($q$select count(*) from events where baby_id = %L$q$, :'baby_id'), 0);

do $$ begin raise notice '=== TOUS LES TESTS NOUNOU SONT PASSÉS ==='; end $$;
rollback;
